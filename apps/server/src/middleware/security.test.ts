import { describe, expect, it } from "vitest";
import { isAllowedRequestOrigin } from "./security";

const allowedOrigins = ["http://localhost:3000", "https://circulo-ai.com"];

describe("request security boundaries", () => {
  it("accepts an explicitly allowed origin", () => {
    expect(
      isAllowedRequestOrigin(
        "http://localhost:3000",
        undefined,
        allowedOrigins,
      ),
    ).toBe(true);
  });

  it("accepts a same-origin referer when Origin is unavailable", () => {
    expect(
      isAllowedRequestOrigin(
        undefined,
        "https://circulo-ai.com/workspace",
        allowedOrigins,
      ),
    ).toBe(true);
  });

  it("rejects untrusted and opaque origins", () => {
    expect(
      isAllowedRequestOrigin(
        "https://attacker.example",
        undefined,
        allowedOrigins,
      ),
    ).toBe(false);
    expect(isAllowedRequestOrigin("null", undefined, allowedOrigins)).toBe(
      false,
    );
  });
});
