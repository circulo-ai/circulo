import type {
  Step,
  StepResult,
  WorkflowContext,
  WorkflowDefinition,
} from "../models";
import { WorkflowErrorHandling, type ClassWorkflowPlan, type ClassWorkflowPlanStep, type ClassWorkflowSagaPlan, type ClassWorkflowStepPlan, type ClassWorkflowBuildOptions, type IWorkflow, type IWorkflowBuilder, type IWorkflowSagaBuilder, type WorkflowCompensationContext, type WorkflowErrorPolicy, type WorkflowRetryOptions, type WorkflowStepClass, type WorkflowStepContext, type WorkflowStepToken } from "./models";

interface MutableStepPlan<TData> {
  readonly kind: "step";
  readonly id: string;
  readonly token: WorkflowStepToken<TData>;
  retries?: number | undefined;
  backoff?: ((attempt: number) => number) | undefined;
  timeout?: number | undefined;
  policy?: WorkflowErrorPolicy | undefined;
}

interface MutableSagaPlan<TData> {
  readonly kind: "saga";
  readonly id: string;
  readonly steps: Array<{
    token: WorkflowStepToken<TData>;
    compensate?: WorkflowStepToken<TData> | undefined;
  }>;
  policy?: WorkflowErrorPolicy | undefined;
}

export class ClassWorkflowBuilder<
  TData,
  TInput = unknown,
  TCurrent = unknown,
> implements IWorkflowBuilder<TData, TInput, TCurrent> {
  private readonly stepPlans: Array<ClassWorkflowPlanStep<TData>> = [];
  private contextValue: TData | undefined;
  private tagsValue: Record<string, string> = {};
  private metadataValue: Record<string, unknown> = {};
  private validatorFn?:
    | ((input: TInput) => boolean | Promise<boolean>)
    | undefined;
  private idempotencyKeyValue?: string | undefined;

  constructor(
    private readonly workflowId: string,
    private readonly workflowVersion: number,
  ) {
    if (!workflowId.trim()) throw new Error("Workflow id must not be empty");
    if (!Number.isInteger(workflowVersion) || workflowVersion < 1) {
      throw new RangeError("Workflow version must be a positive integer");
    }
  }

  context(value: TData): ClassWorkflowBuilder<TData, TInput, TCurrent> {
    this.contextValue = value;
    return this;
  }

  startWith<TStepInput, TOutput>(
    step: WorkflowStepClass<TData, TStepInput, TOutput>,
  ): ClassWorkflowBuilder<TData, TStepInput, TOutput> {
    this.addStep(step);
    return this as unknown as ClassWorkflowBuilder<TData, TStepInput, TOutput>;
  }

  then<TOutput>(
    step: WorkflowStepClass<TData, TCurrent, TOutput>,
  ): ClassWorkflowBuilder<TData, TInput, TOutput> {
    this.addStep(step);
    return this as unknown as ClassWorkflowBuilder<TData, TInput, TOutput>;
  }

  onError(
    handling: WorkflowErrorHandling,
    options: WorkflowRetryOptions = {},
  ): ClassWorkflowBuilder<TData, TInput, TCurrent> {
    const current = this.stepPlans[this.stepPlans.length - 1];
    if (!current) throw new Error("onError() requires a preceding workflow step");
    const policy = createPolicy(handling, options);
    if (current.kind === "saga") {
      (current as MutableSagaPlan<TData>).policy = policy;
    } else {
      const step = current as MutableStepPlan<TData>;
      step.policy = policy;
      step.retries = policy.retry ? policy.retry.maxAttempts! - 1 : 0;
      step.backoff = policy.retry?.delayMs === undefined
        ? undefined
        : () => policy.retry!.delayMs!;
    }
    return this;
  }

  timeout(milliseconds: number): ClassWorkflowBuilder<TData, TInput, TCurrent> {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
      throw new RangeError("Workflow step timeout must be a positive number");
    }
    const current = this.stepPlans[this.stepPlans.length - 1];
    if (!current || current.kind !== "step") {
      throw new Error("timeout() requires a preceding forward workflow step");
    }
    (current as MutableStepPlan<TData>).timeout = milliseconds;
    return this;
  }

  tags(value: Record<string, string>): ClassWorkflowBuilder<TData, TInput, TCurrent> {
    this.tagsValue = { ...value };
    return this;
  }

  metadata(value: Record<string, unknown>): ClassWorkflowBuilder<TData, TInput, TCurrent> {
    this.metadataValue = { ...value };
    return this;
  }

  validate(
    validator: (input: TInput) => boolean | Promise<boolean>,
  ): ClassWorkflowBuilder<TData, TInput, TCurrent> {
    this.validatorFn = validator;
    return this;
  }

  idempotencyKey(key: string): ClassWorkflowBuilder<TData, TInput, TCurrent> {
    if (!key.trim()) throw new Error("Idempotency key must not be empty");
    this.idempotencyKeyValue = key;
    return this;
  }

  build(
    options: ClassWorkflowBuildOptions<TData>,
  ): WorkflowDefinition<TData, TInput, TCurrent> {
    return compileClassWorkflowPlan(this.buildPlan(options), options);
  }

  saga(
    configure: (saga: IWorkflowSagaBuilder<TData>) => void,
  ): ClassWorkflowBuilder<TData, TInput, TCurrent> {
    const saga = new SagaBuilder<TData>(`${this.workflowId}:saga:${this.stepPlans.length}`);
    configure(saga);
    this.stepPlans.push(saga.plan);
    return this;
  }

  buildPlan(options: ClassWorkflowBuildOptions<TData>): ClassWorkflowPlan<TData, TInput> {
    if (this.stepPlans.length === 0) throw new Error("Workflow must have at least one step");
    return {
      id: this.workflowId,
      version: this.workflowVersion,
      initialContext: this.contextValue ?? options.initialContext ?? ({} as TData),
      steps: this.stepPlans.map((step) => ({
        ...step,
        ...(step.kind === "saga" ? { steps: step.steps.map((item) => ({ ...item })) } : {}),
      })),
      tags: { ...this.tagsValue },
      metadata: { ...this.metadataValue },
      ...(this.validatorFn ? { validate: this.validatorFn } : {}),
      ...(this.idempotencyKeyValue ? { idempotencyKey: this.idempotencyKeyValue } : {}),
    };
  }

  private addStep<TStepInput, TOutput>(step: WorkflowStepClass<TData, TStepInput, TOutput>): void {
    this.stepPlans.push({
      kind: "step",
      id: `${this.workflowId}:step:${this.stepPlans.length}`,
      token: step,
    });
  }
}

