import { describe, expect, it } from "vitest";
import {
  defineActivity,
  InMemoryActivityRegistry,
} from "../src";

describe("activities", () => {
  it("defines and registers versioned activities", async () => {
    const registry = new InMemoryActivityRegistry();
    const activity = defineActivity<{ value: number }, number>(
      "double",
      async (input) => input.value * 2,
      {
        version: 2,
        retryPolicy: {
          maxAttempts: 5,
          initialDelayMs: 100,
          multiplier: 2,
        },
      },
    );

    registry.register(activity);
    expect(registry.get("double", 1)).toBeUndefined();
    expect(registry.get<{ value: number }, number>("double", 2)).toBe(
      activity,
    );
    expect(registry.list()).toHaveLength(1);
  });

  it("rejects duplicate versions and invalid retry policies", () => {
    const registry = new InMemoryActivityRegistry();
    const activity = defineActivity("send", async () => true);
    registry.register(activity);
    expect(() => registry.register(activity)).toThrow("already registered");
    expect(() =>
      defineActivity("invalid", async () => true, {
        retryPolicy: { maxAttempts: 0 },
      }),
    ).toThrow("maxAttempts");
    expect(() =>
      defineActivity("invalid-jitter", async () => true, {
        retryPolicy: { maxAttempts: 1, jitter: 2 },
      }),
    ).toThrow("jitter");
  });
});
