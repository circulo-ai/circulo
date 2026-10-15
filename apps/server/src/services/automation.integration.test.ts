import {
  chatMember,
  db,
  message,
  scheduledTask,
  workflowRun,
  workflowWebhook,
  workflowWebhookDelivery,
} from "@/db";
import { eq } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { manageScheduledTasks } from "../lib/ai/tools/manage-scheduled-tasks";
import { scheduleTask } from "../lib/ai/tools/schedule-task";
import { signWebhookPayload } from "../lib/webhooks/signature";
import tasksRouter from "../routes/automation";
import webhooksRouter from "../routes/webhooks";
import { dispatchScheduledTask } from "./scheduled-dispatch";
const fixture = vi.hoisted(() => ({
  client: undefined as any,
  startFailure: false,
  startCalls: [] as any[],
  authorized: true,
  authCalls: 0,
}));
vi.mock("@/db", async () => {
  const { PGlite } =
    await import("../../../../packages/db/node_modules/@electric-sql/pglite/dist/index.js");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@circulo-ai/db/schema");
  fixture.client = new PGlite();
  return { ...schema, db: drizzle(fixture.client, { schema }) };
});
vi.mock("@/db/repositories", () => ({
  chatRepo: {
    findById: async (id: string) => ({
      id,
      organizationId: id.startsWith("2222") ? "other-org" : "org",
      isDeleted: false,
      creatorId: "owner",
    }),
  },
  chatMemberRepo: {
    isMember: async () => fixture.authorized,
    findByUserAndChat: async () => ({ role: "owner" }),
  },
}));
vi.mock("@/lib/permissions", () => ({
  isMemberOf: async () => fixture.authorized,
  hasPermissionForUser: async (
    _user: string,
    _org: string,
    resource: string,
    action: string,
    permissions?: Record<string, string[]> | null,
  ) =>
    fixture.authorized &&
    (!permissions || permissions[resource]?.includes(action)),
}));
vi.mock("@/lib/create-app", () => ({ createRouter: () => new Hono() }));
vi.mock("@/middleware/auth", () => ({
  requireAuth: async (c: any, next: any) => {
    fixture.authCalls++;
    if (c.req.header("x-test-user") !== "owner")
      return c.json({ error: "Unauthorized" }, 401);
    c.set("user", { id: "owner" });
    c.set("activeOrgId", "org");
    const permissions = c.req.header("x-test-permissions");
    if (permissions) c.set("apiKeyPermissions", JSON.parse(permissions));
    await next();
  },
}));
vi.mock("@/lib/mcp/client", () => ({ McpClient: class {} }));
vi.mock("@/lib/server-utils", () => ({
  encryptSecret: async (value: string) => ({ encrypted: `fixture:${value}` }),
  decryptSecret: async (value: string) => ({ decrypted: value.slice(8) }),
}));
vi.mock("@/workflows/runtime/workflow-run-service", () => ({
  workflowRunService: {
    start: async (input: any) => {
      fixture.startCalls.push(input);
      if (fixture.startFailure) {
        fixture.startFailure = false;
        throw new Error("Simulated dispatch interruption");
      }
      return { runId: `run-${input.messageId}` };
    },
    run: () => new Promise(() => {}),
    resume: async () => {},
  },
}));
const chatId = "11111111-1111-4111-8111-111111111111";
const app = new Hono();
app.route("/", tasksRouter);
app.route("/", webhooksRouter);
app.onError((error: any, c) =>
  c.json({ message: error.message }, error.statusCode ?? 500),
);
const authenticated = {
  "x-test-user": "owner",
  "Content-Type": "application/json",
};

beforeAll(async () => {
  // Real PostgreSQL transaction/unique semantics, with unrelated FK fixtures
  // omitted. Model transport and auth principals are isolated test boundaries.
  for (const table of [
    scheduledTask,
    workflowWebhook,
    workflowWebhookDelivery,
    message,
    workflowRun,
    chatMember,
  ]) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => {
      const type = column.enumValues ? "text" : column.getSQLType();
      let fallback = "";
      if (column.name === "id")
        fallback =
          type === "uuid"
            ? "DEFAULT gen_random_uuid() PRIMARY KEY"
            : "PRIMARY KEY";
      else if (typeof column.default === "string")
        fallback = `DEFAULT '${column.default.replaceAll("'", "''")}'`;
      else if (type.includes("timestamp")) fallback = "DEFAULT now()";
      else if (type === "jsonb") fallback = "DEFAULT '{}'::jsonb";
      else if (type === "boolean") fallback = "DEFAULT false";
      else if (type === "integer") fallback = "DEFAULT 0";
      return `"${column.name}" ${type} ${fallback}`;
    });
    await fixture.client.exec(
      `CREATE TABLE "${config.name}" (${columns.join(",")})`,
    );
  }
  await fixture.client.exec(
    "CREATE UNIQUE INDEX webhook_event_identity ON workflow_webhook_deliveries(webhook_id, event_id)",
  );
});
afterAll(() => fixture.client.close());
beforeEach(() => {
  fixture.authorized = true;
  fixture.startCalls = [];
  fixture.startFailure = false;
  fixture.authCalls = 0;
});

