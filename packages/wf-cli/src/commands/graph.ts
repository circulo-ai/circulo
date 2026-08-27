import { loadAndValidateDefinitionAsync, isJsonOutput, optionString } from "./definition-utils";
import type { CliArguments } from "./command-runner";
import type { CliCommandContext, CliCommandResult } from "../types";

export async function executeGraphCommand(
  args: CliArguments,
  context: CliCommandContext,
): Promise<CliCommandResult> {
  const validated = await loadAndValidateDefinitionAsync(args, context);
  const format = optionString(args, "format") ?? (isJsonOutput(args) ? "json" : "mermaid");
  if (format === "json") {
    return {
      exitCode: 0,
      output: JSON.stringify({ workflow: validated.document.id, steps: validated.orderedStepIds }, null, 2),
    };
  }
  if (format !== "mermaid") throw new Error(`Unsupported graph format "${format}". Use mermaid or json.`);
  const lines = ["flowchart TD"];
  for (const [index, stepId] of validated.orderedStepIds.entries()) {
    const next = validated.orderedStepIds[index + 1];
    lines.push(`  ${mermaidId(stepId)}[${stepId}]`);
    if (next) lines.push(`  ${mermaidId(stepId)} --> ${mermaidId(next)}`);
  }
  return { exitCode: 0, output: lines.join("\n") };
}

function mermaidId(value: string): string {
  return `step_${value.replace(/[^A-Za-z0-9_]/g, "_")}`;
}
