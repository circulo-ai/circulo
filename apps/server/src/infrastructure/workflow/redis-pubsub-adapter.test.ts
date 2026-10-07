import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { RedisWorkflowPubSubAdapter } from "./redis-pubsub-adapter";

type RedisMessage = { topic: string; payload: string };

class FakeRedis extends EventEmitter {
  readonly subscriptions = new Set<string>();

  constructor(private readonly broker: FakeBroker) {
    super();
    broker.clients.add(this);
  }

  duplicate(): FakeRedis {
    return new FakeRedis(this.broker);
  }

  async publish(topic: string, payload: string): Promise<number> {
    return this.broker.publish({ topic, payload });
  }

  async subscribe(topic: string): Promise<void> {
    this.subscriptions.add(topic);
  }

  async unsubscribe(topic: string): Promise<void> {
    this.subscriptions.delete(topic);
  }

  async quit(): Promise<string> {
    this.broker.clients.delete(this);
    return "OK";
  }

  disconnect(): void {
    this.broker.clients.delete(this);
  }
}

class FakeBroker {
  readonly clients = new Set<FakeRedis>();

  publish(message: RedisMessage): number {
    let delivered = 0;
    for (const client of this.clients) {
      if (!client.subscriptions.has(message.topic)) continue;
      delivered += 1;
      client.emit("message", message.topic, message.payload);
    }
    return delivered;
  }
}

function createAdapter(broker: FakeBroker) {
  const raw = new FakeRedis(broker);
  return new RedisWorkflowPubSubAdapter({ raw } as never, {
    warn: () => {},
    error: () => {},
  });
}

describe("RedisWorkflowPubSubAdapter", () => {
  it("delivers a first local publish even before Redis subscription settles", async () => {
    const adapter = createAdapter(new FakeBroker());
    const events: string[] = [];
    adapter.subscribe("topic", (event) => {
      events.push(event.id);
    });

    await adapter.publish("topic", {
      id: "event-1",
      workflowId: "workflow-1",
      eventType: "workflow.started",
      timestamp: Date.now(),
      payload: { type: "started", workflowId: "workflow-1", version: 1 },
    });

    expect(events).toEqual(["event-1"]);
    await adapter.close();
  });

  it("delivers events to another process and suppresses Redis loopback duplicates", async () => {
    const broker = new FakeBroker();
    const publisher = createAdapter(broker);
    const subscriber = createAdapter(broker);
    const events: string[] = [];
    subscriber.subscribe("topic", (event) => {
      events.push(event.id);
    });
    await Promise.resolve();

    await publisher.publish("topic", {
      id: "event-2",
      workflowId: "workflow-1",
      eventType: "workflow.completed",
      timestamp: Date.now(),
      payload: { type: "completed", output: "ok", duration: 0 },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toEqual(["event-2"]);
    await publisher.close();
    await subscriber.close();
  });
});
