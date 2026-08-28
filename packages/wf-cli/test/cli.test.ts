import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeCliCommand, parseCliArguments } from "../src/commands/command-runner";
import type { CliCommandContext } from "../src/types";

function context(cwd: string): CliCommandContext {
  return { cwd, stdout: () => undefined, stderr: () => undefined };
}

describe("CLI argument parsing", () => {
  it("parses commands, positional values, boolean flags, and option values", () => {
    expect(parseCliArguments(["validate", "workflow.yaml", "--config", "config.ts", "--json"]))
      .toEqual({
        command: "validate",
        positional: ["workflow.yaml"],
        options: { config: "config.ts", json: true },
      });
  });

  it("supports help aliases and rejects misspelled options", () => {
    expect(parseCliArguments(["--help"]).command).toBe("help");
    expect(() => parseCliArguments(["help", "--jsn"])).toThrow('Unknown option "--jsn"');
  });
});

describe("wf init", () => {
  it("creates a safe starter project and refuses accidental overwrite", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wf-cli-"));
    try {
      const first = await executeCliCommand(
        parseCliArguments(["init"]),
        context(directory),
      );
      expect(first.exitCode).toBe(0);
      expect(readFileSync(join(directory, "wf.config.ts"), "utf8")).toContain("defineWfConfig");
      expect(readFileSync(join(directory, "workflows/hello-world.json"), "utf8")).toContain("HelloWorld");
      await expect(
        executeCliCommand(parseCliArguments(["init"]), context(directory)),
      ).rejects.toThrow("Refusing to overwrite");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
