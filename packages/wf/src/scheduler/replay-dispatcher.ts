import { ReplayWorkflowRunner } from "../durable/replay-workflow-runner";
import type {
  ReplayWorkflowDefinition,
  ReplayWorkflowRunnerOptions,
  ScheduleDispatch,
  ScheduleRecord,
} from "../models";

export interface ReplayScheduleDefinitionResolver {
  (
    workflowName: string,
  ): ReplayWorkflowDefinition<unknown, unknown> | undefined;
}

export interface ReplayScheduleDispatcherOptions {
  runner: ReplayWorkflowRunner;
  resolve: ReplayScheduleDefinitionResolver;
  runId?: string | undefined;
}

/** Creates a deterministic scheduler callback for replay workflow definitions. */
export function createReplayScheduleDispatcher(
  options: ReplayScheduleDispatcherOptions,
): (dispatch: ScheduleDispatch<unknown>) => Promise<void> {
  return async (dispatch) => {
    const schedule = dispatch.schedule as ScheduleRecord<unknown>;
    const definition = options.resolve(schedule.workflowName);
    if (!definition) {
      throw new Error(
        `No replay workflow is registered for schedule ${schedule.workflowName}`,
      );
    }
    const runnerOptions: ReplayWorkflowRunnerOptions = {
      workflowId: `${schedule.scheduleId}:${dispatch.scheduledFor}`,
      runId: options.runId ?? "scheduled",
      ...(schedule.tenantId === undefined
        ? {}
        : { tenantId: schedule.tenantId }),
    };
    await options.runner.start(definition, schedule.input, runnerOptions);
  };
}
