import { db, humanApproval, taskHandoff, workflowRun } from "@/db";
import { messageRepo } from "@/db/repositories";
import {
  DurableWorkflowEventStore,
  DurableWorkflowStore,
} from "@/infrastructure/drizzle/durable-workflow-store";
import type { CustomUIMessageChunk, WorkflowTrace } from "@/lib/types";
import {
  createOrchestrationWorkflow,
  type OrchestrationWorkflowState,
} from "@/workflows/orchestrate/orchestrate";
import type { OrchestrationInput } from "@/workflows/orchestrate/types";
import {
  InMemoryEventBus,
  WorkflowEngine,
  type WorkflowEvent,
} from "@circulo-ai/wf";
import { eq } from "drizzle-orm";
import {
  closeWorkflowOutputChannel,
  createWorkflowOutputChannel,
  getWorkflowOutputChannel,
  publishWorkflowChunk,
} from "./output-channel";

type WorkflowOutput = OrchestrationWorkflowState;

const engine = new WorkflowEngine<
  Record<string, never>,
  OrchestrationInput,
  WorkflowOutput
>({
  workflowStore: new DurableWorkflowStore<
    Record<string, never>,
    OrchestrationInput,
    WorkflowOutput
  >(
    () => createOrchestrationWorkflow().steps,
    (input) => ({
      chatId: input.chatId,
      userId: input.actor.userId,
      organizationId: input.actor.organizationId,
    }),
  ),
  eventStore: new DurableWorkflowEventStore<WorkflowOutput>(),
  eventBus: new InMemoryEventBus<WorkflowOutput>(),
  defaultRetries: 2,
  defaultTimeout: 10 * 60 * 1000,
  workflowTimeout: 30 * 60 * 1000,
  maxConcurrentWorkflows: 20,
  autoResumeIntervalMs: 5_000,
});

/** The workflow engine boundary and durable chat projection. */
export class WorkflowRunService {
  private readonly assistantMessageIds = new Map<string, string>();
  private readonly startedAt = new Map<string, number>();
  private readonly subscriptions = new Map<string, () => void>();
  private readonly hydratedRuns = new Set<string>();
  private readonly eventPollers = new Map<
    string,
    ReturnType<typeof setInterval>
  >();
  private readonly handledEventIds = new Map<string, Set<string>>();
  private readonly processingEvents = new Map<string, Promise<void>>();

  constructor() {
    // A process can stop between two workflow steps. Reclaim those runs on
    // startup; the database lock prevents two API instances from executing
    // the same run concurrently.
    void this.recoverInterruptedRuns();
  }

  async start(input: OrchestrationInput): Promise<{ runId: string }> {
    const definition = {
      ...createOrchestrationWorkflow(),
      // The client message id is the request identity. Retries from a dropped
      // HTTP connection must reconnect to the same durable run.
      ...(input.messageId
        ? { idempotencyKey: `chat:${input.chatId}:message:${input.messageId}` }
        : {}),
    };
    const runId = await engine.createWorkflow(definition, input);
    this.attachRun(runId, input, definition);
    this.hydratedRuns.add(runId);

    return { runId };
  }

  async run(runId: string): Promise<void> {
    try {
      await engine.run(runId);
    } catch (error) {
      await this.syncRunStatus(runId, "failed");
      throw error;
    }
  }

  async pause(runId: string): Promise<void> {
    await engine.pause(runId);
  }

  async resume(runId: string): Promise<void> {
    const workflow = await engine.getWorkflow(runId);
    if (!workflow) return;
    if (!this.subscriptions.has(runId)) {
      this.attachRun(
        runId,
        workflow.input,
        createOrchestrationWorkflow(),
        workflow.executionStartedAt ?? workflow.createdAt,
      );
    }
    await this.replayPersistedEvents(runId, workflow.input);
    await engine.resume(runId);
  }

