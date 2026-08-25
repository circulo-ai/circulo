import type { Step, WorkflowContext, WorkflowDefinition } from "../models";
import { normalizeResult } from "./class-builder";
import type {
  SerializedWorkflowDefinition,
  SerializedWorkflowStep,
  WorkflowDefinitionLoadOptions,
  WorkflowDefinitionLoaderPort,
} from "./models";

export class WorkflowDefinitionLoader implements WorkflowDefinitionLoaderPort {
  load<TContext, TInput, TOutput>(
    source: string,
    options: WorkflowDefinitionLoadOptions<TContext>,
  ): WorkflowDefinition<TContext, TInput, TOutput> {
    return loadWorkflowDefinition<TContext, TInput, TOutput>(source, options);
  }
}

export function loadWorkflowDefinition<
  TContext = Record<string, never>,
  TInput = unknown,
  TOutput = unknown,
>(
  source: string,
  options: WorkflowDefinitionLoadOptions<TContext>,
): WorkflowDefinition<TContext, TInput, TOutput> {
  if (!source.trim()) throw new Error("Workflow definition document must not be empty");
  const format = options.format ?? "json";
  const parser = options.parser ?? options.yamlParser;
  if (format === "yaml" && !parser) {
    throw new Error(
      'YAML workflow definitions require the optional "yaml" dependency. Install it with `npm install yaml` and pass its parse function as `parser`.',
    );
  }
  const document = format === "json" ? parseJson(source) : parser!.parse(source);
  const serialized = validateDocument(document);
  validateLinearGraph(serialized.steps);
  const orderedSteps = orderLinearGraph(serialized.steps);

  const steps: Step<TContext, unknown, unknown>[] = orderedSteps.map(
    (serializedStep) => {
      if (!options.registry.has(serializedStep.stepType)) {
        throw new Error(`Unknown workflow step type: ${serializedStep.stepType}`);
      }
      if (
        serializedStep.compensateStepType &&
        !options.registry.has(serializedStep.compensateStepType)
      ) {
        throw new Error(
          `Unknown workflow compensation step type: ${serializedStep.compensateStepType}`,
        );
      }
      const retries = serializedStep.retry?.maxAttempts;
      const delayMs = serializedStep.retry?.delayMs;
      validateRetry(retries, delayMs);
      validateTimeout(serializedStep.timeoutMs);
      return compileSerializedStep(serializedStep, options);
    },
  );

  return {
    name: serialized.id,
    version: serialized.version,
    initialContext: options.initialContext ?? ({} as TContext),
    steps,
    tags: serialized.tags,
    metadata: serialized.metadata,
  };
}

function compileSerializedStep<TContext>(
  serialized: SerializedWorkflowStep,
  options: WorkflowDefinitionLoadOptions<TContext>,
): Step<TContext, unknown, unknown> {
  const retries = serialized.retry?.maxAttempts;
  const delayMs = serialized.retry?.delayMs;
  return {
    id: serialized.id,
    name: serialized.stepType,
    retries: retries === undefined ? undefined : retries - 1,
    backoff: delayMs === undefined ? undefined : () => delayMs,
    timeout: serialized.timeoutMs,
    run: async (input, context) => {
      const step = options.registry.create(serialized.stepType, {
        workflowId: context.workflow.id,
        workflowVersion: context.workflow.version,
        stepId: serialized.id,
      });
      return normalizeResult(await step.execute(toStepContext(input, context)));
    },
    compensation: serialized.compensateStepType
      ? async (input, context) => {
          const compensation = options.registry.create(
            serialized.compensateStepType!,
            {
              workflowId: context.workflow.id,
              workflowVersion: context.workflow.version,
              stepId: serialized.id,
            },
          );
          await compensation.execute(toStepContext(input, context));
        }
      : undefined,
  };
}

