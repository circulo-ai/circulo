import type {
  Step,
  StepResult,
  WorkflowContext,
  WorkflowDefinition,
  ErrorType,
} from "../models";
import { generateId } from "../utils/id";

type StepExecutor<TContext, TInput, TOutput> = (
  input: TInput,
  ctx: WorkflowContext<TContext>
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
    ctx: WorkflowContext<TContext>
  ) => Promise<void>;
}

export class WorkflowBuilder<TContext, TInput = unknown, TOutput = unknown> {
  private workflowName = "unnamed-workflow";
  private workflowVersion = 1;
  private contextValue?: TContext;
  private stepList: Step<TContext, unknown, unknown>[] = [];
  private validatorFn?: (input: TInput) => boolean | Promise<boolean>;
  private transformFn?: (output: unknown) => TOutput | Promise<TOutput>;
  private maxExecutionTimeValue?: number;
  private tagsValue: Record<string, string> = {};
  private metadataValue: Record<string, unknown> = {};
  private idempotencyKeyValue?: string;

  name(name: string): WorkflowBuilder<TContext, TInput, TOutput> {
    this.workflowName = name;
    return this;
  }

  version(version: number): WorkflowBuilder<TContext, TInput, TOutput> {
    this.workflowVersion = version;
    return this;
  }

  context(
    initialContext: TContext
  ): WorkflowBuilder<TContext, TInput, TOutput> {
    this.contextValue = initialContext;
    return this;
  }

  step<TStepName extends string, TStepInput, TStepOutput>(
    name: TStepName,
    config: StepConfig<TContext, TStepInput, TStepOutput>
  ): WorkflowBuilder<TContext, TStepInput, TStepOutput> {
    const step: Step<TContext, TStepInput, TStepOutput> = {
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
      TStepInput,
      TStepOutput
    >;
  }

  validate(
    validator: (input: TInput) => boolean | Promise<boolean>
  ): WorkflowBuilder<TContext, TInput, TOutput> {
    this.validatorFn = validator;
    return this;
  }

  transform(
    transformer: (output: unknown) => TOutput | Promise<TOutput>
  ): WorkflowBuilder<TContext, TInput, TOutput> {
    this.transformFn = transformer;
    return this;
  }

  maxExecutionTime(ms: number): WorkflowBuilder<TContext, TInput, TOutput> {
    this.maxExecutionTimeValue = ms;
    return this;
  }

  tags(
    tags: Record<string, string>
  ): WorkflowBuilder<TContext, TInput, TOutput> {
    this.tagsValue = tags;
    return this;
  }

  metadata(
    metadata: Record<string, unknown>
  ): WorkflowBuilder<TContext, TInput, TOutput> {
    this.metadataValue = metadata;
    return this;
  }

  idempotencyKey(key: string): WorkflowBuilder<TContext, TInput, TOutput> {
    this.idempotencyKeyValue = key;
    return this;
  }

  build(): WorkflowDefinition<TContext, TInput, TOutput> {
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

export function defineWorkflow<TContext>(): WorkflowBuilder<
  TContext,
  unknown,
  unknown
> {
  return new WorkflowBuilder<TContext, unknown, unknown>();
}
