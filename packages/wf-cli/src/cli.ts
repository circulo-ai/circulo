#!/usr/bin/env node
import {
  executeCliCommand,
  parseCliArguments,
} from "./commands/command-runner";

const context = {
  cwd: process.cwd(),
  stdout: (message: string) => process.stdout.write(`${message}\n`),
  stderr: (message: string) => process.stderr.write(`${message}\n`),
};

try {
  const result = await executeCliCommand(
    parseCliArguments(process.argv.slice(2)),
    context,
  );
  context.stdout(result.output);
  process.exitCode = result.exitCode;
} catch (error) {
  context.stderr(
    error instanceof Error
      ? `Error: ${error.message}`
      : "Error: Unknown failure",
  );
  process.exitCode = 1;
}