function toStepContext<TContext>(
  input: unknown,
  context: WorkflowContext<TContext>,
) {
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

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON workflow definition: ${(error as Error).message}`);
  }
}

function validateDocument(document: unknown): SerializedWorkflowDefinition {
  if (!isRecord(document)) throw new Error("Workflow definition must be an object");
  const id = document["id"];
  const version = document["version"];
  const steps = document["steps"];
  if (typeof id !== "string" || !id.trim()) throw new Error("Workflow definition id must not be empty");
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) throw new Error("Workflow definition version must be a positive integer");
  if (!Array.isArray(steps) || steps.length === 0) throw new Error("Workflow definition must contain at least one step");
  return {
    id,
    version,
    steps: steps.map(validateStep),
    ...(isStringRecord(document["tags"]) ? { tags: document["tags"] } : {}),
    ...(isRecord(document["metadata"]) ? { metadata: document["metadata"] } : {}),
  };
}

function validateStep(value: unknown): SerializedWorkflowStep {
  if (!isRecord(value)) throw new Error("Workflow step must be an object");
  const id = value["id"];
  const stepType = value["stepType"];
  const nextStepId = value["nextStepId"];
  const compensateStepType = value["compensateStepType"];
  if (typeof id !== "string" || !id.trim()) throw new Error("Workflow step id must not be empty");
  if (typeof stepType !== "string" || !stepType.trim()) throw new Error(`Workflow step ${id} must define stepType`);
  if (nextStepId !== undefined && typeof nextStepId !== "string") throw new Error(`Workflow step ${id} has an invalid nextStepId`);
  if (compensateStepType !== undefined && typeof compensateStepType !== "string") throw new Error(`Workflow step ${id} has an invalid compensateStepType`);
  const retry = value["retry"];
  if (retry !== undefined && !isRecord(retry)) throw new Error(`Workflow step ${id} has an invalid retry policy`);
  const maxAttempts = isRecord(retry) ? retry["maxAttempts"] : undefined;
  const delayMs = isRecord(retry) ? retry["delayMs"] : undefined;
  const timeoutMs = value["timeoutMs"];
  if (maxAttempts !== undefined && typeof maxAttempts !== "number") throw new Error(`Workflow step ${id} has an invalid retry.maxAttempts`);
  if (delayMs !== undefined && typeof delayMs !== "number") throw new Error(`Workflow step ${id} has an invalid retry.delayMs`);
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") throw new Error(`Workflow step ${id} has an invalid timeoutMs`);
  return {
    id,
    stepType,
    ...(nextStepId !== undefined ? { nextStepId } : {}),
    ...(isRecord(retry)
      ? {
          retry: {
            ...(maxAttempts !== undefined ? { maxAttempts } : {}),
            ...(delayMs !== undefined ? { delayMs } : {}),
          },
        }
      : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(compensateStepType !== undefined ? { compensateStepType } : {}),
  };
}

function validateLinearGraph(steps: readonly SerializedWorkflowStep[]): void {
  const byId = new Map<string, SerializedWorkflowStep>();
  const incoming = new Map<string, number>();
  for (const step of steps) {
    if (byId.has(step.id)) throw new Error(`Duplicate workflow step id: ${step.id}`);
    byId.set(step.id, step);
    incoming.set(step.id, 0);
  }
  for (const step of steps) {
    if (!step.nextStepId) continue;
    if (!byId.has(step.nextStepId)) throw new Error(`Workflow step ${step.id} points to missing nextStepId ${step.nextStepId}`);
    const count = (incoming.get(step.nextStepId) ?? 0) + 1;
    incoming.set(step.nextStepId, count);
    if (count > 1) throw new Error(`Workflow definition is non-linear: ${step.nextStepId} has multiple predecessors`);
  }
  const roots = steps.filter((step) => (incoming.get(step.id) ?? 0) === 0);
  if (roots.length !== 1) throw new Error("Workflow definition must have exactly one start step");
  const visited = new Set<string>();
  let current: SerializedWorkflowStep | undefined = roots[0];
  while (current) {
    if (visited.has(current.id)) throw new Error(`Workflow definition contains a cycle at ${current.id}`);
    visited.add(current.id);
    current = current.nextStepId ? byId.get(current.nextStepId) : undefined;
  }
  if (visited.size !== steps.length) throw new Error("Workflow definition contains unreachable steps");
}

function orderLinearGraph(
  steps: readonly SerializedWorkflowStep[],
): readonly SerializedWorkflowStep[] {
  const byId = new Map(steps.map((step) => [step.id, step] as const));
  const targeted = new Set(steps.flatMap((step) => step.nextStepId ? [step.nextStepId] : []));
  const ordered: SerializedWorkflowStep[] = [];
  let current = steps.find((step) => !targeted.has(step.id));
  while (current) {
    ordered.push(current);
    current = current.nextStepId ? byId.get(current.nextStepId) : undefined;
  }
  return ordered;
}

function validateRetry(maxAttempts: number | undefined, delayMs: number | undefined): void {
  if (maxAttempts !== undefined && (!Number.isInteger(maxAttempts) || maxAttempts < 1)) throw new RangeError("retry.maxAttempts must be a positive integer");
  if (delayMs !== undefined && (!Number.isFinite(delayMs) || delayMs < 0)) throw new RangeError("retry.delayMs must be finite and non-negative");
}

function validateTimeout(timeoutMs: number | undefined): void {
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) throw new RangeError("timeoutMs must be a positive number");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
