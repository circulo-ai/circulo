export interface WfRuntimeFactoryContext<TEnvironment> {
  readonly profile: string;
  readonly env: TEnvironment;
  readonly signal: AbortSignal;
}

export type WfRuntimeFactory<TEnvironment, TRuntime> = (
  context: WfRuntimeFactoryContext<TEnvironment>,
) => TRuntime | Promise<TRuntime>;

export type WfRuntimeDisposer<TRuntime> = (
  runtime: TRuntime,
) => void | Promise<void>;

export interface WfRuntimeProfile<TEnvironment, TRuntime> {
  readonly create: WfRuntimeFactory<TEnvironment, TRuntime>;
  readonly dispose?: WfRuntimeDisposer<TRuntime> | undefined;
}

export interface WfRuntimeHandle<TRuntime> {
  readonly profile: string;
  readonly runtime: TRuntime;
  close(): Promise<void>;
}

export interface WfConfigCreateRuntimeOptions<TEnvironment> {
  readonly profile?: string | undefined;
  readonly env?: TEnvironment | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface WfConfig<TEnvironment, TRuntime, TWorkflows = unknown> {
  readonly defaultProfile: string;
  readonly profiles: readonly string[];
  readonly workflows: TWorkflows | undefined;
  readonly registry: WorkflowStepRegistryPort | undefined;
  createRuntime(
    options?: WfConfigCreateRuntimeOptions<TEnvironment>,
  ): Promise<WfRuntimeHandle<TRuntime>>;
}

export interface WfConfigOptions<TEnvironment, TRuntime, TWorkflows = unknown> {
  /** Optional workflow catalog shared by the application and tooling. */
  readonly workflows?: TWorkflows | undefined;
  /** Optional allowlisted class/declarative step registry. */
  readonly registry?: WorkflowStepRegistryPort | undefined;
  /** A single runtime factory for applications that do not need profiles. */
  readonly createRuntime?: WfRuntimeFactory<TEnvironment, TRuntime> | undefined;
  /** Named runtime factories for local, test, staging, and production use. */
  readonly profiles?:
    | Readonly<
        Record<
          string,
          | WfRuntimeFactory<TEnvironment, TRuntime>
          | WfRuntimeProfile<TEnvironment, TRuntime>
        >
      >
    | undefined;
  readonly defaultProfile?: string | undefined;
}

export class WfConfigError extends Error {
  readonly code:
    | "WF_CONFIG_INVALID"
    | "WF_PROFILE_NOT_FOUND"
    | "WF_RUNTIME_ABORTED";

  constructor(
    message: string,
    code: "WF_CONFIG_INVALID" | "WF_PROFILE_NOT_FOUND" | "WF_RUNTIME_ABORTED",
  ) {
    super(message);
    this.name = "WfConfigError";
    this.code = code;
  }
}

/**
 * Defines lazy, profile-aware runtime construction for applications and tools.
 *
 * The function is intentionally side-effect free. Connection pools, queues,
 * stores, and workers are created only when `createRuntime()` is called, and
 * the returned handle owns their shutdown lifecycle.
 */
export function defineWfConfig<
  TEnvironment = Readonly<Record<string, string | undefined>>,
  TRuntime = unknown,
  TWorkflows = unknown,
>(
  options: WfConfigOptions<TEnvironment, TRuntime, TWorkflows>,
): WfConfig<TEnvironment, TRuntime, TWorkflows> {
  const entries = createProfileEntries(options);
  const profileNames = Object.freeze([...entries.keys()]);
  const defaultProfile = options.defaultProfile ?? profileNames[0];

  if (!defaultProfile || !entries.has(defaultProfile)) {
    throw new WfConfigError(
      `Unknown default workflow runtime profile "${defaultProfile ?? ""}". Available profiles: ${profileNames.join(", ") || "none"}.`,
      "WF_CONFIG_INVALID",
    );
  }

  return {
    defaultProfile,
    profiles: profileNames,
    workflows: options.workflows,
    registry: options.registry,
    async createRuntime(
      createOptions = {},
    ): Promise<WfRuntimeHandle<TRuntime>> {
      const profile = createOptions.profile ?? defaultProfile;
      const entry = entries.get(profile);
      if (!entry) {
        throw new WfConfigError(
          `Unknown workflow runtime profile "${profile}". Available profiles: ${profileNames.join(
            ", ",
          )}.`,
          "WF_PROFILE_NOT_FOUND",
        );
      }

      const signal = createOptions.signal ?? new AbortController().signal;
      throwIfAborted(signal, profile);

      let runtime: TRuntime | undefined;
      let created = false;
      try {
        runtime = await entry.create({
          profile,
          env: createOptions.env ?? ({} as TEnvironment),
          signal,
        });
        created = true;
        throwIfAborted(signal, profile);
      } catch (error) {
        if (created) {
          try {
            await entry.dispose?.(runtime as TRuntime);
          } catch (disposeError) {
            throw new AggregateError(
              [error, disposeError],
              `Workflow runtime creation for profile "${profile}" failed and cleanup also failed.`,
            );
          }
        }
        throw error;
      }

      let closePromise: Promise<void> | undefined;
      return {
        profile,
        runtime: runtime as TRuntime,
        close(): Promise<void> {
          closePromise ??= Promise.resolve(entry.dispose?.(runtime));
          return closePromise;
        },
      };
    },
  };
}

function createProfileEntries<TEnvironment, TRuntime>(
  options: WfConfigOptions<TEnvironment, TRuntime>,
): Map<string, WfRuntimeProfile<TEnvironment, TRuntime>> {
  const hasFactory = options.createRuntime !== undefined;
  const hasProfiles = options.profiles !== undefined;

  if (hasFactory === hasProfiles) {
    throw new WfConfigError(
      "defineWfConfig() requires exactly one of createRuntime or profiles.",
      "WF_CONFIG_INVALID",
    );
  }

  const entries = new Map<string, WfRuntimeProfile<TEnvironment, TRuntime>>();
  if (hasFactory) {
    entries.set("default", { create: options.createRuntime! });
    return entries;
  }

  for (const [name, value] of Object.entries(options.profiles!)) {
    if (!name.trim()) {
      throw new WfConfigError(
        "Workflow runtime profile names must not be empty.",
        "WF_CONFIG_INVALID",
      );
    }
    if (
      typeof value !== "function" &&
      (typeof value !== "object" ||
        value === null ||
        typeof value.create !== "function")
    ) {
      throw new WfConfigError(
        `Workflow runtime profile "${name}" must define a create function.`,
        "WF_CONFIG_INVALID",
      );
    }
    entries.set(name, typeof value === "function" ? { create: value } : value);
  }

  if (entries.size === 0) {
    throw new WfConfigError(
      "defineWfConfig() requires at least one runtime profile.",
      "WF_CONFIG_INVALID",
    );
  }
  return entries;
}

function throwIfAborted(signal: AbortSignal, profile: string): void {
  if (signal.aborted) {
    throw new WfConfigError(
      `Workflow runtime creation for profile "${profile}" was aborted.`,
      "WF_RUNTIME_ABORTED",
    );
  }
}
import type { WorkflowStepRegistryPort } from "./definitions/models";
