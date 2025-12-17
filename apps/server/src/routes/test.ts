import { createRouter } from "@/lib/create-app";
import {
  chunk,
  complete,
  ConsoleLogger,
  defineWorkflow,
  InMemoryEventBus,
  InMemoryEventStore,
  InMemoryMetrics,
  InMemoryWorkflowStore,
  WorkflowEngine,
  waitFor,
  type WorkflowEvent,
} from "@circulo-ai/wf";

const router = createRouter();

// Define your context type
interface MyContext {
  count: number;
  messages: string[];
}

type StartInput = { initial: number };
type WorkflowOutput = {
  progress: number;
  result?: string;
  done: boolean;
  resumed?: boolean;
};

const TWO_MINUTES_MS = 2 * 60 * 1000;

const logger = new ConsoleLogger("debug");
const metrics = new InMemoryMetrics();

// Create workflow stores
const engine = new WorkflowEngine<MyContext, StartInput, WorkflowOutput>({
  workflowStore: new InMemoryWorkflowStore<
    MyContext,
    StartInput,
    WorkflowOutput
  >(),
  eventStore: new InMemoryEventStore<WorkflowOutput>(),
  eventBus: new InMemoryEventBus<WorkflowOutput>(),
  logger,
  metrics,
  autoResumeIntervalMs: 1000,
});

const workflow = defineWorkflow<MyContext, StartInput>()
  .name("test-workflow")
  .version(1)
  .context({ count: 0, messages: [] })
  .step<"start", StartInput, StartInput>("start", {
    run: async ({ initial }, ctx) => {
      const msg = `Started with ${initial}`;
      ctx.updateContext({
        count: initial,
        messages: [...ctx.data.messages, msg],
      });
      return complete({ initial });
    },
  })
  .step<"process", StartInput, WorkflowOutput>("process", {
    run: async function* ({ initial }, ctx) {
      // Streaming step with progress updates
      for (let i = 1; i <= 5; i++) {
        yield chunk({ progress: i / 5, done: false });
      }
      const startMessage =
        ctx.data.messages[ctx.data.messages.length - 1] ??
        `Started with ${initial}`;
      const result = startMessage.toUpperCase();
      ctx.updateContext({
        messages: [...ctx.data.messages, `Processed: ${result}`],
      });
      return complete({ progress: 1, result, done: true });
    },
  })
  .step<"long-wait", WorkflowOutput, WorkflowOutput>("long-wait", {
    run: async (output, ctx) => {
      const resumeAt = Date.now() + TWO_MINUTES_MS;
      ctx.updateContext({
        messages: [
          ...ctx.data.messages,
          `Waiting until ${new Date(resumeAt).toISOString()}`,
        ],
      });
      // This pauses the workflow without blocking server resources
      return waitFor(TWO_MINUTES_MS, { ...output, done: false });
    },
  })
  .step<"finalize", WorkflowOutput, WorkflowOutput>("finalize", {
    run: async (output, ctx) => {
      const msg = "Resumed after wait";
      ctx.updateContext({ messages: [...ctx.data.messages, msg] });
      return complete({ ...output, done: true, resumed: true });
    },
  })
  .build();

router.get("/test", async (c) => {
  const workflowId = await engine.createWorkflow(workflow, {
    initial: 10,
  });
  const eventLog: WorkflowEvent<WorkflowOutput>[] = [];

  const unsubscribe = engine.events.subscribe(workflowId, (event) => {
    eventLog.push(event);
    console.log("Event:", event.eventType, event.payload);
  });

  await engine.run(workflowId);
  unsubscribe();

  const result = await engine.getWorkflow(workflowId);

  return c.json({
    workflowId,
    state: result?.state,
    context: result?.context,
    output: result?.output,
    events: eventLog,
  });
});

router.get("/test/stream", async (c) => {
  const initial =
    Number(new URL(c.req.url).searchParams.get("initial")) || 10;
  const workflowId = await engine.createWorkflow(workflow, { initial });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      const unsubscribe = engine.events.subscribe(workflowId, (event) => {
        send({ workflowId, event: event.eventType, payload: event.payload });
        if (
          event.eventType === "workflow.completed" ||
          event.eventType === "workflow.failed"
        ) {
          cleanup();
          controller.close();
        }
      });

      const heartbeat = setInterval(() => {
        send({ workflowId, event: "heartbeat", ts: Date.now() });
      }, 15000);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      c.req.raw.signal.addEventListener(
        "abort",
        () => {
          cleanup();
          controller.close();
        },
        { once: true },
      );

      send({ workflowId, event: "workflow.created" });
      engine.run(workflowId).catch((err) => {
        send({ workflowId, event: "error", message: err.message });
        cleanup();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    },
  });
});

router.get("/test/:id", async (c) => {
  const workflowId = c.req.param("id");
  const wf = await engine.getWorkflow(workflowId);
  return c.json({
    workflowId,
    workflow: wf,
  });
});

export default router;
