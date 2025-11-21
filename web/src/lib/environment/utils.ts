import { db } from "@/db";
import {
  chatEnvironment,
  organizationEnvironment,
  userEnvironment,
} from "@/db/schema";
import { createLogger } from "@/lib/logs/console/logger";
import { eq } from "drizzle-orm";

const logger = createLogger("EnvironmentUtils");

type EnvVars = Record<string, string>;

/**
 * Get environment variable keys (not values) for a user.
 * Safe to expose to frontend.
 */
export async function getUserEnvKeys(userId: string): Promise<{
  keys: string[];
  count: number;
}> {
  try {
    const row = await db.query.userEnvironment.findFirst({
      where: eq(userEnvironment.userId, userId),
    });

    const keys = Object.keys(row?.variables ?? {});
    return { keys, count: keys.length };
  } catch (error) {
    logger.error("Failed to get user env keys:", error);
    throw new Error("Failed to get environment variables");
  }
}

/**
 * Get organization environment variables (decrypted).
 */
export async function getOrgEnv(organizationId: string): Promise<EnvVars> {
  const row = await db.query.organizationEnvironment.findFirst({
    where: eq(organizationEnvironment.organizationId, organizationId),
  });

  // TODO: Decrypt values when encryption is implemented
  return (row?.variables ?? {}) as EnvVars;
}

/**
 * Get user environment variables (decrypted).
 */
export async function getUserEnv(userId: string): Promise<EnvVars> {
  const row = await db.query.userEnvironment.findFirst({
    where: eq(userEnvironment.userId, userId),
  });

  // TODO: Decrypt values when encryption is implemented
  return (row?.variables ?? {}) as EnvVars;
}

/**
 * Get chat environment variables (decrypted).
 */
export async function getChatEnv(chatId: string): Promise<EnvVars> {
  const row = await db.query.chatEnvironment.findFirst({
    where: eq(chatEnvironment.chatId, chatId),
  });

  // TODO: Decrypt values when encryption is implemented
  return (row?.variables ?? {}) as EnvVars;
}

/**
 * Get merged environment for user + optional chat.
 * User-level overrides org-level, chat-level overrides user-level.
 */
export async function getUserChatEnv(
  userId: string,
  chatId?: string,
): Promise<{
  user: EnvVars;
  chat: EnvVars;
  merged: EnvVars;
  conflicts: string[];
}> {
  const [userVars, chatVars] = await Promise.all([
    getUserEnv(userId),
    chatId ? getChatEnv(chatId) : Promise.resolve({} as EnvVars),
  ]);

  const conflicts = Object.keys(userVars).filter((k) => k in chatVars);
  const merged = { ...userVars, ...chatVars };

  return {
    user: userVars,
    chat: chatVars,
    merged,
    conflicts,
  };
}

/**
 * Get fully merged environment context.
 * Priority (lowest to highest): org → user → chat
 */
export async function getMergedEnv(params: {
  organizationId?: string;
  userId?: string;
  chatId?: string;
}): Promise<EnvVars> {
  const { organizationId, userId, chatId } = params;

  const [orgVars, userVars, chatVars] = await Promise.all([
    organizationId ? getOrgEnv(organizationId) : Promise.resolve({}),
    userId ? getUserEnv(userId) : Promise.resolve({}),
    chatId ? getChatEnv(chatId) : Promise.resolve({}),
  ]);

  // Merge with increasing priority
  return {
    ...orgVars,
    ...userVars,
    ...chatVars,
  };
}

/**
 * Set environment variables for a user.
 */
export async function setUserEnv(
  userId: string,
  variables: EnvVars,
  merge = true,
): Promise<void> {
  const existing = merge ? await getUserEnv(userId) : {};
  const merged = { ...existing, ...variables };

  // TODO: Encrypt values when encryption is implemented

  await db
    .insert(userEnvironment)
    .values({ userId, variables: merged })
    .onConflictDoUpdate({
      target: userEnvironment.userId,
      set: { variables: merged, updatedAt: new Date() },
    });
}

/**
 * Set environment variables for a chat.
 */
export async function setChatEnv(
  chatId: string,
  variables: EnvVars,
  merge = true,
): Promise<void> {
  const existing = merge ? await getChatEnv(chatId) : {};
  const merged = { ...existing, ...variables };

  // TODO: Encrypt values when encryption is implemented

  await db
    .insert(chatEnvironment)
    .values({ chatId, variables: merged })
    .onConflictDoUpdate({
      target: chatEnvironment.chatId,
      set: { variables: merged, updatedAt: new Date() },
    });
}

/**
 * Set environment variables for an organization.
 */
export async function setOrgEnv(
  organizationId: string,
  variables: EnvVars,
  merge = true,
): Promise<void> {
  const existing = merge ? await getOrgEnv(organizationId) : {};
  const merged = { ...existing, ...variables };

  // TODO: Encrypt values when encryption is implemented

  await db
    .insert(organizationEnvironment)
    .values({ organizationId, variables: merged })
    .onConflictDoUpdate({
      target: organizationEnvironment.organizationId,
      set: { variables: merged, updatedAt: new Date() },
    });
}

/**
 * Delete specific environment variables.
 */
export async function deleteEnvKeys(
  scope: { userId?: string; chatId?: string; organizationId?: string },
  keys: string[],
): Promise<void> {
  if (scope.userId) {
    const vars = await getUserEnv(scope.userId);
    keys.forEach((k) => delete vars[k]);
    await setUserEnv(scope.userId, vars, false);
  }

  if (scope.chatId) {
    const vars = await getChatEnv(scope.chatId);
    keys.forEach((k) => delete vars[k]);
    await setChatEnv(scope.chatId, vars, false);
  }

  if (scope.organizationId) {
    const vars = await getOrgEnv(scope.organizationId);
    keys.forEach((k) => delete vars[k]);
    await setOrgEnv(scope.organizationId, vars, false);
  }
}
