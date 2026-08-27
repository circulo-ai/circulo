import type {
  SerializedWorkflowDefinition,
  WfConfig,
  WorkflowStepRegistryPort,
} from "@circulo-ai/wf";

export interface WfCliConfig {
  readonly configPath?: string | undefined;
  readonly profile?: string | undefined;
  readonly format?: "text" | "json" | undefined;
}

export interface LoadedWfProject {
  readonly configPath: string;
  readonly config: WfConfig<unknown, unknown, unknown>;
}

export interface CliCommandContext {
  readonly cwd: string;
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

export interface CliCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

export interface ValidatedWorkflowDocument {
  readonly document: SerializedWorkflowDefinition;
  readonly registry: WorkflowStepRegistryPort;
  readonly format: "json" | "yaml";
  readonly orderedStepIds: readonly string[];
  readonly profile: string;
}
