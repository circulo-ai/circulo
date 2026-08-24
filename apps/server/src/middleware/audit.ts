import { recordAuditEvent } from "@/lib/audit";
import type { AppEnv } from "@/lib/create-app";
import { env } from "@/lib/env";
import { createMiddleware } from "hono/factory";

function clientIp(c: any): string | null {
  const hops = Math.max(0, Number(env.TRUSTED_PROXY_HOPS ?? "0"));
  const forwarded = c.req.header("x-forwarded-for");
  if (hops > 0 && forwarded) {
    const values = forwarded
      .split(",")
      .map((value: string) => value.trim())
      .filter(Boolean);
    return values[Math.max(0, values.length - hops - 1)] ?? null;
  }
  if (hops > 0) return c.req.header("x-real-ip") ?? null;
  return (c.req.raw as any)?.socket?.remoteAddress ?? null;
}

function isAuditable(method: string, status: number): boolean {
  return (
    !["GET", "HEAD", "OPTIONS"].includes(method) ||
    [401, 403, 429].includes(status)
  );
}

/** Durable, intentionally thin request audit layer. It records metadata only. */
export const auditRequest = createMiddleware<AppEnv>(async (c, next) => {
  try {
    await next();
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (isAuditable(c.req.method, status)) {
      await writeAudit(c, status, "failure");
    }
    throw error;
  }

  const status = c.res.status;
  if (isAuditable(c.req.method, status)) {
    await writeAudit(
      c,
      status,
      status === 401 || status === 403 || status === 429 ? "denied" : "success",
    );
  }
});

async function writeAudit(
  c: any,
  statusCode: number,
  outcome: "success" | "denied" | "failure",
) {
  try {
    await recordAuditEvent({
      actorType:
        c.var.authMethod === "api_key"
          ? "api_key"
          : c.var.user
            ? "user"
            : "anonymous",
      actorId: c.var.apiKeyId ?? c.var.user?.id ?? null,
      authMethod: c.var.authMethod ?? null,
      organizationId: c.var.activeOrgId ?? null,
      action: `http.${c.req.method.toLowerCase()}`,
      resourceType: "route",
      resourceId: c.req.path,
      outcome,
      statusCode,
      requestId: c.req.header("x-request-id") ?? null,
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });
  } catch {
    // Audit persistence must not turn a successful application request into a 500.
  }
}
