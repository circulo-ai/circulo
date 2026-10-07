import { describe, expect, it } from "vitest";
import { compareSyncVersions, incomingSyncVersionWins } from "./conflicts";

const timestamp = new Date("2026-01-01T00:00:00.000Z");

describe("sync conflict ordering", () => {
  it("uses the newest client timestamp", () => {
    expect(
      incomingSyncVersionWins(
        {
          updatedAt: new Date(timestamp.getTime() + 1),
          deviceId: "a",
          idempotencyKey: "a",
        },
        { updatedAt: timestamp, deviceId: "z", idempotencyKey: "z" },
      ),
    ).toBe(true);
  });

  it("uses device and idempotency keys for deterministic ties", () => {
    expect(
      compareSyncVersions(
        { updatedAt: timestamp, deviceId: "desktop-b", idempotencyKey: "b" },
        { updatedAt: timestamp, deviceId: "desktop-a", idempotencyKey: "a" },
      ),
    ).toBeGreaterThan(0);
  });

  it("does not treat equal versions as a new winner", () => {
    expect(
      compareSyncVersions(
        { updatedAt: timestamp, deviceId: "desktop-a", idempotencyKey: "a" },
        { updatedAt: timestamp, deviceId: "desktop-a", idempotencyKey: "a" },
      ),
    ).toBe(0);
  });
});
