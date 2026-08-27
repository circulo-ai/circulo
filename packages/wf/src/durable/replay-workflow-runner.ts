import type {
  ActivityTaskPayload,
  BatchOptions,
  BatchResult,
  ReplayWorkflowContext,
  ReplayWorkflowDefinition,
  ReplayWorkflowResult,
  ReplayWorkflowRunnerOptions,
  SagaScope,
  TaskEnvelope,
  TimerTaskPayload,
  WorkflowError,
  WorkflowHistoryEvent,
  WorkflowHistoryStore,
} from "../models";
import {
  WorkflowReplayCursor,
  WorkflowReplayError,
} from "../replay/replay-cursor";
import { generateId } from "../utils/id";
import { appendHistoryEvent } from "./history-append";

class WorkflowSuspended extends Error {
  constructor(readonly reason: "activity" | "timer" | "event") {
    super(`Workflow suspended waiting for ${reason}`);
    this.name = "WorkflowSuspended";
  }
}

/**
 * Minimal replay-safe workflow runner. It executes workflow code until it
 * emits a durable command, then resumes by replaying history and consuming
 * recorded activity results.
 */
export class ReplayWorkflowRunner {
  constructor(
    private readonly history: WorkflowHistoryStore,
    private readonly queue: import("../models").TaskQueueAdapter,
  ) {}

  async start<TInput, TOutput>(
    definition: ReplayWorkflowDefinition<TInput, TOutput>,
    input: TInput,
    options: ReplayWorkflowRunnerOptions = {},
  ): Promise<ReplayWorkflowResult<TOutput>> {
    const workflowId = options.workflowId ?? generateId("workflow");
    const runId = options.runId ?? generateId("run");
    return this.startAt(definition, input, workflowId, runId, options);
  }

  private async startAt<TInput, TOutput>(
    definition: ReplayWorkflowDefinition<TInput, TOutput>,
    input: TInput,
    workflowId: string,
    runId: string,
    options: ReplayWorkflowRunnerOptions = {},
  ): Promise<ReplayWorkflowResult<TOutput>> {
    const existing = await this.history.nextSequence(workflowId, runId);
    if (existing > 0) {
      const history = await this.history.read({ workflowId, runId });
      const started = history.find(
        (event) => event.eventType === "workflow.started",
      );
      const recordedInput = (
        started?.payload as { input?: unknown } | undefined
      )?.input;
      if (
        started &&
        stableSerialize(recordedInput) !== stableSerialize(input)
      ) {
        throw new WorkflowReplayError(
          `Workflow ${workflowId}/${runId} was started with different input`,
          started.sequence,
        );
      }
      return this.run(definition, workflowId, runId, options);
    }
    await appendHistoryEvent(
      this.history,
      {
        workflowId,
        runId,
        eventId: `${workflowId}:${runId}:workflow.started`,
        ...(options.tenantId === undefined
          ? {}
          : { tenantId: options.tenantId }),
        eventType: "workflow.started",
        payload: {
          input,
          workflowName: definition.name,
          workflowVersion: definition.version,
        },
      },
      options.maxAppendRetries,
    );
    return this.run(definition, workflowId, runId, options);
  }