async function createWebhook() {
  const result = await app.request("/automation/webhooks", {
    method: "POST",
    headers: authenticated,
    body: JSON.stringify({
      organizationId: "org",
      chatId,
      name: "Verification events",
      eventName: "fixture.received",
      source: "custom",
    }),
  });
  expect(result.status).toBe(201);
  return (await result.json()) as { webhook: { id: string }; secret: string };
}
async function deliver(
  id: string,
  secret: string,
  eventId: string,
  signatureId = eventId,
) {
  const timestamp = Date.now();
  const body = JSON.stringify({ fixture: "Non-sensitive verification event" });
  return app.request(`/automation/webhooks/${id}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-wf-timestamp": String(timestamp),
      "x-event-id": eventId,
      "x-wf-signature": signWebhookPayload(
        secret,
        timestamp,
        body,
        signatureId,
      ),
    },
    body,
  });
}

describe("automation routes and durable dispatch", () => {
  it("creates and manages schedules through the same scoped tools used in chat", async () => {
    const session = { userId: "owner", organizationId: "org" };
    const call = { toolCallId: "fixture", messages: [], context: {} };
    const create = scheduleTask({
      session,
      chatId,
      dataStream: { write() {} } as never,
    });
    const created = (await create.execute!(
      {
        name: "Agent-created fixture",
        prompt: "Reply once",
        scheduleType: "once",
        schedule: new Date(Date.now() + 60_000).toISOString(),
        timezone: "Asia/Tehran",
      },
      call,
    )) as { taskId: string; nextRunAt: Date };
    expect(created.nextRunAt).toBeTruthy();
    const manage = manageScheduledTasks({ session, chatId });
    const input = {
      taskId: created.taskId,
      name: null,
      prompt: null,
      scheduleType: null,
      schedule: null,
      timezone: null,
    };
    expect(
      await manage.execute!({ ...input, action: "pause" }, call),
    ).toMatchObject({ status: "paused" });
    expect(
      await manage.execute!({ ...input, action: "resume" }, call),
    ).toMatchObject({ status: "active" });
    expect(
      await manage.execute!(
        { ...input, action: "update", name: "Updated fixture" },
        call,
      ),
    ).toMatchObject({ name: "Updated fixture" });
    const scoped = manageScheduledTasks({
      session,
      chatId: "33333333-3333-4333-8333-333333333333",
    });
    await expect(
      scoped.execute!({ ...input, action: "pause" }, call),
    ).rejects.toThrow("current chat");
  });
  it("rejects read-only API key writes and cross-organization destinations", async () => {
    const body = {
      organizationId: "org",
      chatId,
      name: "Task",
      prompt: "Reply hello",
      scheduleType: "interval",
      schedule: "60",
      timezone: "UTC",
    };
    expect(
      (
        await app.request("/automation/tasks", {
          method: "POST",
          headers: {
            ...authenticated,
            "x-test-permissions": JSON.stringify({ automation: ["read"] }),
          },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request("/automation/tasks", {
          method: "POST",
          headers: authenticated,
          body: JSON.stringify({
            ...body,
            chatId: "22222222-2222-4222-8222-222222222222",
          }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request("/automation/webhooks", {
          method: "POST",
          headers: authenticated,
          body: JSON.stringify({
            organizationId: "other-org",
            chatId,
            name: "Cross tenant",
            eventName: "fixture",
            source: "custom",
          }),
        })
      ).status,
    ).toBe(403);
  });
  it("stores a one-time due date and recovers the same queued message after an interrupted start", async () => {
    const response = await app.request("/automation/tasks", {
      method: "POST",
      headers: authenticated,
      body: JSON.stringify({
        organizationId: "org",
        chatId,
        name: "One-time fixture",
        prompt: "Reply once",
        scheduleType: "once",
        schedule: new Date(Date.now() + 60_000).toISOString(),
        timezone: "Asia/Tehran",
      }),
    });
    expect(response.status).toBe(201);
    const task = (await response.json()) as { id: string; nextRunAt: string };
    expect(task.nextRunAt).toBeTruthy();
    for (const status of ["paused", "active"]) {
      const changed = await app.request(`/automation/tasks/${task.id}`, {
        method: "PATCH",
        headers: authenticated,
        body: JSON.stringify({ status }),
      });
      expect(changed.status).toBe(200);
      expect(await changed.json()).toMatchObject({
        timezone: "Asia/Tehran",
        status,
        nextRunAt: task.nextRunAt,
      });
    }
    await app.request(`/automation/tasks/${task.id}`, {
      method: "PATCH",
      headers: authenticated,
      body: JSON.stringify({ status: "paused" }),
    });
    const movedTo = new Date(Date.now() + 300_000).toISOString();
    const moved = await app.request(`/automation/tasks/${task.id}`, {
      method: "PATCH",
      headers: authenticated,
      body: JSON.stringify({ schedule: movedTo }),
    });
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({
      status: "paused",
      nextRunAt: movedTo,
      timezone: "Asia/Tehran",
    });
    // Resuming an overdue paused one-time task dispatches that occurrence;
    // it must not reject the past timestamp or invent a fresh occurrence.
    const overdue = new Date(Date.now() - 60_000);
    await db
      .update(scheduledTask)
      .set({
        status: "paused",
        nextRunAt: overdue,
        schedule: overdue.toISOString(),
      })
      .where(eq(scheduledTask.id, task.id));
    const resumed = await app.request(`/automation/tasks/${task.id}`, {
      method: "PATCH",
      headers: authenticated,
      body: JSON.stringify({ status: "active" }),
    });
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toMatchObject({
      timezone: "Asia/Tehran",
      nextRunAt: overdue.toISOString(),
    });
    fixture.startFailure = true;
    await expect(
      dispatchScheduledTask(task.id, new Date(Date.now() + 120_000)),
    ).rejects.toThrow("interruption");
    const [queued] = await db
      .select()
      .from(scheduledTask)
      .where(eq(scheduledTask.id, task.id));
    expect(queued?.status).toBe("completed");
    expect((queued?.metadata._execution as any).pending.messageId).toBeTruthy();
    await dispatchScheduledTask(task.id, new Date(Date.now() + 121_000));
    expect(fixture.startCalls).toHaveLength(2);
    expect(fixture.startCalls[0].messageId).toBe(
      fixture.startCalls[1].messageId,
    );
    const [saved] = await db
      .select()
      .from(scheduledTask)
      .where(eq(scheduledTask.id, task.id));
    expect((saved?.metadata._execution as any).pending).toBeUndefined();
    expect(
      await db
        .select()
        .from(message)
        .where(eq(message.id, fixture.startCalls[0].messageId)),
    ).toHaveLength(1);
  });
  it("rechecks revocation before writing a scheduled prompt", async () => {
    const [task] = await db
      .insert(scheduledTask)
      .values({
        organizationId: "org",
        chatId,
        createdBy: "owner",
        name: "Revoked fixture",
        prompt: "Do not execute",
        scheduleType: "interval",
        schedule: "60",
        timezone: "UTC",
        nextRunAt: new Date(0),
      })
      .returning();
    fixture.authorized = false;
    await dispatchScheduledTask(task!.id);
    const [saved] = await db
      .select()
      .from(scheduledTask)
      .where(eq(scheduledTask.id, task!.id));
    expect(saved?.status).toBe("paused");
    expect(fixture.startCalls).toHaveLength(0);
  });
  it("accepts signed ingress without a session, deduplicates deliveries and rejects identity tampering", async () => {
    const hook = await createWebhook();
    fixture.authCalls = 0;
    const first = await deliver(hook.webhook.id, hook.secret, "fixture-1");
    expect(first.status).toBe(202);
    expect(fixture.authCalls).toBe(0);
    const duplicate = await deliver(hook.webhook.id, hook.secret, "fixture-1");
    expect(await duplicate.json()).toMatchObject({ duplicate: true });
    expect(fixture.startCalls).toHaveLength(1);
    expect(
      (await deliver(hook.webhook.id, hook.secret, "fixture-2", "fixture-1"))
        .status,
    ).toBe(401);
    expect(
      await db
        .select()
        .from(workflowWebhookDelivery)
        .where(eq(workflowWebhookDelivery.webhookId, hook.webhook.id)),
    ).toHaveLength(1);
  });
  it("retries a failed ingress start with the same prompt and workflow identity", async () => {
    const hook = await createWebhook();
    fixture.startFailure = true;
    expect(
      (await deliver(hook.webhook.id, hook.secret, "interrupted")).status,
    ).toBe(500);
    expect(
      (await deliver(hook.webhook.id, hook.secret, "interrupted")).status,
    ).toBe(202);
    expect(fixture.startCalls[0].messageId).toBe(
      fixture.startCalls[1].messageId,
    );
    expect(
      await db
        .select()
        .from(message)
        .where(eq(message.id, fixture.startCalls[0].messageId)),
    ).toHaveLength(1);
  });
});
