import { describe, expect, it } from "vitest";
import { getTrustedAuthOrigins } from "./trusted-origins";

describe("trusted authentication origins", () => {
  it("normalizes app, auth, and explicitly configured origins", () => {
    expect(
      getTrustedAuthOrigins({
        appUrl: "https://app.example.com/",
        authUrl: "https://api.example.com",
        corsAllowedOrigins:
          " https://admin.example.com,https://app.example.com ",
        production: true,
      }),
    ).toEqual([
      "https://app.example.com",
      "https://api.example.com",
      "https://admin.example.com",
    ]);
  });

  it("does not trust development origins in production", () => {
    expect(
      getTrustedAuthOrigins({
        production: true,
        appUrl: "https://app.example.com",
      }),
    ).toEqual(["https://app.example.com"]);
  });

  it("adds development origins outside production and rejects non-origins", () => {
    expect(
      getTrustedAuthOrigins({
        appUrl: "https://app.example.com/path",
        authUrl: "javascript:alert(1)",
        corsAllowedOrigins:
          "https://user:secret@example.com,https://admin.example.com/path",
        production: false,
      }),
    ).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
    ]);
  });
});
