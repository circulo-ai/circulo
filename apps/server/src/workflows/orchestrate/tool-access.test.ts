import { describe, expect, it } from "vitest";
import { getAllowedMcpIntegrationIds, hasAgentToolAccess } from "./tool-access";

describe("agent tool access", () => {
  it("keeps legacy agents fully capable when no allowlist is configured", () => {
    expect(hasAgentToolAccess([], "builtin:memory")).toBe(true);
    expect(hasAgentToolAccess(undefined, "builtin:memory")).toBe(true);
  });

  it("denies all capabilities for an empty explicit allowlist", () => {
    expect(hasAgentToolAccess([], "allowlist", "builtin:memory")).toBe(false);
    expect(getAllowedMcpIntegrationIds([], "allowlist")).toEqual([]);
  });

  it("requires an explicit capability when an allowlist is configured", () => {
    expect(hasAgentToolAccess(["builtin:knowledge"], "builtin:knowledge")).toBe(
      true,
    );
    expect(hasAgentToolAccess(["builtin:knowledge"], "builtin:memory")).toBe(
      false,
    );
  });

  it("extracts only MCP capability IDs from a configured allowlist", () => {
    expect(
      getAllowedMcpIntegrationIds([
        "builtin:knowledge",
        "mcp:integration-1",
        "mcp_integration_2_tool",
      ]),
    ).toEqual(["mcp:integration-1", "mcp_integration_2_tool"]);
    expect(getAllowedMcpIntegrationIds([])).toBeUndefined();
    expect(
      getAllowedMcpIntegrationIds(["mcp:integration-1"], "allowlist"),
    ).toEqual(["mcp:integration-1"]);
  });
});
