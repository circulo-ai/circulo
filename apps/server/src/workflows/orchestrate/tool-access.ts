export function hasAgentToolAccess(
  configuredToolIds: string[] | null | undefined,
  modeOrFirstId: "all" | "allowlist" | string = "all",
  ...restIds: string[]
): boolean {
  const configured = (configuredToolIds ?? []).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const hasExplicitMode =
    modeOrFirstId === "all" || modeOrFirstId === "allowlist";
  const mode = hasExplicitMode
    ? modeOrFirstId
    : configured.length > 0
      ? "allowlist"
      : "all";
  const acceptedIds = hasExplicitMode ? restIds : [modeOrFirstId, ...restIds];
  if (mode === "all") return true;
  if (configured.length === 0) return false;
  return acceptedIds.some((id) => configured.includes(id));
}

export function getAllowedMcpIntegrationIds(
  configuredToolIds: string[] | null | undefined,
  mode?: "all" | "allowlist",
): string[] | undefined {
  const configured = (configuredToolIds ?? []).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const effectiveMode = mode ?? (configured.length > 0 ? "allowlist" : "all");
  return effectiveMode === "allowlist"
    ? configured.filter(
        (value) => value.startsWith("mcp:") || value.startsWith("mcp_"),
      )
    : undefined;
}
