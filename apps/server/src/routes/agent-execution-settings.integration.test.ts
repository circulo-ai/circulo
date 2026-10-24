import { DEFAULT_AGENT_EXECUTION_SETTINGS } from "@circulo-ai/types";
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
import router from "./agent-execution-settings";

const fixture = vi.hoisted(() => ({
  client: undefined as any,
  cloud: false,
  memberships: [] as string[],
}));

vi.mock("@/db", async () => {
  const { PGlite } =
    await import("../../../../packages/db/node_modules/@electric-sql/pglite/dist/index.js");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@circulo-ai/db/schema");
  fixture.client = new PGlite();
  return { ...schema, db: drizzle(fixture.client, { schema }) };
});
vi.mock("@/lib/create-app", () => ({ createRouter: () => new Hono() }));
vi.mock("@/lib/deployment/instance-auth", () => ({
  isCloudRuntime: () => fixture.cloud,
}));
vi.mock("@/lib/permissions", () => ({
  isMemberOf: async (userId: string, organizationId: string) =>
    fixture.memberships.includes(`${organizationId}:${userId}`),
  hasPermissionForUser: async (userId: string, organizationId: string) =>
    userId === "manager" && organizationId === "org-1",
}));
vi.mock("@/middleware/auth", () => ({
  requireAuth: async (c: any, next: any) => {
    const userId = c.req.header("x-user-id");
    const organizationId = c.req.header("x-organization-id");
    if (!userId || !organizationId)
      return c.json({ message: "Unauthorized" }, 401);
    c.set("user", { id: userId });
    c.set("activeOrgId", organizationId);
    await next();
  },
}));

const app = new Hono();
app.route("/", router);
app.onError((error: any, c) =>
  c.json({ message: error.message }, error.statusCode ?? 500),
);

function headers(userId: string, organizationId = "org-1") {
  return {
    "x-user-id": userId,
    "x-organization-id": organizationId,
    "Content-Type": "application/json",
  };
}

beforeAll(async () => {
  await fixture.client.exec(`
    CREATE TABLE agent_execution_settings (
      organization_id text PRIMARY KEY,
      config jsonb NOT NULL,
      updated_by text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
});
afterAll(() => fixture.client.close());
beforeEach(async () => {
  fixture.cloud = false;
  fixture.memberships = ["org-1:manager", "org-1:member", "org-2:member"];
  await fixture.client.exec("TRUNCATE agent_execution_settings");
});

describe("workspace agent execution settings API", () => {
  it("returns defaults to workspace members and denies non-members", async () => {
    const response = await app.request("/workspace/agent-execution-settings", {
      headers: headers("member"),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      config: DEFAULT_AGENT_EXECUTION_SETTINGS,
      canManage: false,
      usageBudgetsAvailable: true,
    });

    const denied = await app.request("/workspace/agent-execution-settings", {
      headers: headers("outsider"),
    });
    expect(denied.status).toBe(403);
  });

  it("allows only managers to persist settings and isolates workspaces", async () => {
    const config = structuredClone(DEFAULT_AGENT_EXECUTION_SETTINGS);
    config.agentLoop.modelSteps = 80;
    const saved = await app.request("/workspace/agent-execution-settings", {
      method: "PATCH",
      headers: headers("manager"),
      body: JSON.stringify(config),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ config, canManage: true });

    const readOnly = await app.request("/workspace/agent-execution-settings", {
      method: "PATCH",
      headers: headers("member"),
      body: JSON.stringify(config),
    });
    expect(readOnly.status).toBe(403);

    const otherWorkspace = await app.request(
      "/workspace/agent-execution-settings",
      { headers: headers("member", "org-2") },
    );
    expect(
      (
        (await otherWorkspace.json()) as {
          config: typeof DEFAULT_AGENT_EXECUTION_SETTINGS;
        }
      ).config,
    ).toEqual(DEFAULT_AGENT_EXECUTION_SETTINGS);
  });

  it("validates input and rejects local token budgets in cloud", async () => {
    const invalid = structuredClone(DEFAULT_AGENT_EXECUTION_SETTINGS);
    invalid.agentLoop.toolCalls = 0;
    const invalidResponse = await app.request(
      "/workspace/agent-execution-settings",
      {
        method: "PATCH",
        headers: headers("manager"),
        body: JSON.stringify(invalid),
      },
    );
    expect(invalidResponse.status).toBe(400);

    fixture.cloud = true;
    const cloudBudget = structuredClone(DEFAULT_AGENT_EXECUTION_SETTINGS);
    cloudBudget.usageBudgets.rollingFiveHourTokens = 10_000;
    const cloudResponse = await app.request(
      "/workspace/agent-execution-settings",
      {
        method: "PATCH",
        headers: headers("manager"),
        body: JSON.stringify(cloudBudget),
      },
    );
    expect(cloudResponse.status).toBe(400);
  });
});
