import { getDb } from "@/db";
import {
  DurableWorkflowEventStore,
  DurableWorkflowStore,
} from "@/infrastructure/drizzle/durable-workflow-store";
import { RedisWorkflowPubSubAdapter } from "@/infrastructure/workflow/redis-pubsub-adapter";
import { env } from "@/lib/env";
import { getRedisClient } from "@/lib/redis";
import type { OrchestrationWorkflowState } from "@/workflows/orchestrate/orchestrate";
import { createOrchestrationWorkflow } from "@/workflows/orchestrate/orchestrate";
import type { OrchestrationInput } from "@/workflows/orchestrate/types";
import {
  AdapterEventBus,
  ConsoleLogger,
  InMemoryEventBus,
  InMemoryMetrics,
  WorkflowEngine,
  type EventBus,
} from "@circulo-ai/wf";
import { defineWfConfig } from "@circulo-ai/wf/config";

export type WorkflowApplicationEngine = WorkflowEngine<
  Record<string, never>,
  OrchestrationInput,
  OrchestrationWorkflowState
>;

export interface WorkflowApplicationRuntime {
  readonly engine: WorkflowApplicationEngine;
  readonly close: () => Promise<void>;
}

type RuntimeEnvironment = NodeJS.ProcessEnv;

const profile =
  env.NODE_ENV === "production"
    ? "production"
    : env.NODE_ENV === "test"
      ? "test"
      : "development";

/**
 * Application-owned wf composition root. Importing this module is side-effect
 * free; database, Redis, event bus, and engine resources are created only by
 * getWorkflowRuntime().
 */
export const wf = defineWfConfig<
  RuntimeEnvironment,
  WorkflowApplicationRuntime
>({
  defaultProfile: profile,
  profiles: {
    development: {
      create: (context) => createRuntime(context.env, "development"),
      dispose: (runtime) => runtime.close(),
    },
    test: {
      create: (context) => createRuntime(context.env, "test"),
      dispose: (runtime) => runtime.close(),
    },
    production: {
      create: (context) => createRuntime(context.env, "production"),
      dispose: (runtime) => runtime.close(),
    },
  },
});

let runtimePromise:
  | Promise<
      import("@circulo-ai/wf").WfRuntimeHandle<WorkflowApplicationRuntime>
    >
  | undefined;

export function getWorkflowRuntime(): Promise<
  import("@circulo-ai/wf").WfRuntimeHandle<WorkflowApplicationRuntime>
> {
  runtimePromise ??= wf.createRuntime({ profile, env: process.env });
  return runtimePromise;
}

export async function closeWorkflowRuntime(): Promise<void> {
  const runtime = runtimePromise;
  if (!runtime) return;
  await (await runtime).close();
  runtimePromise = undefined;
}

async function createRuntime(
  runtimeEnv: RuntimeEnvironment,
  runtimeProfile: string,
): Promise<WorkflowApplicationRuntime> {
  const database = getDb();
  const eventBus = await createEventBus(runtimeEnv, runtimeProfile);
  const engine = new WorkflowEngine<
    Record<string, never>,
    OrchestrationInput,
    OrchestrationWorkflowState
  >({
    workflowStore: new DurableWorkflowStore(
      database,
      () => createOrchestrationWorkflow().steps,
      (input) => ({
        chatId: input.chatId,
        userId: input.actor.userId,
        organizationId: input.actor.organizationId,
      }),
    ),
    eventStore: new DurableWorkflowEventStore(database),
    eventBus,
    logger: new ConsoleLogger(workflowLogLevel(runtimeEnv.LOG_LEVEL)),
    metrics: new InMemoryMetrics(),
    defaultRetries: 2,
    defaultTimeout: 10 * 60 * 1000,
    workflowTimeout: 30 * 60 * 1000,
    lockTTL: 60_000,
    lockRenewInterval: 20_000,
    maxConcurrentWorkflows: 20,
    enableHealthCheck: true,
    enableAutoResume: true,
    autoResumeIntervalMs: 5_000,
  });

  return {
    engine,
    close: async () => {
      await engine.shutdown();
      await eventBus.close?.();
    },
  };
}

async function createEventBus(
  runtimeEnv: RuntimeEnvironment,
  runtimeProfile: string,
): Promise<
  EventBus<OrchestrationWorkflowState> & { close?: () => Promise<void> }
> {
  const redis = getRedisClient();
  if (!redis) {
    if (
      runtimeProfile === "production" &&
      env.CIRCULO_DEPLOYMENT_MODE !== "local"
    ) {
      throw new Error("REDIS_URL is required for the production wf runtime");
    }
    return new InMemoryEventBus<OrchestrationWorkflowState>();
  }

  const logger = new ConsoleLogger(workflowLogLevel(runtimeEnv.LOG_LEVEL));
  const transport = new RedisWorkflowPubSubAdapter<OrchestrationWorkflowState>(
    redis,
    logger,
  );
  const bus = new AdapterEventBus<OrchestrationWorkflowState>(
    transport,
    "circulo:wf:event:",
  );
  return {
    publish: (event) => bus.publish(event),
    subscribe: (workflowId, callback) => bus.subscribe(workflowId, callback),
    subscribeAll: (callback) => bus.subscribeAll(callback),
    close: () => transport.close(),
  };
}

function workflowLogLevel(
  value: string | undefined,
): "debug" | "info" | "warn" | "error" {
  switch (value?.toLowerCase()) {
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warn":
      return "warn";
    case "error":
      return "error";
    default:
      return env.NODE_ENV === "development" ? "debug" : "info";
  }
}