  async run<TInput, TOutput>(
    definition: ReplayWorkflowDefinition<TInput, TOutput>,
    workflowId: string,
    runId: string,
    options: ReplayWorkflowRunnerOptions = {},
  ): Promise<ReplayWorkflowResult<TOutput>> {
    const history = await this.history.read({ workflowId, runId });
    const cursor = new WorkflowReplayCursor(history);
    const started = cursor.take<{
      input: TInput;
      workflowName: string;
      workflowVersion: number;
    }>("workflow.started");
    if (
      started.payload.workflowName !== definition.name ||
      started.payload.workflowVersion !== definition.version
    ) {
      throw new WorkflowReplayError(
        `Workflow definition mismatch: history has ${started.payload.workflowName}:${started.payload.workflowVersion}, received ${definition.name}:${definition.version}`,
      );
    }
    const terminal = history.at(-1);
    if (terminal?.eventType === "workflow.completed") {
      return {
        workflowId,
        runId,
        status: "completed",
        output: (terminal.payload as { output: TOutput }).output,
      };
    }
    if (terminal?.eventType === "workflow.failed") {
      return {
        workflowId,
        runId,
        status: "failed",
        error: (terminal.payload as { error: WorkflowError }).error,
      };
    }

    let activityCallIndex = 0;
    let waitCallIndex = 0;
    const context: ReplayWorkflowContext = {
      workflowId,
      runId,
      ...(options.tenantId === undefined ? {} : { tenantId: options.tenantId }),
      activity: async <TActivityInput, TActivityOutput>(
        name: string,
        input: TActivityInput,
        activityOptions: {
          version?: number | undefined;
          queue?: string | undefined;
        } = {},
      ): Promise<TActivityOutput> => {
        activityCallIndex += 1;
        const version = activityOptions.version ?? 1;
        const activityId = `${workflowId}:${runId}:activity:${activityCallIndex}`;
        const scheduled = cursor.find<ActivityTaskPayload<TActivityInput>>(
          "activity.scheduled",
          (event) => {
            const payload = event.payload;
            return (
              payload.activityId === activityId &&
              payload.activityName === name &&
              payload.activityVersion === version
            );
          },
        );

        if (!scheduled) {
          const activity = definition.activityRegistry.get<
            TActivityInput,
            TActivityOutput
          >(name, version);
          if (!activity) {
            throw new WorkflowReplayError(
              `Activity ${name}:${version} is not registered`,
            );
          }
          const payload: ActivityTaskPayload<TActivityInput> = {
            activityId,
            activityName: name,
            activityVersion: version,
            input,
          };
          await appendHistoryEvent(
            this.history,
            {
              workflowId,
              runId,
              eventId: `${activityId}:scheduled`,
              ...(options.tenantId === undefined
                ? {}
                : { tenantId: options.tenantId }),
              eventType: "activity.scheduled",
              payload,
            },
            options.maxAppendRetries,
          );
          const task: TaskEnvelope<ActivityTaskPayload<TActivityInput>> = {
            id: activityId,
            kind: "activity",
            queue: activityOptions.queue ?? options.queue ?? `activity:${name}`,
            workflowId,
            runId,
            ...(options.tenantId === undefined
              ? {}
              : { tenantId: options.tenantId }),
            payload,
            attempt: 0,
            maxAttempts: activity.retryPolicy.maxAttempts,
            retryPolicy: {
              initialDelayMs: activity.retryPolicy.initialDelayMs,
              maxDelayMs: activity.retryPolicy.maxDelayMs,
              multiplier: activity.retryPolicy.multiplier,
              jitter: activity.retryPolicy.jitter,
            },
            priority: 0,
            createdAt: Date.now(),
            availableAt: Date.now(),
          };
          await this.queue.enqueue(task);
          throw new WorkflowSuspended("activity");
        }

        const recordedInput = scheduled.payload.input;
        if (stableSerialize(recordedInput) !== stableSerialize(input)) {
          throw new WorkflowReplayError(
            `Activity ${name}:${version} input diverged from history at activity ${activityId}`,
            scheduled.sequence,
          );
        }

        while (
          cursor.find(
            "activity.started",
            (event) =>
              (event.payload as { activityId?: string }).activityId ===
              activityId,
          )
        ) {
          // Consume every at-least-once attempt before resolving the activity.
        }
        const completed = cursor.find<{
          activityId: string;
          output: TActivityOutput;
        }>(
          "activity.completed",
          (event) => event.payload.activityId === activityId,
        );

        const failures: Array<{
          activityId: string;
          message?: string;
          retryable?: boolean;
        }> = [];
        let failed:
          | WorkflowHistoryEvent<{
              activityId: string;
              message?: string;
              retryable?: boolean;
            }>
          | undefined;
        while (
          (failed = cursor.find<{
            activityId: string;
            message?: string;
            retryable?: boolean;
          }>(
            "activity.failed",
            (event) => event.payload.activityId === activityId,
          ))
        ) {
          failures.push(failed.payload);
        }
        if (completed) return completed.payload.output;
        const terminalFailure = failures.find((failure) => !failure.retryable);
        if (terminalFailure) {
          throw new Error(terminalFailure.message ?? `Activity ${name} failed`);
        }
        throw new WorkflowSuspended("activity");
      },
      parallel: async <TOutput>(
        operations: readonly (() => Promise<TOutput>)[],
      ): Promise<TOutput[]> =>
        Promise.all(operations.map((operation) => operation())),
      fanOut: async <TInput, TOutput>(
        items: readonly TInput[],
        operation: (item: TInput, index: number) => Promise<TOutput>,
      ): Promise<TOutput[]> =>
        Promise.all(items.map((item, index) => operation(item, index))),
      batch: async <TInput, TOutput>(
        _id: string,
        items: readonly TInput[],
        operation: (item: TInput, index: number) => Promise<TOutput>,
        batchOptions: BatchOptions = {},
      ): Promise<BatchResult<TOutput>> => {
        const concurrency = batchOptions.concurrency ?? (items.length || 1);
        if (!Number.isInteger(concurrency) || concurrency < 1) {
          throw new RangeError("Batch concurrency must be a positive integer");
        }
        const results: Array<TOutput | undefined> = new Array(items.length);
        const failures: Array<{ index: number; message: string }> = [];
        for (let start = 0; start < items.length; start += concurrency) {
          const end = Math.min(items.length, start + concurrency);
          const settled = await Promise.all(
            items.slice(start, end).map(async (item, offset) => {
              const index = start + offset;
              try {
                return { index, value: await operation(item, index) };
              } catch (error) {
                if (error instanceof WorkflowSuspended) throw error;
                return {
                  index,
                  error: error instanceof Error ? error.message : String(error),
                };
              }
            }),
          );
          for (const item of settled) {
            if ("error" in item)
              failures.push({ index: item.index, message: item.error });
            else results[item.index] = item.value;
          }
        }
        return {
          results,
          failures,
          completed: results.filter((value) => value !== undefined).length,
        };
      },
      sleep: async (id: string, durationMs: number): Promise<void> => {
        if (!Number.isFinite(durationMs) || durationMs < 0) {
          throw new RangeError(
            "Workflow sleep duration must be finite and non-negative",
          );
        }
        waitCallIndex += 1;
        const timerId = `${workflowId}:${runId}:timer:${id}:${waitCallIndex}`;
        const startedTimer = cursor.find<{ timerId: string }>(
          "timer.started",
          (event) => event.payload.timerId === timerId,
        );
        const fired = cursor.find<{ timerId: string }>(
          "timer.fired",
          (event) => event.payload.timerId === timerId,
        );
        if (fired) return;

        if (!startedTimer) {
          const fireAt = Date.now() + durationMs;
          const payload: TimerTaskPayload = { timerId, fireAt };
          await appendHistoryEvent(
            this.history,
            {
              workflowId,
              runId,
              eventId: `${timerId}:started`,
              ...(options.tenantId === undefined
                ? {}
                : { tenantId: options.tenantId }),
              eventType: "timer.started",
              payload,
            },
            options.maxAppendRetries,
          );
          await this.queue.enqueue({
            id: timerId,
            kind: "timer",
            queue: "timer",
            workflowId,
            runId,
            ...(options.tenantId === undefined
              ? {}
              : { tenantId: options.tenantId }),
            payload,
            attempt: 0,
            maxAttempts: 1,
            priority: 0,
            createdAt: Date.now(),
            availableAt: fireAt,
          });
        }
        throw new WorkflowSuspended("timer");
      },
      waitForEvent: async <TPayload = unknown>(
        id: string,
        eventName: string,
      ): Promise<TPayload> => {
        waitCallIndex += 1;
        const waitId = `${workflowId}:${runId}:event:${id}:${waitCallIndex}`;
        const waiting = cursor.find<{ waitId: string }>(
          "event.waiting",
          (event) => event.payload.waitId === waitId,
        );
        const received = cursor.find<{
          waitId: string;
          eventName: string;
          data: TPayload;
        }>(
          "signal.received",
          (event) =>
            event.payload.waitId === waitId &&
            event.payload.eventName === eventName,
        );
        if (received) return received.payload.data;
        if (!waiting) {
          await appendHistoryEvent(
            this.history,
            {
              workflowId,
              runId,
              eventId: `${waitId}:waiting`,
              ...(options.tenantId === undefined
                ? {}
                : { tenantId: options.tenantId }),
              eventType: "event.waiting",
              payload: { waitId, eventName },
            },
            options.maxAppendRetries,
          );
        }
        throw new WorkflowSuspended("event");
      },
      saga: async <TOutput>(
        run: (scope: SagaScope) => Promise<TOutput>,
      ): Promise<TOutput> => {
        const compensations: Array<() => Promise<void>> = [];
        const scope: SagaScope = {
          activity: async <TActivityInput, TActivityOutput>(
            name: string,
            input: TActivityInput,
            activityOptions: {
              version?: number | undefined;
              queue?: string | undefined;
              compensate?:
                | {
                    name: string;
                    input: (output: TActivityOutput) => unknown;
                    version?: number | undefined;
                    queue?: string | undefined;
                  }
                | undefined;
            } = {},
          ): Promise<TActivityOutput> => {
            const output = await context.activity<
              TActivityInput,
              TActivityOutput
            >(name, input, {
              version: activityOptions.version,
              queue: activityOptions.queue,
            });
            if (activityOptions.compensate) {
              const compensation = activityOptions.compensate;
              compensations.push(() =>
                context
                  .activity(compensation.name, compensation.input(output), {
                    version: compensation.version,
                    queue: compensation.queue,
                  })
                  .then(() => undefined),
              );
            }
            return output;
          },
          compensate: (action) => {
            compensations.push(action);
          },
        };

        try {
          return await run(scope);
        } catch (error) {
          const compensationErrors: unknown[] = [];
          for (let index = compensations.length - 1; index >= 0; index -= 1) {
            try {
              await compensations[index]!();
            } catch (compensationError) {
              if (compensationError instanceof WorkflowSuspended) {
                throw compensationError;
              }
              compensationErrors.push(compensationError);
            }
          }
          if (compensationErrors.length > 0) {
            throw new AggregateError(
              [error, ...compensationErrors],
              `Workflow failed: ${toError(error).message}. One or more Saga compensations also failed.`,
            );
          }
          throw error;
        }
      },
    };

    try {
      const output = await definition.run(context, started.payload.input);
      cursor.assertDone();
      await appendHistoryEvent(
        this.history,
        {
          workflowId,
          runId,
          eventId: `${workflowId}:${runId}:workflow.completed`,
          ...(options.tenantId === undefined
            ? {}
            : { tenantId: options.tenantId }),
          eventType: "workflow.completed",
          payload: { output },
        },
        options.maxAppendRetries,
      );
      return { workflowId, runId, status: "completed", output };
    } catch (error) {
      if (error instanceof WorkflowSuspended) {
        return { workflowId, runId, status: "waiting" };
      }
      const workflowError = toWorkflowError(error);
      await appendHistoryEvent(
        this.history,
        {
          workflowId,
          runId,
          eventId: `${workflowId}:${runId}:workflow.failed`,
          ...(options.tenantId === undefined
            ? {}
            : { tenantId: options.tenantId }),
          eventType: "workflow.failed",
          payload: { error: workflowError },
        },
        options.maxAppendRetries,
      );
      return { workflowId, runId, status: "failed", error: workflowError };
    }
  }

  async signal<TPayload>(
    workflowId: string,
    runId: string,
    waitId: string,
    eventName: string,
    data: TPayload,
    options: Pick<
      ReplayWorkflowRunnerOptions,
      "tenantId" | "maxAppendRetries"
    > = {},
  ): Promise<void> {
    const history = await this.history.read({ workflowId, runId });
    const alreadyReceived = history.some(
      (event) =>
        event.eventType === "signal.received" &&
        (event.payload as { waitId?: string; eventName?: string }).waitId ===
          waitId &&
        (event.payload as { waitId?: string; eventName?: string }).eventName ===
          eventName,
    );
    if (alreadyReceived) return;
    await appendHistoryEvent(
      this.history,
      {
        workflowId,
        runId,
        eventId: `${waitId}:${eventName}:received`,
        ...(options.tenantId === undefined
          ? {}
          : { tenantId: options.tenantId }),
        eventType: "signal.received",
        payload: { waitId, eventName, data },
      },
      options.maxAppendRetries,
    );
  }
}

function toWorkflowError(error: unknown): WorkflowError {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return {
    type: "unknown",
    message: normalized.message,
    retryable: false,
    stack: normalized.stack,
    timestamp: Date.now(),
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
