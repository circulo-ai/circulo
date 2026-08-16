import type { CustomUIMessageChunk } from "@/lib/types";
import {
  createOrchestrationWorkflow,
  type OrchestrationWorkflowState,
} from "@/workflows/orchestrate/orchestrate";
import type { OrchestrationInput } from "@/workflows/orchestrate/types";
import {
  InMemoryEventBus,
  InMemoryEventStore,
  InMemoryWorkflowStore,
  WorkflowEngine,
  type WorkflowEvent,
} from "@circulo-ai/wf";
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
  workflowStore: new InMemoryWorkflowStore<
    Record<string, never>,
    OrchestrationInput,
    WorkflowOutput
  >(),
  eventStore: new InMemoryEventStore<WorkflowOutput>(),
  eventBus: new InMemoryEventBus<WorkflowOutput>(),
  defaultRetries: 2,
  defaultTimeout: 10 * 60 * 1000,
  workflowTimeout: 30 * 60 * 1000,
  maxConcurrentWorkflows: 20,
  autoResumeIntervalMs: 5_000,
});

export class WorkflowRunService {
  async start(input: OrchestrationInput): Promise<{ runId: string }> {
    const definition = createOrchestrationWorkflow();
    const runId = await engine.createWorkflow(definition, input);
    const channel = createWorkflowOutputChannel(runId);
    const stepNames = new Map(
      definition.steps.map((step) => [step.id, step.name]),
    );

    engine.subscribe(runId, (event) =>
      this.handleEvent(runId, input, stepNames, event),
    );
    // Keep the channel alive for clients that reconnect after the initial HTTP
    // request has completed. The channel is intentionally owned by the
    // process-local runtime; the engine itself remains the source of truth.
    void channel;

    return { runId };
  }

  async run(runId: string): Promise<void> {
    await engine.run(runId);
  }

  getReadable(
    runId: string,
    startIndex?: number,
  ): ReadableStream<CustomUIMessageChunk> {
    const channel = getWorkflowOutputChannel(runId);
    if (!channel) throw new Error(`Workflow run ${runId} is not available`);
    return channel.createReadable(startIndex);
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
    switch (event.eventType) {
      case "workflow.started":
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

      case "workflow.completed": {
        const state = (event.payload as { output: WorkflowOutput }).output;
        const finalResult = state.finalResult;
        const text =
          finalResult?.detailedResponse ??
          state.failureReason ??
          "The workflow completed without a response.";
        const success = finalResult?.overallSuccess ?? false;
        const executionTimeMs = Date.now() - state.startedAt;

        publishWorkflowChunk(runId, {
          type: "data-workflowCompleted",
          data: { success, executionTimeMs },
        });
        publishTextResult(runId, text);
        closeWorkflowOutputChannel(runId);
        return;
      }

      case "workflow.failed": {
        const message = (event.payload as { error: { message: string } }).error
          .message;
        publishWorkflowChunk(runId, {
          type: "data-workflowError",
          data: { error: message },
        });
        publishWorkflowChunk(runId, {
          type: "data-workflowCompleted",
          data: { success: false, executionTimeMs: 0 },
        });
        publishTextResult(runId, `The orchestration failed: ${message}`);
        closeWorkflowOutputChannel(runId);
        return;
      }

      default:
        return;
    }
  }
}

function publishTextResult(runId: string, text: string): void {
  const messageId = crypto.randomUUID();
  publishWorkflowChunk(runId, { type: "text-start", id: messageId });
  publishWorkflowChunk(runId, {
    type: "text-delta",
    id: messageId,
    delta: text,
  });
  publishWorkflowChunk(runId, { type: "text-end", id: messageId });
  publishWorkflowChunk(runId, { type: "finish", finishReason: "stop" });
}

export const workflowRunService = new WorkflowRunService();
