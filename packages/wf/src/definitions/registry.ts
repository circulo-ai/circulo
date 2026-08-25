import type {
  IWorkflowStep,
  WorkflowStepClass,
  WorkflowStepFactory,
  WorkflowStepFactoryContext,
  WorkflowStepRegistryPort,
  WorkflowStepToken,
} from "./models";

interface Registration<TData> {
  readonly key: string;
  readonly factory: WorkflowStepFactory<TData>;
}

/**
 * An explicit allowlist for workflow step construction. No module loading or
 * reflection is performed by this registry.
 */
export class InMemoryWorkflowStepRegistry implements WorkflowStepRegistryPort {
  private readonly registrations = new Map<string, Registration<unknown>>();
  private readonly classKeys = new WeakMap<WorkflowStepClass<unknown>, string>();

  register<TData>(key: string, factory: WorkflowStepFactory<TData>): void;
  register<TData>(
    token: WorkflowStepClass<TData>,
    factory: WorkflowStepFactory<TData>,
    key?: string,
  ): void;
  register<TData>(
    keyOrToken: string | WorkflowStepClass<TData>,
    factory: WorkflowStepFactory<TData>,
    explicitKey?: string,
  ): void {
    const key =
      typeof keyOrToken === "string"
        ? keyOrToken
        : (explicitKey ?? keyOrToken.name);
    if (!key.trim()) throw new Error("Workflow step registry key must not be empty");
    if (this.registrations.has(key)) {
      throw new Error(`Workflow step registry key ${key} is already registered`);
    }
    this.registrations.set(key, {
      key,
      factory: factory as WorkflowStepFactory<unknown>,
    });
    if (typeof keyOrToken !== "string") {
      this.classKeys.set(
        keyOrToken as WorkflowStepClass<unknown>,
        key,
      );
    }
  }

  registerClass<TData>(
    token: WorkflowStepClass<TData>,
    factory: WorkflowStepFactory<TData>,
    key = token.name,
  ): void {
    this.register(token, factory, key);
  }

  create<TData>(
    token: WorkflowStepToken<TData>,
    context: WorkflowStepFactoryContext = {},
  ): IWorkflowStep<TData> {
    const registration = this.registrations.get(this.key(token));
    if (!registration) {
      throw new Error(`Unknown workflow step type: ${this.key(token)}`);
    }
    const instance = registration.factory(context);
    if (!instance || typeof instance.execute !== "function") {
      throw new Error(`Workflow step factory ${registration.key} returned an invalid step`);
    }
    return instance;
  }

  has(token: WorkflowStepToken<unknown>): boolean {
    return this.registrations.has(this.key(token));
  }

  key(token: WorkflowStepToken<unknown>): string {
    if (typeof token === "string") return token;
    return this.classKeys.get(token as WorkflowStepClass<unknown>) ?? token.name;
  }

  list(): readonly string[] {
    return [...this.registrations.keys()];
  }
}