  async getReadable(
    runId: string,
    startIndex?: number,
  ): Promise<ReadableStream<CustomUIMessageChunk>> {
    let channel = getWorkflowOutputChannel(runId);
    const workflow = await engine.getWorkflow(runId);
    if (!workflow) throw new Error(`Workflow run ${runId} is not available`);

    // A completed stream can outlive the HTTP connection. Reconnects must get
    // a fresh channel; returning the already-closed channel would replay only
    // whatever happened to be buffered before the disconnect.
    if (!channel || channel.isClosed) {
      this.attachRun(
        runId,
        workflow.input,
        createOrchestrationWorkflow(),
        workflow.executionStartedAt ?? workflow.createdAt,
      );
      await this.replayPersistedEvents(runId, workflow.input);
      channel = getWorkflowOutputChannel(runId);
    }
    await this.replayPersistedEvents(runId, workflow.input);

    // Durable workflow state and the persisted assistant projection are the
    // source of truth once the process has already completed. Reconstruct the
    // terminal UI stream so a reload cannot remain stuck in "thinking".
    if (workflow.state === "completed" || workflow.state === "failed") {
      await this.replayTerminalResult(runId, workflow);
      channel = getWorkflowOutputChannel(runId);
    }
    if (!channel) throw new Error(`Workflow run ${runId} is not available`);
    return channel.createReadable(startIndex);
  }

  private async replayTerminalResult(
    runId: string,
    workflow: Awaited<ReturnType<typeof engine.getWorkflow>>,
  ): Promise<void> {
    if (!workflow || getWorkflowOutputChannel(runId)?.isClosed) return;

    const persisted = await messageRepo.findWorkflowMessage(
      workflow.input.chatId,
      runId,
    );
    if (!persisted) return;

    const tracePart = persisted.parts?.find(
      (part) =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "data-workflowTrace",
    ) as { data?: WorkflowTrace } | undefined;
    const trace = tracePart?.data;
    if (trace) {
      publishWorkflowChunk(runId, {
        type: "data-workflowTrace",
        data: trace,
      });
    }

    const text = persisted.content ?? "";
    if (workflow.state === "failed") {
      publishWorkflowChunk(runId, {
        type: "data-workflowError",
        data: { error: trace?.error ?? text },
      });
    }
    publishWorkflowChunk(runId, {
      type: "data-workflowCompleted",
      data: {
        success:
          workflow.state === "completed" && trace?.status === "completed",
        executionTimeMs: trace?.executionTimeMs ?? 0,
      },
    });
    publishTextResult(runId, text, persisted.id);
    this.close(runId);
  }

  async getEvents(runId: string) {
    return engine.getEvents(runId);
  }

  private async handleEvent(
    runId: string,
    input: OrchestrationInput,
    stepNames: Map<string, string>,
    event: WorkflowEvent<WorkflowOutput>,
  ): Promise<void> {
    const handled = this.handledEventIds.get(runId) ?? new Set<string>();
    if (handled.has(event.id)) return;

    const inFlight = this.processingEvents.get(event.id);
    if (inFlight) {
      await inFlight;
      return;
    }

    const processing = this.applyEvent(runId, input, stepNames, event).then(
      () => {
        if (!this.subscriptions.has(runId)) return;
        handled.add(event.id);
        this.handledEventIds.set(runId, handled);
      },
    );
    this.processingEvents.set(event.id, processing);
    try {
      await processing;
    } finally {
      this.processingEvents.delete(event.id);
    }
  }

