import { describe, expect, it, vi } from "vitest";
import { currentAutomationPermissions } from "./automation-actor";
const fixture = vi.hoisted(() => ({ key: null as any }));
vi.mock("@/db", () => ({
  apikey: {},
  db: { query: { apikey: { findFirst: async () => fixture.key } } },
}));
describe("persistent automation credentials", () => {
  it("keeps session-authorized automations under their original actor", async () => {
    expect(
      await currentAutomationPermissions({ userId: "owner" }),
    ).toBeUndefined();
  });
  it("rejects revoked, expired, missing or differently owned keys", async () => {
    const actor = { userId: "owner", apiKeyId: "key" };
    for (const key of [
      null,
      { referenceId: "owner", enabled: false },
      { referenceId: "other", enabled: true },
      { referenceId: "owner", enabled: true, expiresAt: new Date(0) },
    ]) {
      fixture.key = key;
      await expect(currentAutomationPermissions(actor)).rejects.toThrow(
        "originating API key",
      );
    }
  });
  it("intersects current scopes with the original grant without expanding it", async () => {
    fixture.key = {
      referenceId: "owner",
      enabled: true,
      permissions: JSON.stringify({
        automation: ["read", "update"],
        mcp: ["read"],
        apps: ["read"],
      }),
    };
    expect(
      await currentAutomationPermissions({
        userId: "owner",
        apiKeyId: "key",
        apiKeyPermissions: { automation: ["read", "create"], mcp: ["read"] },
      }),
    ).toEqual({ automation: ["read"], mcp: ["read"] });
  });
});
