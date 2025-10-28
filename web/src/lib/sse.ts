"use server";

import { getRedisClient } from "@/lib/redis";
import { EventEmitter } from "events";
import Redis from "ioredis";

// Channel helper
function channelFor(chatId: string) {
  return `chat_stream:${chatId}`;
}

// Fallback in-memory emitter (same-process only)
const emitter = new EventEmitter();

// Lazy publisher using user's Redis client (shared connection)
function getPublisher(): Redis | null {
  return getRedisClient();
}

// Create a dedicated subscriber for each SSE connection
function createSubscriber(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new Redis(url, {
    keepAlive: 1000,
    connectTimeout: 5000,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
    autoResubscribe: true,
  });
}

export async function emitStreamEvent(chatId: string, data: any) {
  const channel = channelFor(chatId);

  // Prefer Redis publish for cross-process delivery
  const publisher = getPublisher();
  if (publisher) {
    try {
      await publisher.publish(channel, JSON.stringify(data));
      return;
    } catch (err) {
      // Fall through to emitter on publish error
      console.error("Redis publish error:", err);
    }
  }

  // Same-process fallback
  emitter.emit(channel, data);
}

export async function subscribeToStream(
  chatId: string,
  onMessage: (data: any) => void,
) {
  const channel = channelFor(chatId);

  // If Redis is configured, use pub/sub
  const subscriber = createSubscriber();
  if (subscriber) {
    const handleMessage = (chan: string, payload: string) => {
      if (chan !== channel) return;
      try {
        const data = JSON.parse(payload);
        onMessage(data);
      } catch (e) {
        // Ignore malformed payloads
      }
    };

    subscriber.on("message", handleMessage);
    subscriber.subscribe(channel);

    return () => {
      try {
        subscriber.off("message", handleMessage);
        subscriber.unsubscribe(channel).catch(() => {});
      } finally {
        subscriber.quit().catch(() => {});
      }
    };
  }

  // Fallback to same-process EventEmitter
  const listener = (data: any) => onMessage(data);
  emitter.on(channel, listener);
  return () => {
    emitter.off(channel, listener);
  };
}
