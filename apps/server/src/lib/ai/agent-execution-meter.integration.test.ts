import {
  DEFAULT_AGENT_EXECUTION_SETTINGS,
  agentExecutionSettingsSchema,
} from "@circulo-ai/types";
import { generateText, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  withAgentExecutionMetering,
  type AgentExecutionMeteringContext,
} from "./agent-execution-meter";

const fixture = vi.hoisted(() => ({ client: undefined as any }));

vi.mock("@/db", async () => {
  const { PGlite } =
    await import("../../../../../packages/db/node_modules/@electric-sql/pglite/dist/index.js");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@circulo-ai/db/schema");
  fixture.client = new PGlite();
  return { ...schema, db: drizzle(fixture.client, { schema }) };
});

vi.mock("@/lib/deployment/instance-auth", () => ({
  isCloudRuntime: () => false,
}));
vi.mock("@/lib/usage-ledger", () => ({ usageEventForModel: vi.fn() }));

beforeAll(async () => {
  await fixture.client.exec(`
    CREATE TABLE agent_execution_settings (
      organization_id text PRIMARY KEY,
      config jsonb NOT NULL,
      updated_by text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE agent_execution_reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id text NOT NULL,
      user_id text,
      request_id text NOT NULL,
      workflow_run_id text,
      agent_execution_id text,
      model text,
      feature text NOT NULL,
      reserved_tokens bigint NOT NULL,
      actual_tokens bigint,
      status text NOT NULL DEFAULT 'reserved',
      idempotency_key text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      reconciled_at timestamptz
    );
    CREATE INDEX agent_execution_reservations_org_created_idx
      ON agent_execution_reservations (organization_id, created_at);
  `);
});

afterAll(() => fixture.client.close());
beforeEach(async () => {
  await fixture.client.exec(
    "TRUNCATE agent_execution_reservations, agent_execution_settings",
  );
});

function meterContext(
  settings: AgentExecutionMeteringContext["settings"] = structuredClone(
    DEFAULT_AGENT_EXECUTION_SETTINGS,
  ),
  workflowRunId = "workflow-1",
): AgentExecutionMeteringContext {
  return {
    organizationId: "org-1",
    userId: "user-1",
    workflowRunId,
    agentExecutionId: `${workflowRunId}:agent-1`,
    settings,
    feature: "agent",
  };
}

function model() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: "ok" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "text-1" });
          controller.enqueue({ type: "text-delta", id: "text-1", delta: "ok" });
          controller.enqueue({ type: "text-end", id: "text-1" });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: {
                total: 10,
                noCache: 10,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 5, text: 5, reasoning: 0 },
            },
          });
          controller.close();
        },
      }),
    }),
  });
}

describe("agent execution metering", () => {
  it("validates defaults and allows eligible run caps to be uncapped", () => {
    expect(
      agentExecutionSettingsSchema.parse(DEFAULT_AGENT_EXECUTION_SETTINGS),
    ).toEqual(DEFAULT_AGENT_EXECUTION_SETTINGS);
    expect(
      agentExecutionSettingsSchema.safeParse({
        ...DEFAULT_AGENT_EXECUTION_SETTINGS,
        agentLoop: {
          ...DEFAULT_AGENT_EXECUTION_SETTINGS.agentLoop,
          tokens: null,
        },
      }).success,
    ).toBe(true);
    expect(
      agentExecutionSettingsSchema.safeParse({
        ...DEFAULT_AGENT_EXECUTION_SETTINGS,
        agentLoop: {
          ...DEFAULT_AGENT_EXECUTION_SETTINGS.agentLoop,
          modelSteps: 0,
        },
      }).success,
    ).toBe(false);
  });

  it("reserves before generation and reconciles provider usage", async () => {
    const result = await generateText({
      model: withAgentExecutionMetering(
        model(),
        meterContext(),
        "openai",
        "gpt-test",
      ),
      prompt: "hello",
      maxOutputTokens: 16,
    });

    expect(result.text).toBe("ok");
    const { rows } = await fixture.client.query(
      "SELECT status, reserved_tokens, actual_tokens FROM agent_execution_reservations",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "consumed",
      actual_tokens: 15,
    });
    expect(Number(rows[0].reserved_tokens)).toBeGreaterThanOrEqual(15);
  });

  it("uses conservative reservations for long text prompts", async () => {
    const settings = structuredClone(DEFAULT_AGENT_EXECUTION_SETTINGS);
    settings.usageBudgets.rollingFiveHourTokens = 12_000;

    await expect(
      generateText({
        model: withAgentExecutionMetering(
          model(),
          meterContext(settings),
          "openai",
          "gpt-test",
        ),
        prompt: "text ".repeat(6_000),
        maxOutputTokens: 16,
      }),
    ).rejects.toThrow("rolling five-hour token budget");
    const { rows } = await fixture.client.query(
      "SELECT id FROM agent_execution_reservations",
    );
    expect(rows).toEqual([]);
  });

  it("serializes concurrent reservations against workspace rolling budgets", async () => {
    const settings = structuredClone(DEFAULT_AGENT_EXECUTION_SETTINGS);
    settings.usageBudgets.rollingFiveHourTokens = 50;
    const context = meterContext(settings, "concurrent-workflow");
    const run = () =>
      generateText({
        model: withAgentExecutionMetering(
          model(),
          context,
          "openai",
          "gpt-test",
        ),
        prompt: "hello",
        maxOutputTokens: 16,
      });

    const outcomes = await Promise.allSettled([run(), run()]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    const { rows } = await fixture.client.query(
      "SELECT status FROM agent_execution_reservations",
    );
    expect(rows).toEqual([{ status: "consumed" }]);
  });

  it("stops model work after the snapshotted workflow runtime expires", async () => {
    const settings = structuredClone(DEFAULT_AGENT_EXECUTION_SETTINGS);
    settings.workflow.runtimeMs = 1_000;
    const expiredContext = {
      ...meterContext(settings),
      workflowStartedAt: Date.now() - 2_000,
    };

    await expect(
      generateText({
        model: withAgentExecutionMetering(
          model(),
          expiredContext,
          "openai",
          "gpt-test",
        ),
        prompt: "hello",
        maxOutputTokens: 16,
      }),
    ).rejects.toThrow("workspace workflow runtime limit");
    const { rows } = await fixture.client.query(
      "SELECT id FROM agent_execution_reservations",
    );
    expect(rows).toEqual([]);
  });

  it("counts a started stream conservatively when it is interrupted", async () => {
    const brokenModel = new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "text-1" });
            controller.error(new Error("provider stream interrupted"));
          },
        }),
      }),
    });

    const result = streamText({
      model: withAgentExecutionMetering(
        brokenModel,
        meterContext(),
        "openai",
        "gpt-test",
      ),
      prompt: "hello",
      maxOutputTokens: 16,
    });
    await expect(result.text).rejects.toThrow("provider stream interrupted");

    const { rows } = await fixture.client.query(
      "SELECT status, actual_tokens, reserved_tokens FROM agent_execution_reservations",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("consumed");
    expect(rows[0].actual_tokens).toBe(rows[0].reserved_tokens);
  });
});
