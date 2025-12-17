import type {
  ErrorType,
  Step,
  StepResult,
  WorkflowContext,
  WorkflowDefinition,
} from "../models";
import { generateId } from "../utils/id";

type StepExecutor<TContext, TInput, TOutput> = (
  input: TInput,
  ctx: WorkflowContext<TContext>,
) =>
  | Promise<StepResult<TOutput>>
  | AsyncGenerator<StepResult<TOutput>, StepResult<TOutput>, unknown>;

export interface StepConfig<TContext, TInput, TOutput> {
  run: StepExecutor<TContext, TInput, TOutput>;
  retries?: number;
  timeout?: number;
  backoff?: (attempt: number) => number;
  errorClassifier?: (error: Error) => ErrorType;
  compensation?: (
    input: TInput,
    ctx: WorkflowContext<TContext>,
  ) => Promise<void>;
}

type ResolveInput<TInput> = [TInput] extends [never] ? unknown : TInput;
type ResolveOutput<TOutput> = [TOutput] extends [never] ? unknown : TOutput;

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
  private contextValue?: TContext;
  private stepList: Step<TContext, unknown, unknown>[] = [];
  private validatorFn?: (
    input: ResolveInput<TInput>,
  ) => boolean | Promise<boolean>;
  private transformFn?: (
    output: unknown,
  ) => ResolveOutput<TCurrent> | Promise<ResolveOutput<TCurrent>>;
  private maxExecutionTimeValue?: number;
  private tagsValue: Record<string, string> = {};
  private metadataValue: Record<string, unknown> = {};
  private idempotencyKeyValue?: string;

  name(name: string): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.workflowName = name;
    return this;
  }

  version(version: number): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.workflowVersion = version;
    return this;
  }

  context(
    initialContext: TContext,
  ): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.contextValue = initialContext;
    return this;
  }

  step<TStepName extends string, TStepInput, TStepOutput>(
    name: TStepName,
    config: StepConfig<
      TContext,
      [TCurrent] extends [never] ? ResolveInput<TInput> : TCurrent,
      TStepOutput
    >,
  ): WorkflowBuilder<
    TContext,
    [TInput] extends [never] ? TStepInput : TInput,
    TStepOutput
  > {
    const step: Step<
      TContext,
      [TCurrent] extends [never] ? ResolveInput<TInput> : TCurrent,
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
    validator: (
      input: ResolveInput<TInput>,
    ) => boolean | Promise<boolean>,
  ): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.validatorFn = validator;
    return this;
  }

  transform(
    transformer: (
      output: unknown,
    ) => ResolveOutput<TCurrent> | Promise<ResolveOutput<TCurrent>>,
  ): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.transformFn = transformer;
    return this;
  }

  maxExecutionTime(ms: number): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.maxExecutionTimeValue = ms;
    return this;
  }

  tags(
    tags: Record<string, string>,
  ): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.tagsValue = tags;
    return this;
  }

  metadata(
    metadata: Record<string, unknown>,
  ): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.metadataValue = metadata;
    return this;
  }

  idempotencyKey(key: string): WorkflowBuilder<TContext, TInput, TCurrent> {
    this.idempotencyKeyValue = key;
    return this;
  }

  build(): WorkflowDefinition<
    TContext,
    ResolveInput<TInput>,
    ResolveOutput<TCurrent>
  > {
    if (!this.contextValue) {
      throw new Error("Initial context must be set using .context()");
    }

    if (this.stepList.length === 0) {
      throw new Error("Workflow must have at least one step");
    }

    return {
      name: this.workflowName,
      version: this.workflowVersion,
      initialContext: this.contextValue,
      steps: this.stepList,
      validate: this.validatorFn,
      transform: this.transformFn,
      maxExecutionTime: this.maxExecutionTimeValue,
      tags: this.tagsValue,
      metadata: this.metadataValue,
      idempotencyKey: this.idempotencyKeyValue,
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
