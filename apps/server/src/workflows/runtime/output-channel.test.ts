import type { CustomUIMessageChunk } from "@/lib/types";
import { describe, expect, it } from "vitest";
import {
  WorkflowOutputChannel,
  closeWorkflowOutputChannel,
  createWorkflowOutputChannel,
  getWorkflowOutputChannel,
} from "./output-channel";

describe("WorkflowOutputChannel", () => {
  it("replays buffered chunks and closes after the terminal chunk", async () => {
    const channel = new WorkflowOutputChannel();
    const terminal: CustomUIMessageChunk = {
      type: "finish",
      finishReason: "stop",
    };

    channel.write({ type: "text-start", id: "message-1" });
    channel.write({ type: "text-delta", id: "message-1", delta: "hello" });
    channel.write(terminal);
    channel.close();

    const reader = channel.createReadable().getReader();
    const chunks: CustomUIMessageChunk[] = [];
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
    }

    expect(chunks).toEqual([
      { type: "text-start", id: "message-1" },
      { type: "text-delta", id: "message-1", delta: "hello" },
      terminal,
    ]);
  });

  it("supports reconnecting from a buffered chunk index", async () => {
    const channel = new WorkflowOutputChannel();
    channel.write({ type: "text-start", id: "message-2" });
    channel.write({ type: "text-delta", id: "message-2", delta: "done" });
    channel.write({ type: "finish", finishReason: "stop" });
    channel.close();

    const reader = channel.createReadable(1).getReader();
    const chunks: CustomUIMessageChunk[] = [];
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
    }

    expect(chunks).toEqual([
      { type: "text-delta", id: "message-2", delta: "done" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  it("keeps terminal text chunks ordered for a replayed message", () => {
    const chunks: CustomUIMessageChunk[] = [
      { type: "text-start", id: "persisted-message" },
      {
        type: "text-delta",
        id: "persisted-message",
        delta: "replayed response",
      },
      { type: "text-end", id: "persisted-message" },
      { type: "finish", finishReason: "stop" },
    ];

    expect(chunks[0]).toEqual({
      type: "text-start",
      id: "persisted-message",
    });
    expect(chunks.findIndex((chunk) => chunk.type === "text-start")).toBe(0);
    expect(chunks.findIndex((chunk) => chunk.type === "text-delta")).toBe(1);
  });

  it("does not retain completed channels in the process registry", async () => {
    const workflowId = "workflow-cleanup";
    const channel = createWorkflowOutputChannel(workflowId);

    closeWorkflowOutputChannel(workflowId);

    // The current request still receives the closed channel before cleanup.
    expect(getWorkflowOutputChannel(workflowId)).toBe(channel);
    await Promise.resolve();
    expect(getWorkflowOutputChannel(workflowId)).toBeUndefined();
  });
});
