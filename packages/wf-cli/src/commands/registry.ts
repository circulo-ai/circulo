import { loadWfProject } from "../config/load-config";
import { isJsonOutput, optionString } from "./definition-utils";
import type { CliArguments } from "./command-runner";
import type { CliCommandContext, CliCommandResult } from "../types";

export async function executeRegistryCommand(
  args: CliArguments,
  context: CliCommandContext,
): Promise<CliCommandResult> {
  const subcommand = args.positional[0];
  if (subcommand !== "list") throw new Error('Use "wf registry list".');
  const project = await loadWfProject(context.cwd, optionString(args, "config"));
  const keys = project.config.registry?.list() ?? [];
  if (isJsonOutput(args)) return { exitCode: 0, output: JSON.stringify({ configPath: project.configPath, keys }, null, 2) };
  return { exitCode: 0, output: [`Config: ${project.configPath}`, ...keys.map((key) => `- ${key}`)].join("\n") };
}
