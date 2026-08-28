import { describe, expect, it } from "vitest";
import { isServiceReady } from "./readiness";

const completeChecks = {
  database: "ok" as const,
  redis: "ok" as const,
  auth: "ok" as const,
  proxy: "ok" as const,
  encryption: "ok" as const,
  ai: "ok" as const,
  storage: "ok" as const,
  billing: "ok" as const,
  email: "ok" as const,
  workflow: "ok" as const,
};

describe("service readiness", () => {
  it("requires core capabilities in every environment", () => {
    expect(
      isServiceReady({ ...completeChecks, ai: "not_configured" }, false),
    ).toBe(false);
  });

  it("allows local development without optional email delivery", () => {
    expect(
      isServiceReady({ ...completeChecks, email: "not_configured" }, false),
    ).toBe(true);
  });

  it("requires Redis and email delivery in production", () => {
    expect(
      isServiceReady({ ...completeChecks, email: "not_configured" }, true),
    ).toBe(false);
    expect(
      isServiceReady({ ...completeChecks, redis: "not_configured" }, true),
    ).toBe(false);
  });

  it("fails when Redis reports a connection error", () => {
    expect(isServiceReady({ ...completeChecks, redis: "failed" }, false)).toBe(
      false,
    );
  });

  it("requires trusted proxy ranges when proxy hops are enabled", () => {
    expect(
      isServiceReady({ ...completeChecks, proxy: "not_configured" }, true),
    ).toBe(false);
  });
});
