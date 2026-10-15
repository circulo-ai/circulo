import { describe, expect, it } from "vitest";
import { getAuthCookiePolicy } from "./cookie-policy";

const desktop = {
  production: true,
  runtimeKind: "desktop",
  authUrl: "http://127.0.0.1:3322",
  appUrl: "http://127.0.0.1:3310",
};

describe("packaged desktop cookie policy", () => {
  it.each(["127.0.0.1", "localhost", "[::1]"])(
    "allows HTTP sessions on %s",
    (host) => {
      const policy = getAuthCookiePolicy({
        ...desktop,
        authUrl: `http://${host}:3322`,
        appUrl: `http://${host}:3310`,
      });
      expect(policy.useSecureCookies).toBe(false);
      expect(policy.defaultCookieAttributes).toEqual({
        sameSite: "lax",
        secure: false,
      });
      expect(policy.crossSubDomainCookies.enabled).toBe(false);
    },
  );

  it.each([
    { runtimeKind: "cloud" },
    { runtimeKind: "self-hosted" },
    { authUrl: "https://127.0.0.1:3322", appUrl: "https://127.0.0.1:3310" },
    { authUrl: "http://example.com", appUrl: "http://example.com" },
    { appUrl: "http://localhost:3310" },
    { appUrl: "invalid" },
    { authUrl: "http://user:secret@127.0.0.1:3322" },
  ])("retains production safeguards for %o", (override) => {
    const policy = getAuthCookiePolicy({ ...desktop, ...override });
    expect(policy.useSecureCookies).toBe(true);
    expect(policy.defaultCookieAttributes).toEqual({
      sameSite: "none",
      secure: true,
      partitioned: true,
    });
    expect(policy.crossSubDomainCookies.enabled).toBe(true);
  });
});
