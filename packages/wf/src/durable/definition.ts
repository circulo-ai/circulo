import { InMemoryActivityRegistry } from "../activity/activity-registry";
import type {
  DurableWorkflowContext,
  DurableWorkflowOptions,
  ReplayWorkflowDefinition,
} from "../models";

/** Defines a replay-safe workflow with a convenient inferred input/output type. */
export function defineDurableWorkflow<TInput = unknown, TOutput = unknown>(
  options: DurableWorkflowOptions<TInput, TOutput>,
): ReplayWorkflowDefinition<TInput, TOutput> {
  if (!options.name.trim())
    throw new Error("Durable workflow name must not be empty");
  if (!Number.isInteger(options.version) || options.version < 1) {
    throw new RangeError("Durable workflow version must be a positive integer");
  }
  return {
    name: options.name,
    version: options.version,
    activityRegistry:
      options.activityRegistry ?? new InMemoryActivityRegistry(),
    run: options.run as (
      context: DurableWorkflowContext,
      input: TInput,
    ) => Promise<TOutput>,
  };
}
