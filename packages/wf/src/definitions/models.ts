import type {
  ActivityRegistry,
  ErrorType,
  StepResult,
  WorkflowContext,
  WorkflowDefinition,
} from "../models";
import type { Logger, MetricsCollector } from "../models";

export enum WorkflowErrorHandling {
  Retry = "retry",
  Fail = "fail",
}

export interface WorkflowRetryOptions {
  delayMs?: number | undefined;
  maxAttempts?: number | undefined;
}

export interface WorkflowErrorPolicy {
  handling: WorkflowErrorHandling;
  retry?: WorkflowRetryOptions | undefined;
}

export interface WorkflowStepContext<TData> {
  readonly signal: AbortSignal;
  readonly workflow: WorkflowContext<TData>["workflow"];
  readonly data: TData;
  readonly input: unknown;
  readonly logger: Logger;
  readonly metrics: MetricsCollector;
  updateContext(updates: Partial<TData>): void;
  abort(reason: string, errorType?: ErrorType): void;
}

export interface WorkflowCompensationContext<TData, TOutput = unknown>
  extends WorkflowStepContext<TData> {
  readonly output: TOutput;
}

export interface IWorkflowStep<TData, TOutput = unknown> {
  execute(
    context: WorkflowStepContext<TData>,
  ): Promise<TOutput | StepResult<TOutput>>;
  compensate?(
    context: WorkflowCompensationContext<TData, TOutput>,
  ): Promise<void>;
}

export type WorkflowStepClass<TData, TInput = unknown, TOutput = unknown> = new (
  ...args: never[]
) => IWorkflowStep<TData, TOutput> & { readonly __input?: TInput };

export type WorkflowStepToken<TData, TInput = unknown, TOutput = unknown> =
  | string
  | WorkflowStepClass<TData, TInput, TOutput>;

export interface WorkflowStepFactoryContext {
  readonly workflowId?: string | undefined;
  readonly workflowVersion?: number | undefined;
  readonly stepId?: string | undefined;
}

export type WorkflowStepFactory<TData> = (
  context: WorkflowStepFactoryContext,
) => IWorkflowStep<TData>;

export interface WorkflowStepFactoryPort {
  create<TData>(
    token: WorkflowStepToken<TData>,
    context?: WorkflowStepFactoryContext,
  ): IWorkflowStep<TData>;
}

export interface WorkflowStepRegistryPort extends WorkflowStepFactoryPort {
  register<TData>(key: string, factory: WorkflowStepFactory<TData>): void;
  register<TData>(
    token: WorkflowStepClass<TData>,
    factory: WorkflowStepFactory<TData>,
    key?: string,
  ): void;
  has(token: WorkflowStepToken<unknown>): boolean;
  key(token: WorkflowStepToken<unknown>): string;
  list(): readonly string[];
}

export interface WorkflowDefinitionParserPort {
  parse(source: string): unknown;
}

export interface WorkflowDefinitionLoaderPort {
  load<TContext, TInput, TOutput>(
    source: string,
    options: WorkflowDefinitionLoadOptions<TContext>,
  ): WorkflowDefinition<TContext, TInput, TOutput>;
}

export interface SerializedWorkflowRetry {
  maxAttempts?: number | undefined;
  delayMs?: number | undefined;
}

export interface SerializedWorkflowStep {
  id: string;
  stepType: string;
  nextStepId?: string | undefined;
  retry?: SerializedWorkflowRetry | undefined;
  timeoutMs?: number | undefined;
  compensateStepType?: string | undefined;
}

