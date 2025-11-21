import { db, organization } from "@/db";
import { apiKey as apiKeyTable } from "@/db/schema";
import { authenticateApiKey } from "@/lib/api-key/auth";
import { createLogger } from "@/lib/logs/console/logger";
import { getUserEntityPermissions } from "@/lib/permissions/utils";
import { and, eq } from "drizzle-orm";

const logger = createLogger("ApiKeyService");

export interface ApiKeyAuthOptions {
  userId?: string;
  organizationId?: string;
  keyTypes?: ("personal" | "organization")[];
}

export interface ApiKeyAuthResult {
  success: boolean;
  userId?: string;
  keyId?: string;
  keyType?: "personal" | "workspace";
  organizationId?: string;
  error?: string;
}

/**
 * Authenticate an API key from header with flexible filtering options
 */
export async function authenticateApiKeyFromHeader(
  apiKeyHeader: string,
  options: ApiKeyAuthOptions = {},
): Promise<ApiKeyAuthResult> {
  if (!apiKeyHeader) {
    return { success: false, error: "API key required" };
  }

  try {
    let organizationSettings: {
      allowPersonalApiKeys: boolean;
    } | null = null;

    if (options.organizationId) {
      const rows = await db
        .select({
          allowPersonalApiKeys: organization.allowPersonalApiKeys,
        })
        .from(organization)
        .where(eq(organization.id, options.organizationId))
        .limit(1);

      if (!rows.length) {
        organizationSettings = null;
      }

      organizationSettings = {
        allowPersonalApiKeys: rows[0].allowPersonalApiKeys ?? false,
      };

      if (!organizationSettings) {
        return { success: false, error: "Workspace not found" };
      }
    }

    // Build query based on options
    let query = db
      .select({
        id: apiKeyTable.id,
        userId: apiKeyTable.userId,
        organizationId: apiKeyTable.organizationId,
        type: apiKeyTable.type,
        key: apiKeyTable.key,
        expiresAt: apiKeyTable.expiresAt,
      })
      .from(apiKeyTable);

    // Apply filters
    const conditions = [];

    if (options.userId) {
      conditions.push(eq(apiKeyTable.userId, options.userId));
    }

    if (options.keyTypes?.length) {
      if (options.keyTypes.length === 1) {
        conditions.push(eq(apiKeyTable.type, options.keyTypes[0]));
      } else {
        // For multiple types, we'll filter in memory since drizzle's inArray is complex here
      }
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const keyRecords = await query;

    const filteredRecords = keyRecords.filter((record) => {
      const keyType = record.type as "personal" | "organization";

      if (options.keyTypes?.length && !options.keyTypes.includes(keyType)) {
        return false;
      }

      if (options.organizationId) {
        if (keyType === "organization") {
          return record.organizationId === options.organizationId;
        }

        if (keyType === "personal") {
          return organizationSettings?.allowPersonalApiKeys ?? false;
        }
      }

      return true;
    });

    const permissionCache = new Map<string, boolean>();

    // Authenticate each key
    for (const storedKey of filteredRecords) {
      // Skip expired keys
      if (storedKey.expiresAt && storedKey.expiresAt < new Date()) {
        continue;
      }

      if (
        options.organizationId &&
        (storedKey.type as "personal" | "workspace") === "personal"
      ) {
        if (!organizationSettings?.allowPersonalApiKeys) {
          continue;
        }

        if (!storedKey.userId) {
          continue;
        }

        if (!permissionCache.has(storedKey.userId)) {
          const permission = await getUserEntityPermissions(
            storedKey.userId,
            "organization",
            options.organizationId,
          );
          permissionCache.set(storedKey.userId, permission !== null);
        }

        if (!permissionCache.get(storedKey.userId)) {
          continue;
        }
      }

      try {
        const isValid = await authenticateApiKey(apiKeyHeader, storedKey.key);
        if (isValid) {
          return {
            success: true,
            userId: storedKey.userId,
            keyId: storedKey.id,
            keyType: storedKey.type as "personal" | "workspace",
            organizationId:
              storedKey.organizationId || options.organizationId || undefined,
          };
        }
      } catch (error) {
        logger.error("Error authenticating API key:", error);
      }
    }

    return { success: false, error: "Invalid API key" };
  } catch (error) {
    logger.error("API key authentication error:", error);
    return { success: false, error: "Authentication failed" };
  }
}

/**
 * Update the last used timestamp for an API key
 */
export async function updateApiKeyLastUsed(keyId: string): Promise<void> {
  try {
    await db
      .update(apiKeyTable)
      .set({ lastUsed: new Date() })
      .where(eq(apiKeyTable.id, keyId));
  } catch (error) {
    logger.error("Error updating API key last used:", error);
  }
}
