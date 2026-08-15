import type {
  ErrorType,
  Step,
  StepResult,
  WorkflowContext,
  WorkflowDefinition,
} from "../models";
import { generateId } from "../utils/id";

export type StepExecutor<TContext, TInput, TOutput> = (
  input: TInput,
  ctx: WorkflowContext<TContext>,
) =>
  | Promise<StepResult<TOutput>>
  | AsyncGenerator<StepResult<TOutput>, StepResult<TOutput>, unknown>;

export interface StepConfig<TContext, TInput, TOutput> {
  run: StepExecutor<TContext, TInput, TOutput>;
  retries?: number | undefined;
  timeout?: number | undefined;
  backoff?: ((attempt: number) => number) | undefined;
  errorClassifier?: ((error: Error) => ErrorType) | undefined;
  compensation?:
    | ((input: TInput, ctx: WorkflowContext<TContext>) => Promise<void>)
    | undefined;
}

type ResolveInput<TInput> = [TInput] extends [never] ? unknown : TInput;
type ResolveOutput<TOutput> = [TOutput] extends [never] ? unknown : TOutput;
type StepInput<TInput, TCurrent, TStepInput> = [TCurrent] extends [never]
  ? [TInput] extends [never]
    ? TStepInput
    : TInput
  : TCurrent;

/**
 * WorkflowBuilder keeps the initial input type stable across all steps while
 * threading the latest step output through the chain for type inference.
 *
 * Generics:
 * - TContext: workflow context shape
 * - TInput: initial workflow input (set explicitly or inferred from first step)
 * - TCurrent: output of the latest step (carried forward for inference)
 */
export class WorkflowBuilder<TContext, TInput = never, TCurrent = never> {
  private workflowName = "unnamed-workflow";
  private workflowVersion = 1;
  private contextValue: TContext | undefined;
  private hasContext = false;
  private stepList: Step<TContext, unknown, unknown>[] = [];
  private validatorFn?: (
    input: ResolveInput<TInput>,
  ) => boolean | Promise<boolean>;
  private transformFn?: (
    output: ResolveOutput<TCurrent>,
  ) => ResolveOutput<TCurrent> | Promise<ResolveOutput<TCurrent>>;
  private maxExecutionTimeValue?: number;
  private tagsValue: Record<string, string> = {};
  private metadataValue: Record<string, unknown> = {};
  private idempotencyKeyValue?: string;

  name(name: string): WorkflowBuilder<TContext, TInput, TCurrent> {
    if (!name.trim()) {
      throw new Error("Workflow name must not be empty");
    }
    this.workflowName = name;
    return this;
  }

  version(version: number): WorkflowBuilder<TContext, TInput, TCurrent> {
    if (!Number.isInteger(version) || version < 1) {
      throw new RangeError("Workflow version must be a positive integer");
    }
    this.workflowVersion = version;
    return this;
  }

  context(
    initialContext: TContext,
  ): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.contextValue = initialContext;
    this.hasContext = true;
    return this;
  }

  step<TStepName extends string, TStepInput, TStepOutput>(
    name: TStepName,
    config: StepConfig<
      TContext,
      StepInput<TInput, TCurrent, TStepInput>,
      TStepOutput
    >,
  ): WorkflowBuilder<
    TContext,
    [TInput] extends [never] ? TStepInput : TInput,
    TStepOutput
  > {
    const step: Step<
      TContext,
      StepInput<TInput, TCurrent, TStepInput>,
      TStepOutput
    > = {
      id: generateId("step"),
      name,
      run: config.run,
      retries: config.retries,
      timeout: config.timeout,
      backoff: config.backoff,
      errorClassifier: config.errorClassifier,
      compensation: config.compensation,
    };

    this.stepList.push(step as Step<TContext, unknown, unknown>);

    return this as unknown as WorkflowBuilder<
      TContext,
      [TInput] extends [never] ? TStepInput : TInput,
      TStepOutput
    >;
  }

  validate(
    validator: (input: ResolveInput<TInput>) => boolean | Promise<boolean>,
  ): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.validatorFn = validator;
    return this;
  }

  transform(
    transformer: (
      output: ResolveOutput<TCurrent>,
    ) => ResolveOutput<TCurrent> | Promise<ResolveOutput<TCurrent>>,
  ): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.transformFn = transformer;
    return this;
  }

  maxExecutionTime(ms: number): WorkflowBuilder<TContext, TInput, TCurrent> {
    if (!Number.isFinite(ms) || ms <= 0) {
      throw new RangeError("Maximum execution time must be a positive number");
    }
    this.maxExecutionTimeValue = ms;
    return this;
  }

  tags(
    tags: Record<string, string>,
  ): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.tagsValue = { ...tags };
    return this;
  }

  metadata(
    metadata: Record<string, unknown>,
  ): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.metadataValue = { ...metadata };
    return this;
  }

  idempotencyKey(key: string): WorkflowBuilder<TContext, TInput, TCurrent> {
    if (!key.trim()) {
      throw new Error("Idempotency key must not be empty");
    }
    this.idempotencyKeyValue = key;
    return this;
  }

  build(): WorkflowDefinition<
    TContext,
    ResolveInput<TInput>,
    ResolveOutput<TCurrent>
  > {
    if (!this.hasContext) {
      throw new Error("Initial context must be set using .context()");
    }

    if (this.stepList.length === 0) {
      throw new Error("Workflow must have at least one step");
    }

    return {
      name: this.workflowName,
      version: this.workflowVersion,
      initialContext: this.contextValue as TContext,
      steps: this.stepList,
      tags: this.tagsValue,
      metadata: this.metadataValue,
      ...(this.validatorFn ? { validate: this.validatorFn } : {}),
      ...(this.transformFn ? { transform: this.transformFn } : {}),
      ...(this.maxExecutionTimeValue !== undefined
        ? { maxExecutionTime: this.maxExecutionTimeValue }
        : {}),
      ...(this.idempotencyKeyValue
        ? { idempotencyKey: this.idempotencyKeyValue }
        : {}),
    };
  }
}

export function defineWorkflow<TContext, TInput = never>(): WorkflowBuilder<
  TContext,
  TInput,
  [TInput] extends [never] ? never : TInput
> {
  return new WorkflowBuilder<
    TContext,
    TInput,
    [TInput] extends [never] ? never : TInput
  >();
}
