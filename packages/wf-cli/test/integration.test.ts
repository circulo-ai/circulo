import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  executeCliCommand,
  parseCliArguments,
} from "../src/commands/command-runner";
import type { CliCommandContext } from "../src/types";

const projectDirectory = resolve(import.meta.dirname, "fixtures/real-project");
const commandContext: CliCommandContext = {
  cwd: projectDirectory,
  stdout: () => undefined,
  stderr: () => undefined,
};

describe("real project integration", () => {
  it("loads the application wf.config.ts and validates JSON end to end", async () => {
    const result = await executeCliCommand(
      parseCliArguments(["validate", "workflows/hello-world.json", "--json"]),
      commandContext,
    );
    const output: unknown = JSON.parse(result.output);
    expect(output).toEqual({
      valid: true,
      format: "json",
      workflow: { id: "HelloWorld", version: 1 },
      steps: 2,
      orderedStepIds: ["Hello", "Goodbye"],
      registryEntries: 2,
      profile: "test",
    });
  });

  it("validates YAML and produces a Mermaid graph", async () => {
    const validation = await executeCliCommand(
      parseCliArguments(["validate", "workflows/hello-world.yaml"]),
      commandContext,
    );
    expect(validation.output).toContain("Workflow is valid.");
    const graph = await executeCliCommand(
      parseCliArguments(["graph", "workflows/hello-world.yaml"]),
      commandContext,
    );
    expect(graph.output).toBe(
      [
        "flowchart TD",
        "  step_Hello[Hello]",
        "  step_Hello --> step_Goodbye",
        "  step_Goodbye[Goodbye]",
      ].join("\n"),
    );
  });

  it("lists only allowlisted registry keys", async () => {
    const result = await executeCliCommand(
      parseCliArguments(["registry", "list", "--json"]),
      commandContext,
    );
    const output: unknown = JSON.parse(result.output);
    expect(output).toMatchObject({ keys: ["demo.Hello", "demo.Goodbye"] });
  });

  it("rejects an unknown profile before reading runtime resources", async () => {
    await expect(
      executeCliCommand(
        parseCliArguments([
          "validate",
          "workflows/hello-world.json",
          "--profile",
          "production",
        ]),
        commandContext,
      ),
    ).rejects.toThrow('Profile "production" is not configured');
  });
});
