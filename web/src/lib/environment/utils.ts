import { db } from "@/db";
import { chatEnvironment, environment } from "@/db/schema";
import { createLogger } from "@/lib/logs/console/logger";
import { decryptSecret } from "@/lib/server-utils";
import { eq } from "drizzle-orm";

const logger = createLogger("EnvironmentUtils");

/**
 * Get environment variable keys for a user
 * Returns only the variable names, not their values
 */
export async function getEnvironmentVariableKeys(userId: string): Promise<{
  variableNames: string[];
  count: number;
}> {
  try {
    const result = await db
      .select()
      .from(environment)
      .where(eq(environment.userId, userId))
      .limit(1);

    if (!result.length || !result[0].variables) {
      return {
        variableNames: [],
        count: 0,
      };
    }

    // Get the keys (variable names) without decrypting values
    const encryptedVariables = result[0].variables as Record<string, string>;
    const variableNames = Object.keys(encryptedVariables);

    return {
      variableNames,
      count: variableNames.length,
    };
  } catch (error) {
    logger.error("Error getting environment variable keys:", error);
    throw new Error("Failed to get environment variables");
  }
}

export async function getPersonalAndChatEnv(
  userId: string,
  chatId?: string,
): Promise<{
  personalEncrypted: Record<string, string>;
  chatEncrypted: Record<string, string>;
  personalDecrypted: Record<string, string>;
  chatDecrypted: Record<string, string>;
  conflicts: string[];
}> {
  const [personalRows, chatRows] = await Promise.all([
    db
      .select()
      .from(environment)
      .where(eq(environment.userId, userId))
      .limit(1),
    chatId
      ? db
          .select()
          .from(chatEnvironment)
          .where(eq(chatEnvironment.chatId, chatId))
          .limit(1)
      : Promise.resolve([] as any[]),
  ]);

  const personalEncrypted: Record<string, string> =
    (personalRows[0]?.variables as any) || {};
  const chatEncrypted: Record<string, string> =
    (chatRows[0]?.variables as any) || {};

  const decryptAll = async (src: Record<string, string>) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(src)) {
      try {
        const { decrypted } = await decryptSecret(v);
        out[k] = decrypted;
      } catch {
        out[k] = "";
      }
    }
    return out;
  };

  const [personalDecrypted, chatDecrypted] = await Promise.all([
    decryptAll(personalEncrypted),
    decryptAll(chatEncrypted),
  ]);

  const conflicts = Object.keys(personalEncrypted).filter(
    (k) => k in chatEncrypted,
  );

  return {
    personalEncrypted,
    chatEncrypted,
    personalDecrypted,
    chatDecrypted,
    conflicts,
  };
}

export async function getEffectiveDecryptedEnv(
  userId: string,
  chatId?: string,
): Promise<Record<string, string>> {
  const { personalDecrypted, chatDecrypted } = await getPersonalAndChatEnv(
    userId,
    chatId,
  );
  return { ...personalDecrypted, ...chatDecrypted };
}