  private async applyEvent(
    runId: string,
    input: OrchestrationInput,
    stepNames: Map<string, string>,
    event: WorkflowEvent<WorkflowOutput>,
  ): Promise<void> {
    if ((event.eventType as string) === "ui.chunk") {
      publishWorkflowChunk(
        runId,
        event.payload as unknown as CustomUIMessageChunk,
      );
      return;
    }

    switch (event.eventType) {
      case "workflow.started":
        await this.syncRunStatus(runId, "running");
        publishWorkflowChunk(runId, {
          type: "data-workflowStarted",
          data: {
            workflowId: runId,
            chatId: input.chatId,
            messages: input.messages,
          },
        });
        return;

      case "workflow.step.completed": {
        const payload = event.payload as {
          stepId: string;
          data: WorkflowOutput;
        };
        const stepName = stepNames.get(payload.stepId);
        const state = payload.data;

        if (stepName === "classify-request" && state.classification) {
          publishWorkflowChunk(runId, {
            type: "data-workflowClassification",
            data: state.classification,
          });
        }
        if (stepName === "plan-execution" && state.plan) {
          publishWorkflowChunk(runId, {
            type: "data-workflowPlan",
            data: state.plan,
          });
        }
        if (stepName === "aggregate-results" && state.finalResult) {
          publishWorkflowChunk(runId, {
            type: "data-workflowAggregated",
            data: state.finalResult,
          });
        }
        return;
      }

      case "workflow.resumed":
        await this.syncRunStatus(runId, "running");
        return;

      case "workflow.paused":
        await this.syncRunStatus(runId, "paused");
        {
          const workflow = await engine.getWorkflow(runId);
          const state = workflow?.output;
          if (state?.startedAt) {
            const trace = await this.buildTrace({
              runId,
              input,
              state,
              status: "paused",
              executionTimeMs: Date.now() - state.startedAt,
            });
            const pendingApproval = trace.approvals?.find(
              (approval) => approval.status === "pending",
            );
            const text = pendingApproval
              ? `Waiting for human approval: ${pendingApproval.title}`
              : "The workflow is paused and waiting for an external decision.";
            await this.persistWorkflowMessage(
              input.chatId,
              text,
              trace,
              state,
              input.messageId,
            );
            publishWorkflowChunk(runId, {
              type: "data-workflowTrace",
              data: trace,
            });
          }
        }
        publishWorkflowChunk(runId, {
          type: "data-workflowPaused",
          data: { workflowId: runId },
        });
        // Keep the channel open. A connected chat can receive the resumed
        // workflow without polling, while a reconnecting client can attach to
        // the same durable run before the approval is decided.
        return;

      case "workflow.waiting": {
        // Approval requests use a durable wait step after agent execution has
        // committed its result. Project the trace at the wait boundary so a
        // reload sees the pending approval without rerunning the agent.
        await this.syncRunStatus(runId, "paused");
        const workflow = await engine.getWorkflow(runId);
        const state = workflow?.output;
        if (state?.startedAt) {
          const trace = await this.buildTrace({
            runId,
            input,
            state,
            status: "paused",
            executionTimeMs: Date.now() - state.startedAt,
          });
          const pendingApproval = trace.approvals?.find(
            (approval) => approval.status === "pending",
          );
          const text = pendingApproval
            ? `Waiting for human approval: ${pendingApproval.title}`
            : "The workflow is paused and waiting for an external decision.";
          await this.persistWorkflowMessage(
            input.chatId,
            text,
            trace,
            state,
            input.messageId,
          );
          publishWorkflowChunk(runId, {
            type: "data-workflowTrace",
            data: trace,
          });
        }
        publishWorkflowChunk(runId, {
          type: "data-workflowPaused",
          data: { workflowId: runId },
        });
        return;
      }

      case "workflow.completed": {
        await this.syncRunStatus(runId, "completed");
        const state = (event.payload as { output: WorkflowOutput }).output;
        const finalResult = state.finalResult;
        const text =
          finalResult?.detailedResponse ??
          state.failureReason ??
          "The workflow completed without a response.";
        const success = finalResult?.overallSuccess ?? false;
        const executionTimeMs = Date.now() - state.startedAt;
        const trace = await this.buildTrace({
          runId,
          input,
          state,
          status: success ? "completed" : "failed",
          executionTimeMs,
        });

        await this.persistWorkflowMessage(
          input.chatId,
          text,
          trace,
          state,
          input.messageId,
        );
        publishWorkflowChunk(runId, {
          type: "data-workflowTrace",
          data: trace,
        });
        publishWorkflowChunk(runId, {
          type: "data-workflowCompleted",
          data: { success, executionTimeMs },
        });
        publishTextResult(runId, text, this.assistantMessageIds.get(runId));
        this.close(runId);
        return;
      }

      case "workflow.failed": {
        await this.syncRunStatus(runId, "failed");
        const message = toWorkflowErrorMessage(
          (event.payload as { error?: unknown }).error,
        );
        const started = this.startedAt.get(runId) ?? Date.now();
        const trace: WorkflowTrace = {
          workflowId: runId,
          status: "failed",
          startedAt: new Date(started).toISOString(),
          completedAt: new Date().toISOString(),
          executionTimeMs: Date.now() - started,
          agents: [],
          error: message,
        };
        await this.addWorkflowArtifacts(trace, input.chatId, runId);
        const text = `The orchestration failed: ${message}`;
        await this.persistWorkflowMessage(
          input.chatId,
          text,
          trace,
          undefined,
          input.messageId,
        );
        publishWorkflowChunk(runId, {
          type: "data-workflowTrace",
          data: trace,
        });
        publishWorkflowChunk(runId, {
          type: "data-workflowError",
          data: { error: message },
        });
        publishWorkflowChunk(runId, {
          type: "data-workflowCompleted",
          data: { success: false, executionTimeMs: trace.executionTimeMs ?? 0 },
        });
        publishTextResult(runId, text, this.assistantMessageIds.get(runId));
        this.close(runId);
        return;
      }

      default:
        return;
    }
  }

