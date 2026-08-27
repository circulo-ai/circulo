import { loadWfProject } from "../config/load-config";
import { isJsonOutput, optionString } from "./definition-utils";
import type { CliArguments } from "./command-runner";
import type { CliCommandContext, CliCommandResult } from "../types";

export async function executeDoctorCommand(
  args: CliArguments,
  context: CliCommandContext,
): Promise<CliCommandResult> {
  const project = await loadWfProject(context.cwd, optionString(args, "config"));
  const profile = optionString(args, "profile") ?? project.config.defaultProfile;
  if (!project.config.profiles.includes(profile)) {
    throw new Error(
      `Profile "${profile}" is not configured. Available profiles: ${project.config.profiles.join(", ")}.`,
    );
  }
  const registryKeys = project.config.registry?.list() ?? [];
  const result = {
    healthy: true,
    configPath: project.configPath,
    profile,
    profiles: project.config.profiles,
    registryEntries: registryKeys.length,
    registryKeys,
    runtimeConstruction: "not invoked by doctor",
  } as const;
  if (isJsonOutput(args)) return { exitCode: 0, output: JSON.stringify(result, null, 2) };
  return {
    exitCode: 0,
    output: [
      "WF project is ready.",
      `Config: ${project.configPath}`,
      `Profile: ${profile}`,
      `Profiles: ${project.config.profiles.join(", ")}`,
      `Registry entries: ${registryKeys.length}`,
      "Runtime construction: not invoked by doctor",
    ].join("\n"),
  };
}
