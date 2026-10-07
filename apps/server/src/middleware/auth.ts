import { db } from "@/db";
import * as schema from "@/db/schema";
import { authenticateRequest } from "@/lib/auth/request";
import type { AppEnv } from "@/lib/create-app";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

async function loadContext(c: any) {
  const principal = await authenticateRequest(c.req.raw);
  if (!principal) return null;

  let user = principal.session?.user ?? null;
  if (!user && principal.userId) {
    user =
      (await db.query.user.findFirst({
        where: eq(schema.user.id, principal.userId),
      })) ?? null;
  }
  if (!user && !principal.organizationId) return null;

  let activeOrgId = principal.organizationId;
  if (activeOrgId && principal.userId) {
    const membership = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.userId, principal.userId),
          eq(schema.member.organizationId, activeOrgId),
        ),
      )
      .limit(1);
    if (!membership[0]) activeOrgId = undefined;
  }

  c.set("user", user);
  c.set("session", principal.session?.session ?? null);
  c.set("authenticated", true);
  c.set("authMethod", principal.authMethod);
  if (principal.apiKeyId) c.set("apiKeyId", principal.apiKeyId);
  if (principal.apiKeyPermissions) {
    c.set("apiKeyPermissions", principal.apiKeyPermissions);
  }
  if (activeOrgId) c.set("activeOrgId", activeOrgId);

  return principal;
}

/** Populate auth context without rejecting anonymous requests. */
export const loadAuthContext = createMiddleware<AppEnv>(async (c, next) => {
  await loadContext(c);
  await next();
});

/**
 * Require an actor with a user identity.
 *
 * Organization API keys intentionally do not impersonate a user. Letting
 * them through this middleware makes the many user-scoped handlers dereference
 * `c.var.user!` and, worse, creates an ambiguous audit identity. They must use
 * an explicitly organization-scoped API surface instead.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) await loadContext(c);

  if (!c.var.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});

export default requireAuth;
