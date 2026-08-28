import { executeGraphCommand } from "./graph";
import { executeInitCommand } from "./init";
import { executeInspectCommand } from "./inspect";
import { executeRegistryCommand } from "./registry";
import { executeValidateCommand } from "./validate";
import { executeDoctorCommand } from "./doctor";
import type { CliCommandContext, CliCommandResult } from "../types";

export interface CliArguments {
  readonly command: string;
  readonly positional: readonly string[];
  readonly options: Readonly<Record<string, string | boolean>>;
}

export function parseCliArguments(argv: readonly string[]): CliArguments {
  if (argv[0] === "-h" || argv[0] === "--help") return { command: "help", positional: [], options: {} };
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};
  const supportedOptions = new Set(["config", "profile", "json", "force", "format"]);
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument) continue;
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const [rawKey, inlineValue] = argument.slice(2).split("=", 2);
    const key = rawKey ?? "";
    if (!key) throw new Error("Option names must not be empty.");
    if (!supportedOptions.has(key)) throw new Error(`Unknown option "--${key}".`);
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return { command, positional, options };
}

export async function executeCliCommand(
  args: CliArguments,
  context: CliCommandContext,
): Promise<CliCommandResult> {
  switch (args.command) {
    case "help":
      return { exitCode: 0, output: helpText() };
    case "init":
      return executeInitCommand(args, context);
    case "validate":
      return executeValidateCommand(args, context);
    case "inspect":
      return executeInspectCommand(args, context);
    case "graph":
      return executeGraphCommand(args, context);
    case "registry":
      return executeRegistryCommand(args, context);
    case "doctor":
      return executeDoctorCommand(args, context);
    default:
      throw new Error(`Unknown command "${args.command}". Run "wf help" for usage.`);
  }
}

function helpText(): string {
  return [
    "wf — the developer toolkit for @circulo-ai/wf",
    "",
    "Commands:",
    "  init [directory]              Create a starter wf.config.ts and workflow",
    "  validate <file>               Validate JSON/YAML and the linear step graph",
    "  inspect <file>                Print the normalized workflow document",
    "  graph <file>                  Print a Mermaid graph (or --format json)",
    "  registry list                 List allowlisted step registry keys",
    "  doctor                        Check config/profile/registry readiness",
    "",
    "Global options:",
    "  --config <path>               Config path (default: ./wf.config.ts)",
    "  --profile <name>              Config profile for project diagnostics",
    "  --json                        Machine-readable output where supported",
    "  --force                       Allow wf init to overwrite generated files",
    "",
  ].join("\n");
}
