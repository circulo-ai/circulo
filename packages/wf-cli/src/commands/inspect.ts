import { loadAndValidateDefinitionAsync, isJsonOutput } from "./definition-utils";
import type { CliArguments } from "./command-runner";
import type { CliCommandContext, CliCommandResult } from "../types";

export async function executeInspectCommand(
  args: CliArguments,
  context: CliCommandContext,
): Promise<CliCommandResult> {
  const validated = await loadAndValidateDefinitionAsync(args, context);
  const output = JSON.stringify(validated.document, null, 2);
  return { exitCode: 0, output: isJsonOutput(args) ? output : `Normalized workflow definition:\n${output}` };
}