  private async buildTrace(params: {
    runId: string;
    input: OrchestrationInput;
    state: WorkflowOutput;
    status: "paused" | "completed" | "failed";
    executionTimeMs: number;
  }): Promise<WorkflowTrace> {
    const { runId, input, state, status, executionTimeMs } = params;
    const trace: WorkflowTrace = {
      workflowId: runId,
      status,
      startedAt: new Date(state.startedAt).toISOString(),
      completedAt: status === "paused" ? undefined : new Date().toISOString(),
      executionTimeMs,
      classification: state.classification,
      plan: state.plan,
      agents: (state.agentResults ?? []).map((result) => ({
        agentId: result.agentId,
        agentName: result.agentName,
        model: result.model,
        avatarUrl: result.avatarUrl,
        task: result.task,
        status: result.success
          ? "completed"
          : result.error?.startsWith("Skipped")
            ? "skipped"
            : "failed",
        startedAt: result.startTime.toISOString(),
        completedAt: result.endTime.toISOString(),
        durationMs: result.durationMs,
        output: result.output,
        error: result.error,
        toolCalls: result.toolCalls,
      })),
      aggregated: Boolean(state.finalResult),
      error: state.failureReason,
    };
    await this.addWorkflowArtifacts(trace, input.chatId, runId);
    return trace;
  }

  private async addWorkflowArtifacts(
    trace: WorkflowTrace,
    chatId: string,
    workflowId: string,
  ): Promise<void> {
    const [approvals, handoffs] = await Promise.all([
      db.query.humanApproval.findMany({
        where: eq(humanApproval.workflowRunId, workflowId),
      }),
      db.query.taskHandoff.findMany({
        where: eq(taskHandoff.chatId, chatId),
      }),
    ]);

    trace.approvals = approvals.map((approval) => ({
      id: approval.id,
      title: approval.title,
      description: approval.description,
      requestedAction: approval.requestedAction,
      status: approval.status,
    }));
    trace.handoffs = handoffs
      .filter((handoff) => handoff.context?.workflowRunId === workflowId)
      .map((handoff) => ({
        id: handoff.id,
        task: handoff.task,
        status: handoff.status,
        toUserId: handoff.toUserId,
        toAgentId: handoff.toAgentId,
      }));
  }

