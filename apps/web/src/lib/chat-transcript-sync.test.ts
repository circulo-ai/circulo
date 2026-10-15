import { describe, expect, it } from "vitest";
import { reconcileIdleTranscript } from "./chat-transcript-sync";
import type { ChatMessage } from "./types";
const message = (
  id: string,
  role: "user" | "assistant",
  run?: string,
): ChatMessage => ({
  id,
  role,
  parts: [
    { type: "text", text: id },
    ...(run
      ? [
          {
            type: "data-workflowStarted" as const,
            data: {
              workflowId: run,
              chatId: "chat",
              messages: [],
              startedAt: "2026-10-14T00:00:00Z",
            },
          },
        ]
      : []),
  ],
});
describe("background chat updates", () => {
  it("preserves older loaded history and appends a new scheduled conversation turn", () => {
    const older = message("older", "user");
    const user = message("current", "user");
    const result = reconcileIdleTranscript(
      [older, user],
      [
        user,
        message("scheduled", "user"),
        message("result", "assistant", "scheduled-run"),
      ],
    );
    expect(result.map((item) => item.id)).toEqual([
      "older",
      "current",
      "scheduled",
      "result",
    ]);
    expect(result[0]).toBe(older);
  });
  it("replaces streamed identities without duplicate responses and avoids unchanged rerenders", () => {
    const saved = message("canonical", "assistant", "run");
    expect(
      reconcileIdleTranscript(
        [message("streamed", "assistant", "run")],
        [saved],
      ),
    ).toEqual([saved]);
    const unchanged = [saved];
    expect(reconcileIdleTranscript(unchanged, [structuredClone(saved)])).toBe(
      unchanged,
    );
  });
});