class SagaBuilder<TData> implements IWorkflowSagaBuilder<TData> {
  readonly plan: MutableSagaPlan<TData>;
  private current?: MutableSagaPlan<TData>["steps"][number];

  constructor(id: string) {
    this.plan = { kind: "saga", id, steps: [] };
  }

  startWith<TInput, TOutput>(step: WorkflowStepClass<TData, TInput, TOutput>): this {
    this.add(step);
    return this;
  }

  then<TOutput>(step: WorkflowStepClass<TData, unknown, TOutput>): this {
    this.add(step);
    return this;
  }

  compensateWith(step: WorkflowStepClass<TData, unknown, unknown>): this {
    if (!this.current) throw new Error("compensateWith() requires a preceding saga step");
    this.current.compensate = step;
    return this;
  }

  onError(handling: WorkflowErrorHandling, options: WorkflowRetryOptions = {}): this {
    this.plan.policy = createPolicy(handling, options);
    return this;
  }

  private add<TInput, TOutput>(step: WorkflowStepClass<TData, TInput, TOutput>): void {
    this.current = { token: step };
    this.plan.steps.push(this.current);
  }
}

export function createClassWorkflowPlan<TData, TInput = unknown>(
  workflow: IWorkflow<TData>,
  options: ClassWorkflowBuildOptions<TData> = { registry: undefined as never },
): ClassWorkflowPlan<TData, TInput> {
  const builder = new ClassWorkflowBuilder<TData>(workflow.id, workflow.version);
  workflow.build(builder);
  return builder.buildPlan(options) as ClassWorkflowPlan<TData, TInput>;
}

export function compileClassWorkflow<TData, TInput = unknown, TOutput = unknown>(
  workflow: IWorkflow<TData>,
  options: ClassWorkflowBuildOptions<TData>,
): WorkflowDefinition<TData, TInput, TOutput> {
  return compileClassWorkflowPlan(createClassWorkflowPlan(workflow, options), options);
}

export function compileClassWorkflowPlan<TData, TInput = unknown, TOutput = unknown>(
  plan: ClassWorkflowPlan<TData, TInput>,
  options: ClassWorkflowBuildOptions<TData>,
): WorkflowDefinition<TData, TInput, TOutput> {
  for (const item of plan.steps) {
    if (item.kind === "saga") {
      for (const sagaStep of item.steps) {
        assertRegistered(options, sagaStep.token);
        if (sagaStep.compensate) assertRegistered(options, sagaStep.compensate);
      }
    } else {
      assertRegistered(options, item.token);
    }
  }
  const steps: Step<TData, unknown, unknown>[] = plan.steps.map((item) =>
    item.kind === "saga"
      ? compileSagaStep(item, options)
      : compileClassStep(item, options),
  );
  return {
    name: plan.id,
    version: plan.version,
    initialContext: plan.initialContext,
    steps,
    tags: plan.tags,
    metadata: { ...plan.metadata, classWorkflow: true },
    ...(plan.validate ? { validate: plan.validate as (input: TInput) => boolean | Promise<boolean> } : {}),
    ...(plan.idempotencyKey ? { idempotencyKey: plan.idempotencyKey } : {}),
  };
}

