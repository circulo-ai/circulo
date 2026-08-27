import pc from "picocolors";
import { loadAndValidateDefinitionAsync, isJsonOutput } from "./definition-utils";
import type { CliArguments } from "./command-runner";
import type { CliCommandContext, CliCommandResult } from "../types";

export async function executeValidateCommand(
  args: CliArguments,
  context: CliCommandContext,
): Promise<CliCommandResult> {
  const validated = await loadAndValidateDefinitionAsync(args, context);
  const result = {
    valid: true,
    format: validated.format,
    workflow: { id: validated.document.id, version: validated.document.version },
    steps: validated.document.steps.length,
    orderedStepIds: validated.orderedStepIds,
    registryEntries: validated.registry.list().length,
    profile: validated.profile,
  };
  if (isJsonOutput(args)) return { exitCode: 0, output: JSON.stringify(result, null, 2) };
  return {
    exitCode: 0,
    output: [
      `${pc.green("✓")} Parsed ${validated.format.toUpperCase()}`,
      `${pc.green("✓")} Workflow: ${validated.document.id} v${validated.document.version}`,
      `${pc.green("✓")} Steps: ${validated.document.steps.length}`,
      `${pc.green("✓")} Linear chain: ${validated.orderedStepIds.join(" → ")}`,
      `${pc.green("✓")} Registry entries: ${validated.registry.list().length}`,
      "Workflow is valid.",
    ].join("\n"),
  };
}
