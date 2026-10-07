import {
  agent,
  artifact,
  beginTransaction,
  chat,
  db,
  memory,
  syncChange,
  syncConflict,
  syncDeviceToken,
  syncPairingSession,
  user,
} from "@/db";
import { createRouter } from "@/lib/create-app";
import { isMemberOf } from "@/lib/permissions";
import { issueSyncDeviceToken, requireSyncAuth } from "@/lib/sync-auth";
import { incomingSyncVersionWins } from "@/lib/sync/conflicts";
import { hashSyncPairingToken } from "@/lib/sync/tokens";
import { requireAuth } from "@/middleware/auth";
import { BadRequestError, ForbiddenError } from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";

const entityTypes = ["chat", "agent", "memory", "artifact"] as const;
const entityTables = { chat, agent, memory, artifact } as const;

const pullQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const pushedChangeSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200),
  deviceId: z.string().trim().min(1).max(200),
  entityType: z.enum(entityTypes),
  entityId: z.string().trim().min(1).max(200),
  operation: z.enum(["insert", "update", "delete"]),
  payload: z.record(z.string(), z.unknown()),
  version: z.number().int().positive().optional(),
  clientUpdatedAt: z.string().datetime().optional(),
});

const pushSchema = z.object({
  changes: z.array(pushedChangeSchema).min(1).max(100),
});
const pairingStartSchema = z.object({
  deviceId: z.string().trim().min(1).max(200),
});
const pairingExchangeSchema = z.object({
  pairingToken: z.string().trim().min(32).max(256),
  deviceId: z.string().trim().min(1).max(200),
});
const pairingRevokeSchema = z.object({
  deviceId: z.string().trim().min(1).max(200),
});

const router = createRouter();

router.post(
  "/sync/pairing/start",
  requireAuth,
  zValidator("json", pairingStartSchema),
  async (c) => {
    const organizationId = c.var.activeOrgId;
    const userId = c.var.user!.id;
    if (!organizationId || !(await isMemberOf(userId, organizationId))) {
      throw new ForbiddenError(
        "Select an organization before pairing a device",
      );
    }
    const pairingToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.insert(syncPairingSession).values({
      organizationId,
      userId,
      deviceId: c.req.valid("json").deviceId,
      tokenHash: hashSyncPairingToken(pairingToken),
      expiresAt,
    });
    return c.json({ pairingToken, expiresAt, organizationId, userId });
  },
);

router.post(
  "/sync/pairing/exchange",
  zValidator("json", pairingExchangeSchema),
  async (c) => {
    const { pairingToken, deviceId } = c.req.valid("json");
    const [pairing] = await db
      .select()
      .from(syncPairingSession)
      .where(
        and(
          eq(syncPairingSession.tokenHash, hashSyncPairingToken(pairingToken)),
          isNull(syncPairingSession.consumedAt),
          gt(syncPairingSession.expiresAt, new Date()),
          eq(syncPairingSession.deviceId, deviceId),
        ),
      )
      .limit(1);
    if (!pairing)
      return c.json({ error: "Pairing token is invalid or expired" }, 410);

    const consumed = await db
      .update(syncPairingSession)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(syncPairingSession.id, pairing.id),
          isNull(syncPairingSession.consumedAt),
        ),
      )
      .returning({ id: syncPairingSession.id });
    if (!consumed[0])
      return c.json({ error: "Pairing token was already used" }, 409);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const accessToken = await issueSyncDeviceToken({
      organizationId: pairing.organizationId,
      userId: pairing.userId,
      deviceId,
      expiresAt,
    });
    return c.json({
      accessToken,
      expiresAt,
      organizationId: pairing.organizationId,
    });
  },
);

router.post(
  "/sync/pairing/revoke",
  requireAuth,
  zValidator("json", pairingRevokeSchema),
  async (c) => {
    const organizationId = c.var.activeOrgId;
    const userId = c.var.user!.id;
    if (!organizationId || !(await isMemberOf(userId, organizationId))) {
      throw new ForbiddenError(
        "Select an organization before revoking a device",
      );
    }
    const revoked = await db
      .update(syncDeviceToken)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(syncDeviceToken.organizationId, organizationId),
          eq(syncDeviceToken.userId, userId),
          eq(syncDeviceToken.deviceId, c.req.valid("json").deviceId),
          isNull(syncDeviceToken.revokedAt),
        ),
      )
      .returning({ id: syncDeviceToken.id });
    return c.json({ revoked: revoked.length > 0 });
  },
);

