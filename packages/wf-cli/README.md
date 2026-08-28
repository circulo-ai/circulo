# @circulo-ai/wf-cli

`@circulo-ai/wf-cli` is the developer toolkit for [@circulo-ai/wf](https://www.npmjs.com/package/@circulo-ai/wf). It loads the same application-owned `wf.config.ts` used by a server, validates declarative JSON/YAML workflows against an explicit allowlisted registry, prints normalized definitions, renders linear graphs, and checks project configuration.

The CLI is intentionally safe by default:

- `StepType` is always a registry key. The CLI never dynamically imports a class named by a workflow document.
- Read-only commands do not call `createRuntime()`, so `wf doctor`, `wf validate`, `wf inspect`, `wf graph`, and `wf registry list` do not open Redis, Postgres, queues, or network connections.
- `wf init` never overwrites an existing file unless `--force` is supplied.
- The package is strict TypeScript with no `any` declarations and supports Node.js 18+.

## Install

```bash
npm install @circulo-ai/wf @circulo-ai/wf-cli
```

The package installs the YAML parser for the CLI, so `.yaml` and `.yml` files work without an extra CLI dependency. The runtime package remains free to use its optional YAML peer dependency independently.

## Output formatting

Human-readable commands use a shared typed print layer backed by [`cli-table3`](https://www.npmjs.com/package/cli-table3). This keeps command output consistent: records are rendered as Unicode tables, structured values are pretty-printed JSON, and graph text is emitted without decoration so it can be copied directly into another tool.

Use `--json` whenever another program will consume the result. JSON output is two-space indented, contains no ANSI color codes, and is stable enough for CI logs and scripts. Human output is intended for people and may include headings and tables.

```bash
npx wf validate workflows/orders.json
npx wf validate workflows/orders.json --json
```

Table cells support strings, numbers, booleans, `bigint`, `null`, and `undefined`. `null` is shown as `null` and an absent value is shown as `—`. Long cell values wrap at word boundaries when possible. Empty collections say `No results.` instead of producing a confusing blank table.

The same printer is available to typed integrations:

```ts
import { formatJson, formatTable, renderOutput } from "@circulo-ai/wf-cli";

const json = formatJson({ healthy: true, attempts: 2 });
const table = formatTable(
  [{ key: "name", header: "Name" }, { key: "status", header: "Status" }],
  [{ name: "orders", status: "ready" }],
);
const output = renderOutput({ type: "json", value: { json, table } });
```

`renderOutput()` accepts a typed `text`, `lines`, `json`, or `table` value. Keeping formatting at this boundary lets editor integrations and CI wrappers reuse the exact same behavior without writing to process streams.

## Start a project

Run this in an empty application directory:

```bash
npx wf init .
```

Output:

```text
Created /app/wf.config.ts
Created /app/workflows/hello-world.json
Next: register your application steps in wf.config.ts, then run:
  wf validate workflows/hello-world.json
```

The command creates two files:

- `wf.config.ts`, the application/tooling composition root with an explicit registry.
- `workflows/hello-world.json`, a valid two-step linear definition.

If either generated file already exists, the command fails without changing it. Use `npx wf init . --force` only when overwriting those files is intentional.

## Share one config between the application and the CLI

Keep connector construction in the application-owned config. The CLI loads its metadata and registry, while application code calls `createRuntime()` when it actually needs a runtime.

```ts
// wf.config.ts
import {
  defineWfConfig,
  InMemoryWorkflowStepRegistry,
  type IWorkflowStep,
  type WorkflowStepContext,
} from "@circulo-ai/wf";
import { createPostgresStores } from "./src/infrastructure/workflow-stores";

type OrderData = { orderId: string };

class ReserveInventory implements IWorkflowStep<OrderData, { reservationId: string }> {
  async execute(
    context: WorkflowStepContext<OrderData>,
  ): Promise<{ reservationId: string }> {
    // Use context.signal for cancellation and an idempotency key in the real adapter.
    return { reservationId: `reservation:${context.data.orderId}` };
  }
}

const registry = new InMemoryWorkflowStepRegistry();
registry.register("orders.ReserveInventory", () => new ReserveInventory());

export default defineWfConfig({
  registry,
  profiles: {
    development: async () => ({ stores: createPostgresStores(process.env.DATABASE_URL) }),
    test: async () => ({ stores: createPostgresStores("postgres://localhost/test") }),
  },
  defaultProfile: "development",
  workflows: {
    orders: "workflows/orders.json",
  },
});
```

Application code can use the same config without passing connectors through every function:

```ts
import config from "../wf.config";

const handle = await config.createRuntime({ profile: "development" });
try {
  // Pass handle.runtime to WorkflowEngine or your worker composition root.
} finally {
  await handle.close();
}
```

The CLI does not construct that runtime during validation. This makes `wf validate` safe to use in CI and pre-commit hooks even when production credentials are unavailable.

## Validate a workflow

```bash
npx wf validate workflows/orders.json
```

Example output:

```text
┌──────────────────┬─────────────────────┐
│ Check            │ Result              │
├──────────────────┼─────────────────────┤
│ Document         │ JSON parsed         │
├──────────────────┼─────────────────────┤
│ Workflow         │ OrderFulfillment v1 │
├──────────────────┼─────────────────────┤
│ Steps            │ 2                   │
├──────────────────┼─────────────────────┤
│ Linear chain     │ reserve → charge    │
├──────────────────┼─────────────────────┤
│ Registry entries │ 2                   │
└──────────────────┴─────────────────────┘
Workflow is valid.
```

Validation parses the document, checks its schema, resolves every `stepType` through the config registry, validates retry and timeout values, and compiles through WF’s real `loadWorkflowDefinition()` path. It rejects unknown types before execution or persistence.

For CI and editor integrations, use machine-readable output:

```bash
npx wf validate workflows/orders.json --json
```

```json
{
  "valid": true,
  "format": "json",
  "workflow": { "id": "OrderFulfillment", "version": 1 },
  "steps": 2,
  "orderedStepIds": ["reserve", "charge"],
  "registryEntries": 2,
  "profile": "development"
}
```

The `profile` is reported for traceability; validation still does not invoke that profile’s runtime factory.

## JSON and YAML

JSON is supported directly by WF. The CLI also supplies the optional YAML parser when the input file ends in `.yaml` or `.yml`:

```yaml
id: OrderFulfillment
version: 1
steps:
  - id: reserve
    stepType: orders.ReserveInventory
    nextStepId: charge
    retry:
      maxAttempts: 3
      delayMs: 1000
  - id: charge
    stepType: orders.ChargePayment
```

```bash
npx wf validate workflows/orders.yaml
```

Unsupported extensions fail clearly. A YAML document with an unknown registry key fails before it can be used:

```text
Error: Unknown workflow step type: orders.ChargePayment
```

Register the key explicitly; never turn a user-controlled `StepType` into a module path or constructor lookup.

## Inspect the normalized document

```bash
npx wf inspect workflows/orders.yaml
```

The command validates first and then prints the parsed definition as JSON. This is useful for code review and for checking that YAML and JSON produce the same workflow shape.

```text
Normalized workflow definition:
{
  "id": "OrderFulfillment",
  "version": 1,
  "steps": [
    { "id": "reserve", "stepType": "orders.ReserveInventory", "nextStepId": "charge" },
    { "id": "charge", "stepType": "orders.ChargePayment" }
  ]
}
```

Use `--json` to omit the explanatory prefix when piping the output to another tool.

## Render a graph

```bash
npx wf graph workflows/orders.json
```

Output:

```text
flowchart TD
  step_reserve[reserve]
  step_reserve --> step_charge
  step_charge[charge]
```

Paste the output into a Mermaid renderer. For automation, use `npx wf graph workflows/orders.json --format json` to receive the ordered step IDs.

The first CLI release renders the linear graph model supported by declarative WF definitions. Branching and fan-out visualization will be added with the corresponding definition model rather than being guessed from a linear document.

## List the allowlisted registry

```bash
npx wf registry list
```

```text
Config: /app/wf.config.ts
┌─────────────────────────┐
│ Allowlisted step type   │
├─────────────────────────┤
│ orders.ReserveInventory │
├─────────────────────────┤
│ orders.ChargePayment    │
└─────────────────────────┘
```

JSON output is stable and suitable for tooling:

```bash
npx wf registry list --json
```

Registry factories should create a fresh step instance for each execution and close over application-owned dependencies. This keeps dependency injection explicit and avoids global mutable state.

## Check project readiness

```bash
npx wf doctor
```

```text
WF project is ready.
┌──────────────────────┬───────────────────────┐
│ Property             │ Value                 │
├──────────────────────┼───────────────────────┤
│ Config               │ /app/wf.config.ts     │
├──────────────────────┼───────────────────────┤
│ Profile              │ development           │
├──────────────────────┼───────────────────────┤
│ Profiles             │ development, test     │
├──────────────────────┼───────────────────────┤
│ Registry entries     │ 2                     │
├──────────────────────┼───────────────────────┤
│ Runtime construction │ not invoked by doctor │
└──────────────────────┴───────────────────────┘
```

`doctor` checks that the config exports `defineWfConfig()`, that the selected profile exists, and that the registry is callable. It deliberately does not perform a health check against external infrastructure. Add infrastructure probes to your application’s own deployment health endpoint, where timeouts, credentials, and redaction policy are controlled by you.

Select another config or profile with:

```bash
npx wf doctor --config ./config/wf.config.ts --profile test --json
```

## Linear graph safety rules

Declarative definitions use `nextStepId` and must be one connected chain. WF rejects:

- duplicate step IDs;
- a `nextStepId` that does not exist;
- cycles;
- unreachable steps;
- more than one predecessor for a step;
- more than one start step;
- unknown forward or compensation registry keys;
- invalid retry or timeout values.

For example, this document fails because `missing` is not declared:

```json
{
  "id": "Broken",
  "version": 1,
  "steps": [{ "id": "start", "stepType": "orders.Start", "nextStepId": "missing" }]
}
```

```text
Error: Workflow step start points to missing nextStepId missing
```

## Config path and exit behavior

The default config path is `./wf.config.ts`. Supported config files are `.ts`, `.mts`, `.cts`, `.js`, and `.mjs`.

Every successful command exits with code `0`. Missing files, invalid config exports, unsupported formats, failed parsing, failed registry resolution, and invalid graphs print an actionable error to stderr and exit with code `1`. `--json` applies to commands that produce structured output; errors remain human-readable so CI logs are useful.

## Production workflow

Recommended CI checks:

```bash
npx wf doctor --json
npx wf validate workflows/**/*.json
npx wf validate workflows/**/*.yaml
```

Run validation before persisting a new workflow version. Use a versioned registry key for every durable step implementation, keep old keys registered while historical executions may replay, and make external side effects idempotent because WF delivery and worker recovery are at-least-once concerns.

The CLI is a developer and release-time toolkit. Production execution remains the responsibility of `WorkflowEngine`, `ReplayWorkflowRunner`, `ActivityWorker`, `TimerWorker`, and your application-owned persistence/queue adapters.

## Migration from `defineWorkflow()`

Existing function workflows continue to work unchanged. Adopt the CLI incrementally:

1. Add `wf.config.ts` and register class/declarative steps.
2. Keep existing `defineWorkflow()` definitions for execution.
3. Run `wf doctor` and `wf validate` in CI for new JSON/YAML definitions.
4. Migrate one workflow at a time when stable step IDs, versioning, and idempotency behavior are defined.

The CLI does not rewrite function DSL code or silently alter runtime adapters. This keeps the migration reviewable and preserves the existing replay contract.

## API for integrations

The package also exports typed services for custom tooling:

```ts
import { executeCliCommand, parseCliArguments } from "@circulo-ai/wf-cli";

const result = await executeCliCommand(
  parseCliArguments(["validate", "workflows/orders.json", "--json"]),
  {
    cwd: process.cwd(),
    stdout: () => undefined,
    stderr: () => undefined,
  },
);

if (result.exitCode !== 0) throw new Error(result.output);
```

Command services return typed results and do not write to process streams. The executable is only a small adapter around those services, which makes editor plugins, CI wrappers, and tests straightforward to build.
