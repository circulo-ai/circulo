import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { databaseHarnessJournal, recordApprovedHarnessAction } from "./runtime";
const fixture = vi.hoisted(() => ({
  client: undefined as unknown as {
    exec(sql: string): Promise<unknown>;
    close(): Promise<void>;
  },
}));
vi.mock("@/db", async () => {
  const { PGlite } =
    await import("../../../../../packages/db/node_modules/@electric-sql/pglite/dist/index.js");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@circulo-ai/db/schema");
  const client = new PGlite();
  fixture.client = client;
  return { ...schema, db: drizzle(client, { schema }) };
});

beforeAll(async () => {
  // Exercise the production journal adapter and PostgreSQL conflict semantics
  // without unrelated organization fixtures or external model credentials.
  await fixture.client.exec(
    "CREATE TABLE workflow_run_events (id text PRIMARY KEY, workflow_id text NOT NULL, timestamp bigint NOT NULL, sequence bigint GENERATED ALWAYS AS IDENTITY, event_type text NOT NULL, payload jsonb NOT NULL, correlation_id text)",
  );
});
afterAll(() => fixture.client.close());
describe("database execution journal", () => {
  it("replaces pending approval observations only after an approved action has succeeded", async () => {
    const journal = databaseHarnessJournal("approved-run", "execution");
    await journal.put("operation:approval", "harness.tool", {
      record: {
        toolCallId: "action",
        toolName: "mcp_action",
        fingerprint: "same",
        status: "completed",
        successful: false,
        output: { approvalId: "approval", status: "pending" },
      },
    });
    await recordApprovedHarnessAction("approved-run", "approval", {
      id: "actual-created-resource",
    });
    const loaded = await journal.load();
    expect(loaded[0]?.payload.record).toMatchObject({
      successful: true,
      approvedBy: "approval",
      output: { id: "actual-created-resource" },
    });
  });
  it("allows exactly one operation claim across competing workers", async () => {
    const first = databaseHarnessJournal("run", "execution");
    const second = databaseHarnessJournal("run", "execution");
    const claims = await Promise.all([
      first.claim("operation:one", "harness.tool", {
        record: { status: "started" },
      }),
      second.claim("operation:one", "harness.tool", {
        record: { status: "started" },
      }),
    ]);
    expect(claims.filter((claim) => claim === null)).toHaveLength(1);
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
  });
  it("restores completed outcomes from a new adapter and keeps executions isolated", async () => {
    const first = databaseHarnessJournal("run", "execution");
    await first.put("operation:one", "harness.tool", {
      record: { status: "completed", output: { id: "saved-document" } },
    });
    const recovered = databaseHarnessJournal("run", "execution");
    expect((await recovered.load())[0]?.payload.record).toEqual({
      status: "completed",
      output: { id: "saved-document" },
    });
    expect(
      await databaseHarnessJournal("run", "other-execution").load(),
    ).toEqual([]);
    expect(
      await databaseHarnessJournal("other-run", "execution").load(),
    ).toEqual([]);
  });
});