router.get(
  "/sync/pull",
  requireSyncAuth,
  zValidator("query", pullQuerySchema),
  async (c) => {
    const organizationId = c.var.activeOrgId;
    const userId = c.var.user!.id;
    if (!organizationId || !(await isMemberOf(userId, organizationId))) {
      throw new ForbiddenError("Select an organization before syncing");
    }

    const { cursor, limit } = c.req.valid("query");
    const excludedDeviceId = c.req.header("x-circulo-device-id")?.trim();
    const conditions = [
      or(
        eq(syncChange.organizationId, organizationId),
        and(
          isNull(syncChange.organizationId),
          eq(syncChange.actorUserId, userId),
        ),
      ),
    ];
    if (cursor) conditions.push(gt(syncChange.createdAt, new Date(cursor)));
    if (excludedDeviceId)
      conditions.push(ne(syncChange.deviceId, excludedDeviceId));

    const changes = await db.query.syncChange.findMany({
      where: and(...conditions),
      orderBy: [asc(syncChange.createdAt), asc(syncChange.id)],
      limit,
    });
    return c.json({
      changes,
      nextCursor:
        changes.length === limit
          ? changes[changes.length - 1]?.createdAt.toISOString()
          : null,
    });
  },
);

router.post(
  "/sync/push",
  requireSyncAuth,
  zValidator("json", pushSchema),
  async (c) => {
    const organizationId = c.var.activeOrgId;
    const userId = c.var.user!.id;
    if (!organizationId || !(await isMemberOf(userId, organizationId))) {
      throw new ForbiddenError("Select an organization before syncing");
    }

    const changes = c.req.valid("json").changes;
    const deviceId =
      c.req.header("x-circulo-device-id")?.trim() || changes[0]?.deviceId;
    if (!deviceId) throw new BadRequestError("A sync device ID is required");
    const { tx, db: txDb } = await beginTransaction();
    const applied: string[] = [];
    const conflicts: Array<{
      entityType: string;
      entityId: string;
      current: unknown;
      incoming: unknown;
    }> = [];

    try {
      await txDb.execute(
        sql`SELECT set_config('circulo.sync_origin', ${deviceId}, true), set_config('circulo.sync_suppress', 'true', true)`,
      );
      for (const change of changes) {
        const table = entityTables[change.entityType] as any;
        const payload = await remapSyncIdentity(
          txDb,
          change.entityType,
          normalizePayload(change.payload),
          organizationId,
          userId,
        );
        if (payload.id !== change.entityId)
          throw new BadRequestError(
            "Sync entity ID does not match its payload",
          );
        if (
          "organizationId" in payload &&
          payload.organizationId !== organizationId
        ) {
          throw new ForbiddenError(
            "Sync payload belongs to another organization",
          );
        }
        if (change.entityType === "artifact" && payload.userId !== userId) {
          throw new ForbiddenError(
            "Artifacts can only be synced by their owner",
          );
        }

        const alreadyApplied = await txDb
          .select({ id: syncChange.id })
          .from(syncChange)
          .where(
            and(
              eq(syncChange.organizationId, organizationId),
              eq(syncChange.idempotencyKey, change.idempotencyKey),
            ),
          )
          .limit(1);
        if (alreadyApplied[0]) {
          applied.push(change.idempotencyKey);
          continue;
        }

        const current = await txDb
          .select()
          .from(table)
          .where(eq(table.id, change.entityId))
          .limit(1);
        const currentRow = current[0] as Record<string, unknown> | undefined;
        const [latestChange] = await txDb
          .select({
            deviceId: syncChange.deviceId,
            clientUpdatedAt: syncChange.clientUpdatedAt,
            idempotencyKey: syncChange.idempotencyKey,
          })
          .from(syncChange)
          .where(
            and(
              eq(syncChange.organizationId, organizationId),
              eq(syncChange.entityType, change.entityType),
              eq(syncChange.entityId, change.entityId),
            ),
          )
          .orderBy(desc(syncChange.createdAt), desc(syncChange.id))
          .limit(1);

        const incomingUpdatedAt =
          asDate(payload.updatedAt) ??
          asDate(change.clientUpdatedAt) ??
          new Date(0);
        const currentUpdatedAt =
          asDate(currentRow?.updatedAt) ??
          latestChange?.clientUpdatedAt ??
          new Date(0);
        const loses = Boolean(
          currentRow &&
          !incomingSyncVersionWins(
            {
              updatedAt: incomingUpdatedAt,
              deviceId,
              idempotencyKey: change.idempotencyKey,
            },
            {
              updatedAt: currentUpdatedAt,
              deviceId: latestChange?.deviceId ?? "server",
              idempotencyKey: latestChange?.idempotencyKey ?? "",
            },
          ),
        );

        await txDb.insert(syncChange).values({
          organizationId,
          actorUserId: userId,
          deviceId,
          entityType: change.entityType,
          entityId: change.entityId,
          operation: change.operation,
          payload,
          version: change.version ?? 1,
          clientUpdatedAt: asDate(change.clientUpdatedAt) ?? incomingUpdatedAt,
          idempotencyKey: change.idempotencyKey,
        });

        if (loses) {
          conflicts.push({
            entityType: change.entityType,
            entityId: change.entityId,
            current: currentRow,
            incoming: payload,
          });
          if (currentRow) {
            await txDb.insert(syncConflict).values({
              organizationId,
              entityType: change.entityType,
              entityId: change.entityId,
              incomingDeviceId: deviceId,
              incomingIdempotencyKey: change.idempotencyKey,
              incomingPayload: payload,
              winningPayload: currentRow,
            });
          }
          applied.push(change.idempotencyKey);
          continue;
        }

        if (change.operation === "delete") {
          if ("deletedAt" in table) {
            await txDb
              .update(table)
              .set({
                deletedAt: incomingUpdatedAt,
                updatedAt: incomingUpdatedAt,
              })
              .where(eq(table.id, change.entityId));
          } else if ("isArchived" in table) {
            await txDb
              .update(table)
              .set({ isArchived: true, updatedAt: incomingUpdatedAt })
              .where(eq(table.id, change.entityId));
          }
        } else {
          const { id: _id, ...updates } = payload;
          await txDb
            .insert(table)
            .values(payload)
            .onConflictDoUpdate({ target: table.id, set: updates });
        }
        applied.push(change.idempotencyKey);
      }
      await tx.commit();
      return c.json({ applied, conflicts });
    } catch (error) {
      try {
        await tx.rollback();
      } catch {
        /* driver may have rolled back already */
      }
      throw error;
    }
  },
);

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizePayload(payload: Record<string, unknown>) {
  const normalized = { ...payload };
  for (const key of [
    "createdAt",
    "updatedAt",
    "deletedAt",
    "lastUsedAt",
    "created_at",
    "updated_at",
    "deleted_at",
  ]) {
    if (key in normalized)
      normalized[key] = asDate(normalized[key]) ?? normalized[key];
  }
  return normalized;
}

async function remapSyncIdentity(
  txDb: any,
  entityType: (typeof entityTypes)[number],
  payload: Record<string, unknown>,
  organizationId: string,
  pairedUserId: string,
) {
  const normalized = { ...payload };
  if ("organizationId" in normalized) {
    normalized.organizationId = organizationId;
  }

  const ownershipFields =
    entityType === "chat"
      ? ["creatorId"]
      : entityType === "agent"
        ? ["createdBy"]
        : entityType === "memory"
          ? ["userId", "createdBy"]
          : ["userId"];
  const sourceUserIds = ownershipFields.flatMap((field) => {
    const value = normalized[field];
    return typeof value === "string" ? [value] : [];
  });
  const knownUserIds = new Set(
    sourceUserIds.length === 0
      ? []
      : (
          await txDb
            .select({ id: user.id })
            .from(user)
            .where(inArray(user.id, sourceUserIds))
        ).map((row: { id: string }) => row.id),
  );
  for (const field of ownershipFields) {
    const value = normalized[field];
    if (typeof value === "string" && !knownUserIds.has(value)) {
      normalized[field] = pairedUserId;
    }
  }
  return normalized;
}

export default router;
