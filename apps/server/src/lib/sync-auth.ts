import { db, syncDeviceToken, user } from "@/db";
import { authenticateRequest } from "@/lib/auth/request";
import type { AppEnv } from "@/lib/create-app";
import { env } from "@/lib/env";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { jwtVerify, SignJWT } from "jose";
import { randomUUID } from "node:crypto";

const issuer = "circulo-sync";
const audience = "circulo-sync-api";

function secret() {
  return new TextEncoder().encode(env.INTERNAL_API_SECRET);
}

export async function issueSyncDeviceToken(params: {
  organizationId: string;
  userId: string;
  deviceId: string;
  expiresAt: Date;
}) {
  const jti = randomUUID();
  await db.insert(syncDeviceToken).values({
    jti,
    organizationId: params.organizationId,
    userId: params.userId,
    deviceId: params.deviceId,
    expiresAt: params.expiresAt,
  });

  return new SignJWT({
    type: "sync-device",
    organizationId: params.organizationId,
    userId: params.userId,
    deviceId: params.deviceId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(params.expiresAt.getTime() / 1000))
    .sign(secret());
}

async function verifySyncDeviceToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer,
      audience,
    });
    if (
      payload.type !== "sync-device" ||
      typeof payload.jti !== "string" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.deviceId !== "string"
    ) {
      return null;
    }

    const [stored] = await db
      .select({ id: syncDeviceToken.id })
      .from(syncDeviceToken)
      .where(
        and(
          eq(syncDeviceToken.jti, payload.jti),
          eq(syncDeviceToken.organizationId, payload.organizationId),
          eq(syncDeviceToken.userId, payload.userId),
          eq(syncDeviceToken.deviceId, payload.deviceId),
          isNull(syncDeviceToken.revokedAt),
          gt(syncDeviceToken.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!stored) return null;

    await db
      .update(syncDeviceToken)
      .set({ lastSeenAt: new Date() })
      .where(eq(syncDeviceToken.id, stored.id));

    return {
      organizationId: payload.organizationId,
      userId: payload.userId,
      deviceId: payload.deviceId,
    };
  } catch {
    return null;
  }
}

/** Accept a normal Better Auth session or a paired desktop device token. */
export const requireSyncAuth = createMiddleware<AppEnv>(async (c, next) => {
  const authorization = c.req.header("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const identity = await verifySyncDeviceToken(authorization.slice(7).trim());
    if (!identity)
      return c.json({ error: "Invalid or expired sync token" }, 401);
    const [actor] = await db
      .select()
      .from(user)
      .where(eq(user.id, identity.userId))
      .limit(1);
    if (!actor) return c.json({ error: "Sync user no longer exists" }, 401);
    c.set("user", actor as any);
    c.set("session", null);
    c.set("authenticated", true);
    c.set("authMethod", "sync_token" as any);
    c.set("activeOrgId", identity.organizationId);
    await next();
    return;
  }

  const principal = await authenticateRequest(c.req.raw);
  if (!principal?.userId) return c.json({ error: "Unauthorized" }, 401);
  const actor =
    principal.session?.user ??
    (await db.query.user.findFirst({ where: eq(user.id, principal.userId) }));
  if (!actor) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", actor as any);
  c.set("session", principal.session?.session ?? null);
  c.set("authenticated", true);
  c.set("authMethod", principal.authMethod);
  if (principal.apiKeyId) c.set("apiKeyId", principal.apiKeyId);
  if (principal.apiKeyPermissions)
    c.set("apiKeyPermissions", principal.apiKeyPermissions);
  if (principal.organizationId) c.set("activeOrgId", principal.organizationId);
  await next();
});
