import { Chat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_STREAM_THROTTLE_MS } from "./chat-streaming";

afterEach(() => vi.useRealTimers());

describe("streamed message notifications", () => {
  it("reduces burst notifications while preserving the complete final message", async () => {
    vi.useFakeTimers();
    const baseline = new Chat<UIMessage>({ id: "baseline" });
    const batched = new Chat<UIMessage>({ id: "batched" });
    const baselineChanged = vi.fn();
    const batchedChanged = vi.fn();
    const unsubBaseline =
      baseline["~registerMessagesCallback"](baselineChanged);
    const unsubBatched = batched["~registerMessagesCallback"](
      batchedChanged,
      CHAT_STREAM_THROTTLE_MS,
    );
    for (let index = 1; index <= 60; index++) {
      const message: UIMessage = {
        id: "reply",
        role: "assistant",
        parts: [{ type: "text", text: "x".repeat(index) }],
      };
      baseline.messages = [message];
      batched.messages = [message];
      await vi.advanceTimersByTimeAsync(5);
    }
    await vi.advanceTimersByTimeAsync(CHAT_STREAM_THROTTLE_MS);
    expect(baselineChanged).toHaveBeenCalledTimes(60);
    expect(batchedChanged.mock.calls.length).toBeLessThanOrEqual(8);
    expect(batched.messages).toEqual(baseline.messages);
    expect(batched.messages[0].parts[0]).toEqual({
      type: "text",
      text: "x".repeat(60),
    });
    unsubBaseline();
    unsubBatched();
  });

  it("finishes an actual chunk stream without delaying terminal status", async () => {
    vi.useFakeTimers();
    const chat = new Chat<UIMessage>({
      id: "stream",
      transport: {
        sendMessages: async () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "start", messageId: "reply" });
              controller.enqueue({ type: "text-start", id: "text" });
              for (const delta of ["Hello", ", ", "world"])
                controller.enqueue({ type: "text-delta", id: "text", delta });
              controller.enqueue({ type: "text-end", id: "text" });
              controller.enqueue({ type: "finish" });
              controller.close();
            },
          }),
        reconnectToStream: async () => null,
      },
    });
    const statuses: string[] = [];
    const unsubscribeStatus = chat["~registerStatusCallback"](() =>
      statuses.push(chat.status),
    );
    const unsubscribeMessages = chat["~registerMessagesCallback"](
      vi.fn(),
      CHAT_STREAM_THROTTLE_MS,
    );
    await chat.sendMessage({ text: "Hello" });
    expect(statuses).toEqual(["submitted", "streaming", "ready"]);
    expect(chat.messages.at(-1)?.parts[0]).toMatchObject({
      type: "text",
      text: "Hello, world",
    });
    await vi.advanceTimersByTimeAsync(CHAT_STREAM_THROTTLE_MS);
    unsubscribeStatus();
    unsubscribeMessages();
  });
});

import { latestWorkflowTrace } from "./chat-streaming";
it("uses the newest workflow trace through multiple approval waits", () => {
  const first = {
    workflowId: "run",
    status: "paused",
    approvals: [{ id: "one", status: "pending" }],
  };
  const latest = {
    ...first,
    approvals: [
      { id: "one", status: "approved" },
      { id: "two", status: "pending" },
    ],
  };
  expect(
    latestWorkflowTrace([
      { type: "data-workflowTrace", data: first },
      { type: "data-workflowTrace", data: latest },
    ]),
  ).toBe(latest);
});
