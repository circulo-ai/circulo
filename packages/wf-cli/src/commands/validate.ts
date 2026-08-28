import { loadAndValidateDefinitionAsync, isJsonOutput } from "./definition-utils";
import type { CliArguments } from "./command-runner";
import type { CliCommandContext, CliCommandResult } from "../types";
import { renderOutput } from "../output/printer";

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
  if (isJsonOutput(args)) return { exitCode: 0, output: renderOutput({ type: "json", value: result }) };
  return {
    exitCode: 0,
    output: `${renderOutput({
      type: "table",
      columns: [
        { key: "check", header: "Check", width: 24 },
        { key: "result", header: "Result" },
      ],
      rows: [
        { check: "Document", result: `${validated.format.toUpperCase()} parsed` },
        { check: "Workflow", result: `${validated.document.id} v${validated.document.version}` },
        { check: "Steps", result: validated.document.steps.length },
        { check: "Linear chain", result: validated.orderedStepIds.join(" → ") },
        { check: "Registry entries", result: validated.registry.list().length },
      ],
    })}\nWorkflow is valid.`,
  };
}
