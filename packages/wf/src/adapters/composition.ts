import type {
  EventBus,
  Workflow,
} from "../models";
import { InMemoryEventBus } from "../store/memory-event-bus";
import { InMemoryEventStore } from "../store/memory-event-store";
import { InMemoryWorkflowStore } from "../store/memory-workflow-store";
import { InMemoryIdempotencyStore } from "../gateway/idempotency-store";
import {
  AdapterEventBus,
  MapPubSubAdapter,
  type PubSubAdapter,
} from "./event-bus";
import {
  JsonEventStore,
  JsonWorkflowStore,
  MapJsonKeyValueStore,
  MapWorkflowLockStore,
  type JsonKeyValueStore,
  type WorkflowLockStore,
} from "./json-store";

export interface JsonWorkflowAdaptersOptions<TContext, TInput, TOutput> {
  keyValueStore: JsonKeyValueStore;
  lockStore: WorkflowLockStore;
  pubSub: PubSubAdapter<TOutput>;
  stepsFactory: () => Workflow<TContext, TInput, TOutput>["steps"];
  workflowKeyPrefix?: string;
  eventKeyPrefix?: string;
  eventTopicPrefix?: string;
  holderId?: string;
}

export interface JsonWorkflowAdapters<TContext, TInput, TOutput> {
  readonly workflowStore: JsonWorkflowStore<TContext, TInput, TOutput>;
  readonly eventStore: JsonEventStore<TOutput>;
  readonly eventBus: EventBus<TOutput>;
}

/** Compose the JSON workflow/event stores with any application-owned backend. */
export function createJsonWorkflowAdapters<TContext, TInput, TOutput>(
  options: JsonWorkflowAdaptersOptions<TContext, TInput, TOutput>,
): JsonWorkflowAdapters<TContext, TInput, TOutput> {
  const workflowStore = new JsonWorkflowStore<TContext, TInput, TOutput>(
    options.keyValueStore,
    options.lockStore,
    options.stepsFactory,
    {
      ...(options.workflowKeyPrefix === undefined
        ? {}
        : { keyPrefix: options.workflowKeyPrefix }),
      ...(options.holderId === undefined ? {} : { holderId: options.holderId }),
    },
  );
  return {
    workflowStore,
    eventStore: new JsonEventStore<TOutput>(
      options.keyValueStore,
      options.eventKeyPrefix,
    ),
    eventBus: new AdapterEventBus<TOutput>(
      options.pubSub,
      options.eventTopicPrefix,
    ),
  };
}

export interface InMemoryWorkflowAdapters<TContext, TInput, TOutput> {
  readonly workflowStore: InMemoryWorkflowStore<TContext, TInput, TOutput>;
  readonly eventStore: InMemoryEventStore<TOutput>;
  readonly eventBus: InMemoryEventBus<TOutput>;
  readonly idempotencyStore: InMemoryIdempotencyStore;
}

/** One-call in-memory composition for local development and tests. */
export function createInMemoryWorkflowAdapters<
  TContext,
  TInput,
  TOutput,
>(): InMemoryWorkflowAdapters<TContext, TInput, TOutput> {
  return {
    workflowStore: new InMemoryWorkflowStore<TContext, TInput, TOutput>(),
    eventStore: new InMemoryEventStore<TOutput>(),
    eventBus: new InMemoryEventBus<TOutput>(),
    idempotencyStore: new InMemoryIdempotencyStore(),
  };
}

/**
 * Development-only JSON composition for callers that want the same shape as
 * a durable adapter without provisioning Redis or PostgreSQL.
 */
export function createInMemoryJsonWorkflowAdapters<
  TContext,
  TInput,
  TOutput,
>(
  stepsFactory: () => Workflow<TContext, TInput, TOutput>["steps"],
): JsonWorkflowAdapters<TContext, TInput, TOutput> {
  return createJsonWorkflowAdapters({
    keyValueStore: new MapJsonKeyValueStore(),
    lockStore: new MapWorkflowLockStore(),
    pubSub: new MapPubSubAdapter<TOutput>(),
    stepsFactory,
  });
}
