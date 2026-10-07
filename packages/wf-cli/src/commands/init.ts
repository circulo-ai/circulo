import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CliCommandContext, CliCommandResult } from "../types";
import type { CliArguments } from "./command-runner";

export function executeInitCommand(
  args: CliArguments,
  context: CliCommandContext,
): CliCommandResult {
  const directory = resolve(context.cwd, args.positional[0] ?? ".");
  const force = args.options["force"] === true;
  const configPath = resolve(directory, "wf.config.ts");
  const definitionDirectory = resolve(directory, "workflows");
  const definitionPath = resolve(definitionDirectory, "hello-world.json");
  const files = new Map<string, string>([
    [configPath, configTemplate()],
    [definitionPath, definitionTemplate()],
  ]);
  const existing = [...files.keys()].filter((file) => existsSync(file));
  if (existing.length > 0 && !force) {
    throw new Error(
      `Refusing to overwrite existing files: ${existing.join(", ")}. Re-run with --force if intentional.`,
    );
  }
  mkdirSync(definitionDirectory, { recursive: true });
  for (const [file, contents] of files) writeFileSync(file, contents, "utf8");
  const output = [
    `Created ${configPath}`,
    `Created ${definitionPath}`,
    "Next: register your application steps in wf.config.ts, then run:",
    "  wf validate workflows/hello-world.json",
  ].join("\n");
  return { exitCode: 0, output };
}

function configTemplate(): string {
  return `import {
  InMemoryWorkflowStepRegistry,
  defineWfConfig,
  type IWorkflowStep,
  type WorkflowStepContext,
} from "@circulo-ai/wf";

class HelloWorld implements IWorkflowStep<Record<string, never>, string> {
  async execute(context: WorkflowStepContext<Record<string, never>>): Promise<string> {
    return "Hello, " + String(context.input ?? "world") + "!";
  }
}

class GoodbyeWorld implements IWorkflowStep<Record<string, never>, string> {
  async execute(context: WorkflowStepContext<Record<string, never>>): Promise<string> {
    return "Goodbye, " + String(context.input ?? "world") + "!";
  }
}

const registry = new InMemoryWorkflowStepRegistry();
registry.register("example.HelloWorld", () => new HelloWorld());
registry.register("example.GoodbyeWorld", () => new GoodbyeWorld());

export default defineWfConfig({
  registry,
  createRuntime: async () => ({}),
});
`;
}

function definitionTemplate(): string {
  return `${JSON.stringify(
    {
      id: "HelloWorld",
      version: 1,
      steps: [
        { id: "hello", stepType: "example.HelloWorld", nextStepId: "goodbye" },
        { id: "goodbye", stepType: "example.GoodbyeWorld" },
      ],
    },
    null,
    2,
  )}\n`;
}
