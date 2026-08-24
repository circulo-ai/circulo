export type ReadinessState = "ok" | "not_configured" | "failed";

export function isServiceReady(
  checks: Record<string, ReadinessState>,
  isProduction: boolean,
): boolean {
  const requiredChecks = [
    checks.database,
    checks.auth,
    checks.proxy,
    checks.encryption,
    checks.ai,
    checks.storage,
    checks.billing,
    ...(isProduction ? [checks.redis, checks.email] : []),
  ];

  return (
    requiredChecks.every((check) => check === "ok") && checks.redis !== "failed"
  );
}