export interface SerializedWorkflowDefinition {
  id: string;
  version: number;
  steps: SerializedWorkflowStep[];
  tags?: Record<string, string> | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export type WorkflowDefinitionFormat = "json" | "yaml";

export interface WorkflowDefinitionLoadOptions<TContext> {
  registry: WorkflowStepRegistryPort;
  format?: WorkflowDefinitionFormat | undefined;
  parser?: WorkflowDefinitionParserPort | undefined;
  initialContext?: TContext | undefined;
  yamlParser?: WorkflowDefinitionParserPort | undefined;
}

export interface IWorkflow<TData = Record<string, never>> {
  readonly id: string;
  readonly version: number;
  build(builder: IWorkflowBuilder<TData>): void;
}

export interface IWorkflowBuilder<TData, TInput = unknown, TCurrent = unknown> {
  context(value: TData): IWorkflowBuilder<TData, TInput, TCurrent>;
  startWith<TStepInput, TOutput>(
    step: WorkflowStepClass<TData, TStepInput, TOutput>,
  ): IWorkflowBuilder<TData, TStepInput, TOutput>;
  then<TOutput>(
    step: WorkflowStepClass<TData, TCurrent, TOutput>,
  ): IWorkflowBuilder<TData, TInput, TOutput>;
  onError(
    handling: WorkflowErrorHandling,
    options?: WorkflowRetryOptions,
  ): IWorkflowBuilder<TData, TInput, TCurrent>;
  timeout(milliseconds: number): IWorkflowBuilder<TData, TInput, TCurrent>;
  tags(value: Record<string, string>): IWorkflowBuilder<TData, TInput, TCurrent>;
  metadata(value: Record<string, unknown>): IWorkflowBuilder<TData, TInput, TCurrent>;
  validate(
    validator: (input: TInput) => boolean | Promise<boolean>,
  ): IWorkflowBuilder<TData, TInput, TCurrent>;
  idempotencyKey(key: string): IWorkflowBuilder<TData, TInput, TCurrent>;
  build(
    options: ClassWorkflowBuildOptions<TData>,
  ): WorkflowDefinition<TData, TInput, TCurrent>;
  saga(
    configure: (saga: IWorkflowSagaBuilder<TData>) => void,
  ): IWorkflowBuilder<TData, TInput, TCurrent>;
}

export interface IWorkflowSagaBuilder<TData> {
  startWith<TInput, TOutput>(
    step: WorkflowStepClass<TData, TInput, TOutput>,
  ): IWorkflowSagaBuilder<TData>;
  then<TOutput>(
    step: WorkflowStepClass<TData, unknown, TOutput>,
  ): IWorkflowSagaBuilder<TData>;
  compensateWith(
    step: WorkflowStepClass<TData, unknown, unknown>,
  ): IWorkflowSagaBuilder<TData>;
  onError(
    handling: WorkflowErrorHandling,
    options?: WorkflowRetryOptions,
  ): IWorkflowSagaBuilder<TData>;
}

export interface ClassWorkflowBuildOptions<TData> {
  registry: WorkflowStepRegistryPort;
  initialContext?: TData | undefined;
}

export interface ClassWorkflowStepPlan<TData> {
  kind: "step";
  id: string;
  token: WorkflowStepToken<TData>;
  retries?: number | undefined;
  backoff?: ((attempt: number) => number) | undefined;
  timeout?: number | undefined;
  policy?: WorkflowErrorPolicy | undefined;
}

export interface ClassWorkflowSagaPlan<TData> {
  kind: "saga";
  id: string;
  steps: readonly {
    token: WorkflowStepToken<TData>;
    compensate?: WorkflowStepToken<TData> | undefined;
  }[];
  policy?: WorkflowErrorPolicy | undefined;
}

export type ClassWorkflowPlanStep<TData> =
  | ClassWorkflowStepPlan<TData>
  | ClassWorkflowSagaPlan<TData>;

export interface ClassWorkflowPlan<TData, TInput = unknown> {
  id: string;
  version: number;
  initialContext: TData;
  steps: readonly ClassWorkflowPlanStep<TData>[];
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  validate?: ((input: TInput) => boolean | Promise<boolean>) | undefined;
  idempotencyKey?: string | undefined;
}

export interface ReplayClassWorkflowOptions {
  registry: WorkflowStepRegistryPort;
  activityRegistry?: ActivityRegistry | undefined;
  queue?: string | undefined;
}
