import { apikey, db } from "@/db";
import { eq } from "drizzle-orm";
import type { ApiKeyPermissions } from "./permissions";

/** Persistent automations must not outlive a revoked originating credential
 * or gain scopes if that credential is later expanded. */
export async function currentAutomationPermissions(actor: {
  userId: string;
  apiKeyId?: string | null;
  apiKeyPermissions?: ApiKeyPermissions;
}): Promise<ApiKeyPermissions> {
  if (!actor.apiKeyId) return actor.apiKeyPermissions;
  const key = await db.query.apikey.findFirst({
    where: eq(apikey.id, actor.apiKeyId),
    columns: {
      referenceId: true,
      enabled: true,
      expiresAt: true,
      permissions: true,
    },
  });
  if (
    !key ||
    !key.enabled ||
    key.referenceId !== actor.userId ||
    (key.expiresAt && key.expiresAt.getTime() <= Date.now())
  )
    throw new Error(
      "The originating API key is expired, revoked, or no longer belongs to this user.",
    );
  const raw: unknown = key.permissions ? JSON.parse(key.permissions) : null;
  if (
    raw !== null &&
    (typeof raw !== "object" ||
      Array.isArray(raw) ||
      Object.values(raw).some(
        (value) =>
          !Array.isArray(value) ||
          value.some((item) => typeof item !== "string"),
      ))
  )
    throw new Error("The API key's current permission scopes are invalid.");
  const current = raw as ApiKeyPermissions;
  if (!actor.apiKeyPermissions) return current;
  if (!current) return actor.apiKeyPermissions;
  return Object.fromEntries(
    Object.entries(actor.apiKeyPermissions).map(([resource, actions]) => [
      resource,
      actions.filter((action) => current[resource]?.includes(action)),
    ]),
  );
}
