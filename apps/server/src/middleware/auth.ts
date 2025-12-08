import { auth } from "@/lib/auth";
import type { AppEnv } from "@/lib/create-app";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

// Infer Better Auth session type
type SessionResponse = Awaited<ReturnType<typeof auth.api.getSession>>;

// Small helper to read session from Hono context
async function getSessionFromContext(c: Context): Promise<SessionResponse> {
  return auth.api.getSession({
    headers: c.req.raw.headers,
  });
}

/**
 * Loads Better Auth session and stores it on context.
 * If no user, returns 401.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await getSessionFromContext(c);

  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const activeOrgId = (session.session as any)?.activeOrganizationId as
    | string
    | undefined;

  c.set("session", session.session);
  c.set("user", session.user);
  if (activeOrgId) c.set("activeOrgId", activeOrgId);

  await next();
});

export default requireAuth;