  private async persistWorkflowMessage(
    chatId: string,
    text: string,
    trace: WorkflowTrace,
    state?: WorkflowOutput,
    sourceMessageId?: string,
  ): Promise<void> {
    // An edit creates a new user-message version and tombstones the old
    // version. A late completion from the old run must never resurrect an
    // assistant response for that superseded branch.
    if (sourceMessageId) {
      const source = await messageRepo.findById(sourceMessageId);
      if (!source || source.isDeleted) return;
    }
    const authorId = trace.agents.at(-1)?.agentId ?? "circulo-default";
    const existingWorkflowMessage = await messageRepo.findWorkflowMessage(
      chatId,
      trace.workflowId,
    );
    const tokenCount = (state?.agentResults ?? []).reduce(
      (total, result) => total + (result.tokenCount ?? 0),
      0,
    );
    const cost = (state?.agentResults ?? []).reduce(
      (total, result) => total + (result.cost ?? 0),
      0,
    );

    const values = {
      content: text,
      parts: [
        { type: "data-workflowTrace", data: trace },
        { type: "text", text },
      ],
      tokenCount,
      cost: cost.toString(),
    };
    if (existingWorkflowMessage) {
      await messageRepo.update(existingWorkflowMessage.id, values);
      return;
    }

    await messageRepo.create({
      id: this.assistantMessageIds.get(trace.workflowId) ?? crypto.randomUUID(),
      chatId,
      authorType: "agent",
      authorId,
      role: "assistant",
      ...values,
      attachments: [],
      isDeleted: false,
    });
  }

  private async syncRunStatus(
    runId: string,
    status: "running" | "paused" | "completed" | "failed",
  ): Promise<void> {
    try {
      await db
        .update(workflowRun)
        .set({
          status,
          updatedAt: new Date(),
          completedAt:
            status === "completed" || status === "failed" ? new Date() : null,
        })
        .where(eq(workflowRun.id, runId));
    } catch (error) {
      console.error("[Workflow Status Sync Error]", { runId, status, error });
    }
  }

  private close(runId: string): void {
    closeWorkflowOutputChannel(runId);
    this.subscriptions.get(runId)?.();
    this.subscriptions.delete(runId);
    const poller = this.eventPollers.get(runId);
    if (poller) clearInterval(poller);
    this.eventPollers.delete(runId);
    this.handledEventIds.delete(runId);
    this.hydratedRuns.delete(runId);
    this.assistantMessageIds.delete(runId);
    this.startedAt.delete(runId);
  }

  private attachRun(
    runId: string,
    input: OrchestrationInput,
    definition = createOrchestrationWorkflow(),
    startedAt = Date.now(),
  ): void {
    if (this.subscriptions.has(runId)) return;
    createWorkflowOutputChannel(runId);
    const stepNames = new Map(
      definition.steps.map((step) => [step.id, step.name]),
    );
    this.assistantMessageIds.set(runId, crypto.randomUUID());
    this.startedAt.set(runId, startedAt);
    const unsubscribe = engine.subscribe(runId, (event) =>
      this.handleEvent(runId, input, stepNames, event),
    );
    this.subscriptions.set(runId, unsubscribe);
    const poller = setInterval(() => {
      void this.pollPersistedEvents(runId, input, stepNames).catch((error) => {
        console.error("[Workflow Event Poll Error]", { runId, error });
      });
    }, 1_000);
    const nodePoller = poller as ReturnType<typeof setInterval> & {
      unref?: () => void;
    };
    nodePoller.unref?.();
    this.eventPollers.set(runId, poller);
  }

  private async pollPersistedEvents(
    runId: string,
    input: OrchestrationInput,
    stepNames: Map<string, string>,
  ): Promise<void> {
    if (!this.subscriptions.has(runId)) return;
    const events = await engine.getEvents(runId);
    for (const event of events) {
      await this.handleEvent(runId, input, stepNames, event);
    }
  }

  private async recoverInterruptedRuns(): Promise<void> {
    try {
      // Reattach before resuming. Without a subscription, an engine auto-
      // resume after a process restart can finish successfully while the
      // durable assistant projection and live stream never receive its
      // lifecycle events.
      const runs = await engine.listWorkflows({ limit: 100 });
      for (const run of runs) {
        if (run.state !== "running" && run.state !== "paused") continue;
        const input = run.input;
        this.attachRun(
          run.id,
          input,
          createOrchestrationWorkflow(),
          run.executionStartedAt,
        );
        await this.replayPersistedEvents(run.id, input);
        if (run.state === "running") {
          void engine.run(run.id).catch((error: unknown) => {
            console.error("[Workflow Recovery Error]", error);
          });
        }
      }
    } catch (error) {
      // Local development may start before PostgreSQL. The normal scheduler
      // already retries; a later process restart will retry recovery too.
      console.warn("[Workflow Recovery Deferred]", error);
    }
  }

