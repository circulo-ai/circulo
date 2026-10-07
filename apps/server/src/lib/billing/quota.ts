import { beginTransaction, db } from "@/db";
import { quotaBucket, quotaReservation } from "@/db/schema";
import {
  getOrganizationFeatureLimit,
  type OrganizationLimitFeature,
} from "@/lib/billing/limits";
import { RateLimitError } from "@circulo-ai/types";
import { and, eq, lte, or, sql } from "drizzle-orm";

export type QuotaReservationHandle = {
  id: string | null;
  organizationId: string;
  feature: OrganizationLimitFeature;
  quantity: number;
  periodStart: Date;
  unlimited: boolean;
};

function periodFor(feature: OrganizationLimitFeature, now = new Date()) {
  const start = new Date(now);
  if (feature === "max_messages_per_day") {
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
  }
  const end = new Date(start);
  if (feature === "max_messages_per_day") end.setUTCDate(end.getUTCDate() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

async function expireReservations(
  tx: typeof db,
  organizationId: string,
  feature: string,
  periodStart: Date,
) {
  const expired = await tx
    .select({ id: quotaReservation.id, quantity: quotaReservation.quantity })
    .from(quotaReservation)
    .where(
      and(
        eq(quotaReservation.organizationId, organizationId),
        eq(quotaReservation.feature, feature),
        eq(quotaReservation.periodStart, periodStart),
        eq(quotaReservation.status, "reserved"),
        lte(quotaReservation.expiresAt, new Date()),
      ),
    );

  for (const reservation of expired) {
    const marked = await tx
      .update(quotaReservation)
      .set({ status: "expired" })
      .where(
        and(
          eq(quotaReservation.id, reservation.id),
          eq(quotaReservation.status, "reserved"),
        ),
      )
      .returning({ id: quotaReservation.id });
    if (marked[0]) {
      await tx
        .update(quotaBucket)
        .set({
          reserved: sql`GREATEST(0, ${quotaBucket.reserved} - ${reservation.quantity})`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(quotaBucket.organizationId, organizationId),
            eq(quotaBucket.feature, feature),
            eq(quotaBucket.periodStart, periodStart),
          ),
        );
    }
  }
}

/** Atomically reserve a quota unit before starting an expensive operation. */
export async function reserveQuota(params: {
  organizationId: string;
  userId?: string | null;
  feature: OrganizationLimitFeature;
  quantity?: number;
  idempotencyKey: string;
  ttlMs?: number;
}): Promise<QuotaReservationHandle> {
  const quantity = Math.max(1, Math.floor(params.quantity ?? 1));
  const limit = await getOrganizationFeatureLimit(
    params.organizationId,
    params.feature,
  );
  const { start, end } = periodFor(params.feature);

  if (limit === "unlimited") {
    return {
      id: null,
      organizationId: params.organizationId,
      feature: params.feature,
      quantity,
      periodStart: start,
      unlimited: true,
    };
  }

  const { tx, db: txDb } = await beginTransaction();
  try {
    const existing = await txDb
      .select({
        id: quotaReservation.id,
        quantity: quotaReservation.quantity,
        status: quotaReservation.status,
      })
      .from(quotaReservation)
      .where(eq(quotaReservation.idempotencyKey, params.idempotencyKey))
      .limit(1);
    if (existing[0]) {
      await tx.commit();
      return {
        id: existing[0].id,
        organizationId: params.organizationId,
        feature: params.feature,
        quantity: existing[0].quantity,
        periodStart: start,
        unlimited: false,
      };
    }

    await txDb
      .insert(quotaBucket)
      .values({
        organizationId: params.organizationId,
        feature: params.feature,
        periodStart: start,
        periodEnd: end,
        limit,
      })
      .onConflictDoUpdate({
        target: [
          quotaBucket.organizationId,
          quotaBucket.feature,
          quotaBucket.periodStart,
        ],
        set: { limit, periodEnd: end, updatedAt: new Date() },
      });

    await expireReservations(
      txDb,
      params.organizationId,
      params.feature,
      start,
    );

    const updated = await txDb
      .update(quotaBucket)
      .set({
        reserved: sql`${quotaBucket.reserved} + ${quantity}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(quotaBucket.organizationId, params.organizationId),
          eq(quotaBucket.feature, params.feature),
          eq(quotaBucket.periodStart, start),
          or(
            sql`${quotaBucket.limit} IS NULL`,
            sql`${quotaBucket.reserved} + ${quotaBucket.consumed} + ${quantity} <= ${quotaBucket.limit}`,
          ),
        ),
      )
      .returning({ organizationId: quotaBucket.organizationId });

    if (!updated[0]) {
      await tx.rollback();
      throw new RateLimitError(
        Math.max(1, Math.ceil((end.getTime() - Date.now()) / 1000)),
        `${params.feature} quota reached for the current billing period`,
      );
    }

    const [reservation] = await txDb
      .insert(quotaReservation)
      .values({
        organizationId: params.organizationId,
        userId: params.userId ?? null,
        feature: params.feature,
        periodStart: start,
        quantity,
        idempotencyKey: params.idempotencyKey,
        expiresAt: new Date(Date.now() + (params.ttlMs ?? 15 * 60 * 1000)),
      })
      .returning({ id: quotaReservation.id });
    if (!reservation) {
      throw new Error("Quota reservation could not be created");
    }

    await tx.commit();
    return {
      id: reservation.id,
      organizationId: params.organizationId,
      feature: params.feature,
      quantity,
      periodStart: start,
      unlimited: false,
    };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // The database may already have rolled back after a driver error.
    }
    throw error;
  }
}

async function finishReservation(
  reservation: QuotaReservationHandle,
  status: "consumed" | "released",
) {
  if (reservation.unlimited || !reservation.id) return;
  const { tx, db: txDb } = await beginTransaction();
  try {
    const changed = await txDb
      .update(quotaReservation)
      .set({ status, consumedAt: status === "consumed" ? new Date() : null })
      .where(
        and(
          eq(quotaReservation.id, reservation.id),
          eq(quotaReservation.status, "reserved"),
        ),
      )
      .returning({ quantity: quotaReservation.quantity });
    if (changed[0]) {
      await txDb
        .update(quotaBucket)
        .set({
          reserved: sql`GREATEST(0, ${quotaBucket.reserved} - ${changed[0].quantity})`,
          ...(status === "consumed"
            ? {
                consumed: sql`${quotaBucket.consumed} + ${changed[0].quantity}`,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(quotaBucket.organizationId, reservation.organizationId),
            eq(quotaBucket.feature, reservation.feature),
            eq(quotaBucket.periodStart, reservation.periodStart),
          ),
        );
    }
    await tx.commit();
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // Best effort cleanup; the reservation can expire safely.
    }
    throw error;
  }
}

export function consumeQuota(reservation: QuotaReservationHandle) {
  return finishReservation(reservation, "consumed");
}

export function releaseQuota(reservation: QuotaReservationHandle) {
  return finishReservation(reservation, "released");
}
