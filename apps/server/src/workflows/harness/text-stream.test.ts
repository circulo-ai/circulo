import { expect, it } from "vitest";
import { consumeAgentText } from "./text-stream";
it("does not promote a recoverable tool error into a provider failure", async () => {
  const text: string[] = [];
  async function* stream() {
    yield { type: "tool-error", error: new Error("Correct the task ID") };
    yield { type: "text-delta", text: "Verified final response" };
  }
  expect(
    await consumeAgentText(stream(), (chunk) => text.push(chunk)),
  ).toBeUndefined();
  expect(text).toEqual(["Verified final response"]);
});
it("preserves the original provider rejection instead of a later no-output wrapper", async () => {
  const error = { statusCode: 402 };
  async function* stream() {
    yield { type: "error", error };
  }
  expect(await consumeAgentText(stream(), () => {})).toBe(error);
});
