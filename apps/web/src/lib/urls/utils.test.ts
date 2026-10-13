import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getEnv = vi.fn<(variable: string) => string | undefined>();

vi.mock("@/lib/env", () => ({
  getEnv: (variable: string) => getEnv(variable),
}));

vi.mock("@/lib/environment", () => ({ isProd: false }));

const { getBaseDomain, getBaseUrl, getEmailDomain } = await import("./utils");

beforeEach(() => {
  getEnv.mockReset();
  getEnv.mockReturnValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getBaseUrl", () => {
  it("prefers the browser origin when running in a document", () => {
    getEnv.mockReturnValue("https://app.example.com");
    vi.stubGlobal("window", {
      location: { origin: "https://tab.example.com" },
    });

    expect(getBaseUrl()).toBe("https://tab.example.com");
  });

  it("uses NEXT_PUBLIC_APP_URL when it already carries a scheme", () => {
    getEnv.mockReturnValue("https://app.example.com");

    expect(getBaseUrl()).toBe("https://app.example.com");
  });

  it("adds a scheme to a bare host", () => {
    getEnv.mockReturnValue("app.example.com");

    expect(getBaseUrl()).toBe("http://app.example.com");
  });

  // Regression: the fallback used to be port 3001, which is neither the web app
  // (3000) nor the API (3002), so a server-side render with no configured app
  // URL built links against an origin nothing listens on.
  it("falls back to the web app's own development port", () => {
    expect(getBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("getBaseDomain", () => {
  it("returns host and port from the resolved base URL", () => {
    getEnv.mockReturnValue("http://app.example.com:8080");

    expect(getBaseDomain()).toBe("app.example.com:8080");
  });

  it("returns the development host when nothing is configured", () => {
    expect(getBaseDomain()).toBe("localhost:3000");
  });
});

describe("getEmailDomain", () => {
  it("strips a www prefix so the domain matches the sending domain", () => {
    getEnv.mockReturnValue("https://www.example.com");

    expect(getEmailDomain()).toBe("example.com");
  });

  it("leaves a domain without a www prefix alone", () => {
    getEnv.mockReturnValue("https://example.com");

    expect(getEmailDomain()).toBe("example.com");
  });
});
