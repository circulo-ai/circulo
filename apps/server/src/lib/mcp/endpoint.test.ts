import { afterEach, describe, expect, it, vi } from "vitest";
import { validateMcpEndpoint } from "./endpoint";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("validateMcpEndpoint", () => {
  it("accepts local development endpoints", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(
      validateMcpEndpoint("http://127.0.0.1:8787/mcp"),
    ).resolves.toBe("http://127.0.0.1:8787/mcp");
  });

  it("rejects private production endpoints before DNS lookup", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(
      validateMcpEndpoint("http://169.254.169.254/latest/meta-data"),
    ).rejects.toThrow("private networks");
  });

  it("rejects non-http protocols", async () => {
    await expect(validateMcpEndpoint("file:///tmp/server")).rejects.toThrow(
      "HTTP or HTTPS",
    );
  });
});
