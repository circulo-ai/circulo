import { describe, expect, it } from "vitest";
import { hashSyncPairingToken } from "./tokens";

describe("sync pairing token hashing", () => {
  it("is deterministic without storing the raw token", () => {
    expect(hashSyncPairingToken("pairing-token")).toBe(
      hashSyncPairingToken("pairing-token"),
    );
    expect(hashSyncPairingToken("pairing-token")).not.toBe(
      hashSyncPairingToken("other-token"),
    );
    expect(hashSyncPairingToken("pairing-token")).toHaveLength(64);
  });
});
