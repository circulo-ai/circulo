import { tool, ToolLoopAgent, type ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgentHarness, type HarnessJournal } from "./runtime";
import { toolFingerprint } from "./state";
vi.mock("@/db", () => ({ db: {}, workflowRunEvent: {} }));

function journal(): HarnessJournal {
  const entries = new Map<
    string,
    { type: string; payload: Record<string, unknown> }
  >();
  return {
    async load() {
      return structuredClone([...entries.values()]);
    },
    async put(key, type, payload) {
      entries.set(key, structuredClone({ type, payload }));
    },
    async claim(key, type, payload) {
      const existing = entries.get(key);
      if (existing) return structuredClone(existing.payload);
      entries.set(key, structuredClone({ type, payload }));
      return null;
    },
  };
}
const options = (store: HarnessJournal, tools: ToolSet = {}) => ({
  executionId: "execution",
  agentId: "agent",
  goal: "Research a source, write a report, and verify the saved content",
  tools,
  journal: store,
  publish: () => {},
});
async function call(tools: ToolSet, name: string, input: unknown, id: string) {
  return tools[name]!.execute!(input, {
    toolCallId: id,
    messages: [],
    context: {},
  });
}

describe("durable agent harness", () => {
  it("treats pending human approval as paused without claiming completion", async () => {
    const store = journal();
    const runtime = await createAgentHarness({
      ...options(store, {
        lookup: tool({
          inputSchema: z.object({}),
          execute: async () => ({ status: "pending", approvalId: "approval" }),
        }),
      }),
      goal: "Use lookup",
    });
    await call(runtime.tools, "lookup", {}, "lookup-call");
    const result = await runtime.finish("", "tool-calls");
    expect(result.success).toBe(false);
    expect(result.awaitingApproval).toBe(true);
    expect(result.snapshot.status).toBe("paused");
    expect(result.reason).toContain("Waiting for your approval");
    expect(result.output).toBe("");
  });

  it("forces a plan before file actions and puts actual evidence IDs beside model results", async () => {
    const runtime = await createAgentHarness(
      options(journal(), {
        createDocument: tool({
          inputSchema: z.object({}),
          execute: async () => ({ id: "document-id" }),
        }),
      }),
    );
    const prepared = await (runtime.settings.prepareStep as Function)({
      messages: [],
      initialInstructions: runtime.instructions,
    });
    expect(prepared.toolChoice).toEqual({
      type: "tool",
      toolName: "updateExecutionPlan",
    });
    expect(
      await runtime.tools.createDocument!.toModelOutput!({
        toolCallId: "actual-call",
        input: {},
        output: { id: "document-id" },
      }),
    ).toEqual({
      type: "json",
      value: {
        executionEvidenceId: "actual-call",
        toolName: "createDocument",
        successful: true,
        result: { id: "document-id" },
      },
    });
    expect((await runtime.finish("Claimed done", "stop")).reason).toContain(
      "no verified execution plan",
    );
  });
  it("stops repeated invalid control calls before spending the entire token budget", async () => {
    const runtime = await createAgentHarness({
      ...options(journal()),
      goal: "Track work in a durable plan",
    });
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: "tool-call",
            toolCallId: crypto.randomUUID(),
            toolName: "updateExecutionPlan",
            input: JSON.stringify({
              tasks: [
                {
                  id: "invalid",
                  title: "Read",
                  verification: "Source read",
                  evidenceKind: "tool",
                  expectedTools: ["unknown"],
                  dependsOn: [],
                },
              ],
              reason: "Plan",
            }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
        warnings: [],
      }),
    });
    const agent = new ToolLoopAgent({
      model,
      instructions: runtime.instructions,
      tools: runtime.tools,
      ...runtime.settings,
    });
    const result = await agent.generate({ prompt: "Track work" });
    expect(result.steps).toHaveLength(3);
    expect(
      (await runtime.finish(result.text, result.finishReason)).reason,
    ).toContain("Repeated planning");
  });
  it("carries explicit continuation requirements and evidence into a fresh execution budget", async () => {
    const previous = journal();
    let writes = 0;
    const tools = {
      createDocument: tool({
        inputSchema: z.object({ title: z.string() }),
        execute: async () => ({ id: `saved-${++writes}` }),
      }),
      readDocument: tool({
        inputSchema: z.object({ id: z.string() }),
        execute: async () => ({ content: "Verified report" }),
      }),
    };
    const original = await createAgentHarness(options(previous, tools));
    await call(
      original.tools,
      "updateExecutionPlan",
      {
        tasks: [
          {
            id: "write",
            title: "Write report",
            verification: "Report saved",
            evidenceKind: "tool",
            expectedTools: ["createDocument"],
            dependsOn: [],
          },
          {
            id: "check",
            title: "Verify report",
            verification: "Readback matches draft",
            evidenceKind: "tool",
            expectedTools: ["readDocument"],
            dependsOn: ["write"],
          },
        ],
        reason: "Track write and verification",
      },
      "plan",
    );
    await call(original.tools, "createDocument", { title: "Report" }, "write");
    await call(
      original.tools,
      "reportTaskProgress",
      {
        id: "write",
        status: "completed",
        evidence: ["write"],
        note: "Report saved",
      },
      "write-done",
    );
    const blocked = await original.finish("Still needs readback", "stop");
    const resumed = await createAgentHarness({
      ...options(journal(), tools),
      executionId: "new-execution",
      goal: "continue",
      limits: { toolCalls: 1 },
      continuation: {
        snapshot: blocked.snapshot,
        events: (await previous.load()).filter(
          (event) => event.type === "harness.tool",
        ),
      },
    });
    expect(
      await call(
        resumed.tools,
        "createDocument",
        { title: "Report" },
        "recovered-write",
      ),
    ).toEqual({ id: "saved-1" });
    await call(resumed.tools, "readDocument", { id: "saved-1" }, "readback");
    await call(
      resumed.tools,
      "reportTaskProgress",
      {
        id: "check",
        status: "completed",
        evidence: ["readback"],
        note: "Readback verified",
      },
      "check-done",
    );
    const outcome = await resumed.finish("Verified saved report", "stop");
    expect(outcome.success).toBe(true);
    expect(outcome.snapshot.goal).toContain("Research a source");
    expect(outcome.snapshot.toolCalls).toBe(1);
    expect(writes).toBe(1);
  });
  it("adds missing requirements from a completion review and continues work", async () => {
    let reviews = 0;
    const runtime = await createAgentHarness({
      ...options(journal()),
      review: async () => ({
        complete: ++reviews > 1,
        reasoning: "Check the requested limitations section",
        missingTasks:
          reviews === 1
            ? [
                {
                  id: "limits",
                  title: "State limitations",
                  verification: "Draft explains limitations",
                  evidenceKind: "response",
                  expectedTools: [],
                  dependsOn: [],
                },
              ]
            : [],
      }),
    });
    await call(
      runtime.tools,
      "updateExecutionPlan",
      {
        tasks: [
          {
            id: "answer",
            title: "Draft answer",
            verification: "Draft addresses the goal",
            evidenceKind: "response",
            expectedTools: [],
            dependsOn: [],
          },
        ],
        reason: "Track the deliverable",
      },
      "plan",
    );
    const progress = (await call(
      runtime.tools,
      "reportTaskProgress",
      {
        id: "answer",
        status: "completed",
        evidence: [],
        note: "Drafted answer",
      },
      "draft",
    )) as { tasks: Array<{ id: string }> };
    expect(progress.tasks).toHaveLength(2);
    expect((await runtime.finish("Premature answer", "stop")).success).toBe(
      false,
    );
    await call(
      runtime.tools,
      "reportTaskProgress",
      {
        id: progress.tasks[1]!.id,
        status: "completed",
        evidence: [],
        note: "Added requested limitations",
      },
      "verified",
    );
    expect(
      (await runtime.finish("Answer including limitations", "stop")).success,
    ).toBe(true);
    expect(reviews).toBe(2);
  });
  it("blocks completion when the independent review cannot run", async () => {
    const runtime = await createAgentHarness({
      ...options(journal()),
      review: async () => {
        throw new Error("Provider unavailable");
      },
    });
    await call(
      runtime.tools,
      "updateExecutionPlan",
      {
        tasks: [
          {
            id: "answer",
            title: "Draft answer",
            verification: "Goal met",
            evidenceKind: "response",
            expectedTools: [],
            dependsOn: [],
          },
        ],
        reason: "Track work",
      },
      "plan",
    );
    await call(
      runtime.tools,
      "reportTaskProgress",
      {
        id: "answer",
        status: "completed",
        evidence: [],
        note: "Drafted answer",
      },
      "draft",
    );
    expect((await runtime.finish("Done", "stop")).reason).toContain(
      "unavailable",
    );
  });
  it("propagates cancellation and prevents additional actions", async () => {
    const controller = new AbortController();
    let reads = 0;
    const runtime = await createAgentHarness({
      ...options(journal(), {
        searchKnowledge: tool({
          inputSchema: z.object({}),
          execute: async () => {
            reads++;
            return {};
          },
        }),
      }),
      signal: controller.signal,
    });
    controller.abort();
    expect(runtime.signal.aborted).toBe(true);
    await expect(
      call(runtime.tools, "searchKnowledge", {}, "read"),
    ).rejects.toThrow("user stopped");
    expect(reads).toBe(0);
  });
  it("continues after approved evidence without executing the approved action twice", async () => {
    const store = journal();
    let actions = 0;
    const tools = {
      externalAction: tool({
        inputSchema: z.object({}),
        execute: async () => {
          actions++;
          return { approvalId: "approval", status: "pending" };
        },
      }),
    };
    const first = await createAgentHarness({
      ...options(store, tools),
      now: () => 1000,
    });
    await call(first.tools, "externalAction", {}, "request");
    await first.finish("Waiting for approval", "tool-calls");
    const record = {
      toolCallId: "request",
      toolName: "externalAction",
      fingerprint: toolFingerprint("externalAction", {}),
      status: "completed",
      successful: true,
      output: { id: "actual-resource" },
      approvedBy: "approval",
    };
    await store.put("tool:request", "harness.tool", { record });
    await store.put(`operation:${record.fingerprint}:0`, "harness.tool", {
      record,
    });
    const resumed = await createAgentHarness({
      ...options(store, tools),
      now: () => 61_000,
      resumeAfterApproval: "approval",
    });
    expect(
      await call(resumed.tools, "externalAction", {}, "new-model-call"),
    ).toEqual({ id: "actual-resource" });
    expect(actions).toBe(1);
    expect(resumed.deadline - first.deadline).toBe(60_000);
    const recovered = await createAgentHarness({
      ...options(store, tools),
      now: () => 62_000,
      resumeAfterApproval: "approval",
    });
    expect(recovered.deadline).toBe(resumed.deadline);
  });
  it("runs planning, research, writing, readback, and verification through the installed SDK", async () => {
    const store = journal();
    const artifacts = new Map<string, string>();
    const runtime = await createAgentHarness(
      options(store, {
        searchKnowledge: tool({
          inputSchema: z.object({ query: z.string() }),
          execute: async () => ({
            content: "Source says release reviews require an owner.",
          }),
        }),
        createDocument: tool({
          inputSchema: z.object({ content: z.string() }),
          execute: async ({ content }) => {
            artifacts.set("report", content);
            return { id: "report" };
          },
        }),
        readDocument: tool({
          inputSchema: z.object({ id: z.string() }),
          execute: async ({ id }) => ({ content: artifacts.get(id) }),
        }),
      }),
    );
    const tasks = [
      {
        id: "research",
        title: "Read source",
        verification: "Source returned relevant text",
        evidenceKind: "tool",
        expectedTools: ["searchKnowledge"],
        dependsOn: [],
      },
      {
        id: "report",
        title: "Write and verify report",
        verification: "Saved content includes the release owner requirement",
        evidenceKind: "tool",
        expectedTools: ["createDocument", "readDocument"],
        dependsOn: ["research"],
      },
    ];
    const calls = [
      [
        "updateExecutionPlan",
        { tasks, reason: "Separate source research from verified delivery" },
        "plan",
      ],
      ["searchKnowledge", { query: "release" }, "search"],
      [
        "reportTaskProgress",
        {
          id: "research",
          status: "completed",
          evidence: ["search"],
          note: "Source requirement checked",
        },
        "research-done",
      ],
      [
        "createDocument",
        { content: "Release reviews require an owner." },
        "write",
      ],
      ["readDocument", { id: "report" }, "read"],
      [
        "reportTaskProgress",
        {
          id: "report",
          status: "completed",
          evidence: ["write", "read"],
          note: "Readback matches the researched draft",
        },
        "report-done",
      ],
    ];
    let index = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        const next = calls[index++];
        return {
          content: next
            ? [
                {
                  type: "tool-call" as const,
                  toolCallId: next[2] as string,
                  toolName: next[0] as string,
                  input: JSON.stringify(next[1]),
                },
              ]
            : [
                {
                  type: "text" as const,
                  text: "The saved report has been verified.",
                },
              ],
          finishReason: {
            unified: next ? ("tool-calls" as const) : ("stop" as const),
            raw: undefined,
          },
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
        };
      },
    });
    const result = await new ToolLoopAgent({
      model,
      tools: runtime.tools,
      instructions: runtime.instructions,
      ...runtime.settings,
    }).generate({ prompt: "Research and create the report" });
    const finished = await runtime.finish(result.text, result.finishReason);
    expect(finished.success).toBe(true);
    expect(
      finished.snapshot.tasks.every((task) => task.status === "completed"),
    ).toBe(true);
    expect(finished.snapshot.modelSteps).toBe(7);
    expect(finished.snapshot.toolCalls).toBe(3);
    expect(finished.snapshot.tokens).toBe(105);
    expect(artifacts.get("report")).toBe("Release reviews require an owner.");
    const recovered = await createAgentHarness(options(store));
    expect(
      recovered.recoveredMessages.filter((message) => message.role === "tool"),
    ).toHaveLength(6);
  });
  it("replays a completed action after a crash before its model step was checkpointed", async () => {
    const store = journal();
    let writes = 0;
    const tools = {
      createDocument: tool({
        inputSchema: z.object({ title: z.string() }),
        execute: async () => ({ id: `saved-${++writes}` }),
      }),
    };
    const first = await createAgentHarness(options(store, tools));
    await call(first.tools, "createDocument", { title: "Report" }, "original");
    const recovered = await createAgentHarness(options(store, tools));
    expect(
      await call(
        recovered.tools,
        "createDocument",
        { title: "Report" },
        "regenerated-call-id",
      ),
    ).toEqual({ id: "saved-1" });
    expect(writes).toBe(1);
  });
  it("does not repeat a side effect whose outcome became uncertain", async () => {
    const store = journal();
    let writes = 0;
    const tools = {
      createDocument: tool({
        inputSchema: z.object({ title: z.string() }),
        execute: async (): Promise<{ id: string }> => {
          writes++;
          throw new Error("Connection lost after action");
        },
      }),
    };
    const first = await createAgentHarness(options(store, tools));
    await expect(
      call(first.tools, "createDocument", { title: "Report" }, "one"),
    ).rejects.toThrow();
    const recovered = await createAgentHarness(options(store, tools));
    await expect(
      call(recovered.tools, "createDocument", { title: "Report" }, "two"),
    ).rejects.toThrow("uncertain");
    expect((await recovered.finish("Done", "stop")).success).toBe(false);
    expect(writes).toBe(1);
  });
  it("fences competing workers even when they generate different tool call IDs", async () => {
    const store = journal();
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    const tools = {
      createDocument: tool({
        inputSchema: z.object({ title: z.string() }),
        execute: async () => {
          writes++;
          await barrier;
          return { id: "saved" };
        },
      }),
    };
    const first = await createAgentHarness(options(store, tools));
    const second = await createAgentHarness(options(store, tools));
    const pending = call(
      first.tools,
      "createDocument",
      { title: "Report" },
      "one",
    );
    await Promise.resolve();
    await expect(
      call(second.tools, "createDocument", { title: "Report" }, "two"),
    ).rejects.toThrow("claimed");
    release();
    await pending;
    expect(writes).toBe(1);
  });
  it("stops repeated identical reads and preserves the deadline on recovery", async () => {
    const store = journal();
    const tools = {
      searchKnowledge: tool({
        inputSchema: z.object({ query: z.string() }),
        execute: async () => ({ results: [] }),
      }),
    };
    const first = await createAgentHarness({
      ...options(store, tools),
      now: () => 1000,
    });
    for (let index = 0; index < 3; index++)
      await call(
        first.tools,
        "searchKnowledge",
        { query: "same" },
        String(index),
      );
    await expect(
      call(first.tools, "searchKnowledge", { query: "same" }, "fourth"),
    ).rejects.toThrow("not making progress");
    const recovered = await createAgentHarness({
      ...options(store, tools),
      now: () => 2000,
    });
    expect(recovered.deadline).toBe(first.deadline);
  });
  it("never accepts an approval request as completion evidence", async () => {
    const runtime = await createAgentHarness(
      options(journal(), {
        externalAction: tool({
          inputSchema: z.object({}),
          execute: async () => ({ approvalId: "approval", status: "pending" }),
        }),
      }),
    );
    await call(runtime.tools, "externalAction", {}, "request");
    expect((await runtime.finish("Action executed", "stop")).success).toBe(
      false,
    );
  });
});
