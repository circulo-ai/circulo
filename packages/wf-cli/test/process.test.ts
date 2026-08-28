import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const projectDirectory = resolve(import.meta.dirname, "fixtures/real-project");
const cliPath = resolve(import.meta.dirname, "../dist/cli.mjs");

describe("published executable shape", () => {
  it("runs as a Node executable against a real project fixture", async () => {
    const result = await execFileAsync(
      process.execPath,
      [cliPath, "validate", "workflows/hello-world.json", "--json"],
      { cwd: projectDirectory },
    );
    const output: unknown = JSON.parse(result.stdout);
    expect(output).toMatchObject({ valid: true, format: "json", steps: 2 });
    expect(result.stderr).toBe("");
  });
});
