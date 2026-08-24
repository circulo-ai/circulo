import type { ActivityDefinition, ActivityRegistry } from "../models";

export class InMemoryActivityRegistry implements ActivityRegistry {
  private readonly definitions = new Map<
    string,
    ActivityDefinition<unknown, unknown>
  >();

  register<TInput, TOutput>(
    definition: ActivityDefinition<TInput, TOutput>,
  ): void {
    if (!definition.name.trim()) {
      throw new Error("Activity name must not be empty");
    }
    if (!Number.isInteger(definition.version) || definition.version < 1) {
      throw new RangeError("Activity version must be a positive integer");
    }
    validateRetryPolicy(definition.retryPolicy);
    const key = activityKey(definition.name, definition.version);
    if (this.definitions.has(key)) {
      throw new Error(`Activity ${key} is already registered`);
    }
    this.definitions.set(
      key,
      definition as ActivityDefinition<unknown, unknown>,
    );
  }

  get<TInput, TOutput>(
    name: string,
    version = 1,
  ): ActivityDefinition<TInput, TOutput> | undefined {
    return this.definitions.get(activityKey(name, version)) as
      | ActivityDefinition<TInput, TOutput>
      | undefined;
  }

  list(): readonly ActivityDefinition<unknown, unknown>[] {
    return [...this.definitions.values()];
  }
}

export function defineActivity<TInput, TOutput>(
  name: string,
  run: ActivityDefinition<TInput, TOutput>["run"],
  options: Partial<
    Pick<ActivityDefinition<TInput, TOutput>, "version" | "retryPolicy">
  > = {},
): ActivityDefinition<TInput, TOutput> {
  const definition: ActivityDefinition<TInput, TOutput> = {
    name,
    version: options.version ?? 1,
    retryPolicy: {
      maxAttempts: 3,
      ...(options.retryPolicy ?? {}),
    },
    run,
  };
  validateRetryPolicy(definition.retryPolicy);
  return definition;
}

function activityKey(name: string, version: number): string {
  return `${name}:${version}`;
}

function validateRetryPolicy(
  policy: ActivityDefinition<unknown, unknown>["retryPolicy"],
): void {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new RangeError("Activity maxAttempts must be a positive integer");
  }
  for (const [name, value] of [
    ["initialDelayMs", policy.initialDelayMs],
    ["maxDelayMs", policy.maxDelayMs],
    ["multiplier", policy.multiplier],
    ["jitter", policy.jitter],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new RangeError(`Activity ${name} must be finite and non-negative`);
    }
  }
  if (policy.multiplier !== undefined && policy.multiplier < 1) {
    throw new RangeError("Activity multiplier must be at least 1");
  }
  if (policy.jitter !== undefined && policy.jitter > 1) {
    throw new RangeError("Activity jitter must be between 0 and 1");
  }
}