  /**
   * Rebuilds the durable lifecycle portion of a stream after a process
   * restart. In-memory agent deltas are intentionally not replayed: the
   * workflow state is the source of truth and the active step will resume
   * from its durable boundary without duplicating a final response.
   */
  private async replayPersistedEvents(
    runId: string,
    input: OrchestrationInput,
  ): Promise<void> {
    if (this.hydratedRuns.has(runId)) return;
    this.hydratedRuns.add(runId);

    const definition = createOrchestrationWorkflow();
    const stepNames = new Map(
      definition.steps.map((step) => [step.id, step.name]),
    );
    const events = await engine.getEvents(runId);

    for (const event of events) {
      const handled = this.handledEventIds.get(runId) ?? new Set<string>();
      if (handled.has(event.id)) continue;
      const inFlight = this.processingEvents.get(event.id);
      if (inFlight) {
        await inFlight;
        continue;
      }

      if ((event.eventType as string) === "ui.chunk") {
        publishWorkflowChunk(
          runId,
          event.payload as unknown as CustomUIMessageChunk,
        );
        handled.add(event.id);
        this.handledEventIds.set(runId, handled);
        continue;
      }

      if (event.eventType === "workflow.started") {
        publishWorkflowChunk(runId, {
          type: "data-workflowStarted",
          data: {
            workflowId: runId,
            chatId: input.chatId,
            messages: input.messages,
          },
        });
        handled.add(event.id);
        this.handledEventIds.set(runId, handled);
        continue;
      }

      if (event.eventType === "workflow.step.completed") {
        const payload = event.payload as {
          stepId?: string;
          data?: WorkflowOutput;
        };
        const state = payload.data;
        const stepName = payload.stepId
          ? stepNames.get(payload.stepId)
          : undefined;
        if (stepName === "classify-request" && state?.classification) {
          publishWorkflowChunk(runId, {
            type: "data-workflowClassification",
            data: state.classification,
          });
        }
        if (stepName === "plan-execution" && state?.plan) {
          publishWorkflowChunk(runId, {
            type: "data-workflowPlan",
            data: state.plan,
          });
        }
        if (stepName === "aggregate-results" && state?.finalResult) {
          publishWorkflowChunk(runId, {
            type: "data-workflowAggregated",
            data: state.finalResult,
          });
        }
        handled.add(event.id);
        this.handledEventIds.set(runId, handled);
        continue;
      }

      if (
        event.eventType === "workflow.paused" ||
        event.eventType === "workflow.waiting"
      ) {
        publishWorkflowChunk(runId, {
          type: "data-workflowPaused",
          data: { workflowId: runId },
        });
        handled.add(event.id);
        this.handledEventIds.set(runId, handled);
      }
    }
  }
}

function publishTextResult(
  runId: string,
  text: string,
  existingMessageId?: string,
): void {
  const messageId = existingMessageId ?? crypto.randomUUID();
  // Every HTTP stream starts with a fresh UI message state, including a
  // reconnect that reuses the durable database message ID. Always announce
  // the text part before its delta or the AI SDK rejects the stream.
  publishWorkflowChunk(runId, { type: "text-start", id: messageId });
  publishWorkflowChunk(runId, {
    type: "text-delta",
    id: messageId,
    delta: text,
  });
  publishWorkflowChunk(runId, { type: "text-end", id: messageId });
  publishWorkflowChunk(runId, { type: "finish", finishReason: "stop" });
}

function toWorkflowErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (typeof error === "object" && error !== null) {
    const value = error as { message?: unknown; error?: unknown };
    if (typeof value.message === "string" && value.message.trim())
      return value.message;
    if (typeof value.error === "string" && value.error.trim())
      return value.error;
  }
  return "The workflow failed for an unknown reason.";
}

export const workflowRunService = new WorkflowRunService();
