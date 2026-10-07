import {
  InMemoryActivityRegistry,
  defineActivity,
} from "../activity/activity-registry";
import type {
  ActivityExecutionContext,
  ReplayWorkflowContext,
  ReplayWorkflowDefinition,
} from "../models";
import { createClassWorkflowPlan, normalizeResult } from "./class-builder";
import type {
  ClassWorkflowPlan,
  ClassWorkflowPlanStep,
  IWorkflow,
  ReplayClassWorkflowOptions,
  WorkflowStepToken,
} from "./models";

/** Compiles class steps to stable, versioned activities for replay execution. */
export function compileClassReplayWorkflow<
  TData,
  TInput = unknown,
  TOutput = unknown,
>(
  workflow: IWorkflow<TData>,
  options: ReplayClassWorkflowOptions,
): ReplayWorkflowDefinition<TInput, TOutput> {
  const plan = createClassWorkflowPlan<TData, TInput>(workflow, {
    registry: options.registry,
  });
  return compileClassReplayWorkflowPlan(plan, options);
}

export function compileClassReplayWorkflowPlan<
  TData,
  TInput = unknown,
  TOutput = unknown,
>(
  plan: ClassWorkflowPlan<TData, TInput>,
  options: ReplayClassWorkflowOptions,
): ReplayWorkflowDefinition<TInput, TOutput> {
  const activityRegistry =
    options.activityRegistry ?? new InMemoryActivityRegistry();
  const registered = new Set<string>();
  const ensureActivity = (
    token: WorkflowStepToken<TData>,
    retry?: { maxAttempts?: number; delayMs?: number },
  ): string => {
    if (!options.registry.has(token)) {
      throw new Error(
        `Unknown workflow step type: ${options.registry.key(token)}`,
      );
    }
    const name = options.registry.key(token);
    const key = `${name}:${plan.version}`;
    if (!registered.has(key) && !activityRegistry.get(name, plan.version)) {
      activityRegistry.register(
        defineActivity(
          name,
          async (input: unknown, context: ActivityExecutionContext) => {
            const instance = options.registry.create(token, {
              workflowId: context.workflowId,
              workflowVersion: plan.version,
              stepId: name,
            });
            const result = normalizeResult(
              await instance.execute({
                signal: context.signal,
                workflow: {
                  id: context.workflowId,
                  state: "running",
                  currentStep: 0,
                  version: plan.version,
                },
                data: undefined as TData,
                input,
                logger: context.logger,
                metrics: context.metrics,
                updateContext: () => undefined,
                abort: () => undefined,
              }),
            );
            if (result.type === "error") throw new Error(result.error.message);
            if (result.type === "wait")
              throw new Error("Replay activities cannot wait");
            return result.data;
          },
          {
            version: plan.version,
            retryPolicy: {
              maxAttempts: retry?.maxAttempts ?? 3,
              ...(retry?.delayMs === undefined
                ? {}
                : { initialDelayMs: retry.delayMs }),
            },
          },
        ),
      );
    }
    registered.add(key);
    return name;
  };

  const runStep = async (
    context: ReplayWorkflowContext,
    token: WorkflowStepToken<TData>,
    input: unknown,
    compensate?: WorkflowStepToken<TData>,
  ): Promise<unknown> => {
    const name = ensureActivity(token);
    const compensationName = compensate
      ? ensureActivity(compensate)
      : undefined;
    if (!compensationName) {
      return context.activity(name, input, {
        version: plan.version,
        queue: options.queue,
      });
    }
    return context.activity(name, input, {
      version: plan.version,
      queue: options.queue,
    });
  };

  const runSaga = async (
    context: ReplayWorkflowContext,
    item: Extract<ClassWorkflowPlanStep<TData>, { kind: "saga" }>,
    input: unknown,
  ): Promise<unknown> =>
    context.saga(async (scope) => {
      let current = input;
      for (const sagaStep of item.steps) {
        const name = ensureActivity(sagaStep.token);
        const compensationName = sagaStep.compensate
          ? ensureActivity(sagaStep.compensate)
          : undefined;
        current = await scope.activity(name, current, {
          version: plan.version,
          queue: options.queue,
          ...(compensationName
            ? {
                compensate: {
                  name: compensationName,
                  version: plan.version,
                  queue: options.queue,
                  input: (output: unknown) => output,
                },
              }
            : {}),
        });
      }
      return current;
    });

  for (const step of plan.steps) {
    if (step.kind === "saga") {
      for (const sagaStep of step.steps) {
        ensureActivity(sagaStep.token);
        if (sagaStep.compensate) ensureActivity(sagaStep.compensate);
      }
    } else {
      ensureActivity(
        step.token,
        step.kind === "step" && step.retries !== undefined
          ? {
              maxAttempts: step.retries + 1,
              ...(step.backoff ? { delayMs: step.backoff(1) } : {}),
            }
          : undefined,
      );
    }
  }

  return {
    name: plan.id,
    version: plan.version,
    activityRegistry,
    run: async (context, input) => {
      let current: unknown = input;
      for (const step of plan.steps) {
        if (step.kind === "saga") {
          current = await runSaga(context, step, current);
        } else {
          current = await runStep(context, step.token, current);
        }
      }
      return current as TOutput;
    },
  };
}
