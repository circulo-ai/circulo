import { describe, expect, it } from "vitest";
import { STARTER_MCP_CATALOG } from "./starter-catalog";

describe("starter MCP catalog", () => {
  it("includes an honest verified day-one Context7 endpoint", () => {
    const context7 = STARTER_MCP_CATALOG.find(
      (entry) => entry.id === "starter:context7",
    );

    expect(context7).toMatchObject({
      endpoint: "https://mcp.context7.com/mcp",
      credentialRef: null,
      readyNow: true,
      transport: "streamable_http",
    });
  });

  it("keeps credentialed recipes setup-only and uniquely keyed", () => {
    const ids = STARTER_MCP_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      STARTER_MCP_CATALOG.filter((entry) => !entry.readyNow).every(
        (entry) => !entry.endpoint && Boolean(entry.credentialRef),
      ),
    ).toBe(true);
  });
});
