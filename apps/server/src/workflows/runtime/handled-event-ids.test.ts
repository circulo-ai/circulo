import { describe, expect, it } from "vitest";
import { getHandledEventIds } from "./handled-event-ids";

describe("workflow event replay deduplication", () => {
  it("retains every event when concurrent handlers finish out of order", async () => {
    const store = new Map<string, Set<string>>();
    const first = getHandledEventIds(store, "run");
    const second = getHandledEventIds(store, "run");
    expect(first).toBe(second);
    await Promise.all([
      Promise.resolve().then(() => {
        first.add("text-start");
        store.set("run", first);
      }),
      Promise.resolve().then(() => {
        second.add("text-delta");
        store.set("run", second);
      }),
    ]);
    const replay = getHandledEventIds(store, "run");
    expect(replay.has("text-start")).toBe(true);
    expect(replay.has("text-delta")).toBe(true);
    expect(replay.size).toBe(2);
  });
  it("isolates runs and starts a fresh set after cleanup", () => {
    const store = new Map<string, Set<string>>();
    const first = getHandledEventIds(store, "first");
    first.add("event");
    expect(getHandledEventIds(store, "second").has("event")).toBe(false);
    store.delete("first");
    expect(getHandledEventIds(store, "first").size).toBe(0);
  });
});