function assertRegistered<TData>(
  options: ClassWorkflowBuildOptions<TData>,
  token: WorkflowStepToken<TData>,
): void {
  if (!options.registry.has(token)) {
    throw new Error(`Unknown workflow step type: ${options.registry.key(token)}`);
  }
}

function compileClassStep<TData>(
  plan: ClassWorkflowStepPlan<TData>,
  options: ClassWorkflowBuildOptions<TData>,
): Step<TData, unknown, unknown> {
  return {
    id: plan.id,
    name: options.registry.key(plan.token),
    retries: plan.retries,
    timeout: plan.timeout,
    backoff: plan.backoff,
    errorClassifier: plan.policy
      ? () => (plan.policy!.handling === WorkflowErrorHandling.Retry ? "transient" : "permanent")
      : undefined,
    run: async (input, context) => {
      const instance = options.registry.create(plan.token, {
        workflowId: context.workflow.id,
        workflowVersion: context.workflow.version,
        stepId: plan.id,
      });
      return normalizeResult(await instance.execute(toStepContext(input, context)));
    },
    compensation: async (input, context) => {
      const instance = options.registry.create(plan.token);
      if (instance.compensate) {
        await instance.compensate(toCompensationContext(input, input, context));
      }
    },
  };
}

function compileSagaStep<TData>(
  plan: ClassWorkflowSagaPlan<TData>,
  options: ClassWorkflowBuildOptions<TData>,
): Step<TData, unknown, unknown> {
  return {
    id: plan.id,
    name: plan.id,
    retries: plan.policy?.retry ? plan.policy.retry.maxAttempts! - 1 : undefined,
    backoff: plan.policy?.retry?.delayMs === undefined ? undefined : () => plan.policy!.retry!.delayMs!,
    errorClassifier: plan.policy
      ? () => (plan.policy!.handling === WorkflowErrorHandling.Retry ? "transient" : "permanent")
      : undefined,
    run: async (input, context) => {
      let current = input;
      const completed: Array<{ item: (typeof plan.steps)[number]; input: unknown; output: unknown }> = [];
      try {
        for (const item of plan.steps) {
          const output = await executeClassToken(item.token, current, context, options);
          completed.push({ item, input: current, output });
          current = output;
        }
        return { type: "complete", data: current };
      } catch (error) {
        for (let index = completed.length - 1; index >= 0; index -= 1) {
          const item = completed[index]!;
          if (!item.item.compensate) continue;
          try {
            await executeClassToken(item.item.compensate, item.output, context, options);
          } catch (compensationError) {
            context.logger.error("Workflow saga compensation failed", compensationError as Error, {
              sagaStep: options.registry.key(item.item.token),
            });
          }
        }
        throw error;
      }
    },
  };
}

async function executeClassToken<TData>(
  token: WorkflowStepToken<TData>,
  input: unknown,
  context: WorkflowContext<TData>,
  options: ClassWorkflowBuildOptions<TData>,
): Promise<unknown> {
  const instance = options.registry.create(token, {
    workflowId: context.workflow.id,
    workflowVersion: context.workflow.version,
  });
  const result = await instance.execute(toStepContext(input, context));
  const normalized = normalizeResult(result);
  if (normalized.type === "error") throw new Error(normalized.error.message);
  if (normalized.type === "wait") throw new Error("Saga steps cannot wait");
  return normalized.data;
}

function toStepContext<TData>(input: unknown, context: WorkflowContext<TData>): WorkflowStepContext<TData> {
  return {
    signal: context.signal,
    workflow: context.workflow,
    data: context.data,
    input,
    logger: context.logger,
    metrics: context.metrics,
    updateContext: context.updateContext,
    abort: context.abort,
  };
}

function toCompensationContext<TData>(
  input: unknown,
  output: unknown,
  context: WorkflowContext<TData>,
): WorkflowCompensationContext<TData> {
  return { ...toStepContext(input, context), output };
}

export function normalizeResult<TOutput>(
  result: TOutput | StepResult<TOutput>,
): StepResult<TOutput> {
  if (
    typeof result === "object" &&
    result !== null &&
    "type" in result &&
    (result.type === "chunk" || result.type === "complete" || result.type === "error" || result.type === "wait")
  ) {
    return result as StepResult<TOutput>;
  }
  return { type: "complete", data: result as TOutput };
}

function createPolicy(
  handling: WorkflowErrorHandling,
  options: WorkflowRetryOptions,
): WorkflowErrorPolicy {
  if (handling === WorkflowErrorHandling.Fail) return { handling };
  const maxAttempts = options.maxAttempts ?? 3;
  const delayMs = options.delayMs ?? 0;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("Retry maxAttempts must be a positive integer");
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new RangeError("Retry delayMs must be finite and non-negative");
  }
  return { handling, retry: { maxAttempts, delayMs } };
}
