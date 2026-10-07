import { db } from "@/db";
import * as schema from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { env } from "../env";

export type RuntimeKind = "cloud" | "self-hosted" | "desktop";

const INSTANCE_ID = 1;
const BOOTSTRAP_CLAIM_TTL_MS = 5 * 60 * 1000;

export function getRuntimeKind(): RuntimeKind {
  if (env.CIRCULO_RUNTIME_KIND) return env.CIRCULO_RUNTIME_KIND;
  return env.CIRCULO_DEPLOYMENT_MODE === "local" ? "desktop" : "cloud";
}

export function isInstanceManagedRuntime() {
  return getRuntimeKind() !== "cloud";
}

export function isCloudRuntime() {
  return getRuntimeKind() === "cloud";
}

export function isSystemAdmin(user: unknown) {
  const role =
    user && typeof user === "object" && "role" in user
      ? (user as { role?: unknown }).role
      : undefined;
  return role === "admin" || role === "superadmin";
}

type InstanceAuthSettings = typeof schema.instanceAuthSettings.$inferSelect;

async function findBootstrapUser() {
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .orderBy(asc(schema.user.createdAt), asc(schema.user.id))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Creates the local policy row lazily so existing deployments can upgrade
 * without a manual setup command. Existing installations nominate their
 * earliest account as the initial local administrator.
 */
export async function ensureInstanceAuthSettings(): Promise<InstanceAuthSettings> {
  if (!isInstanceManagedRuntime()) {
    throw new Error("Instance auth settings are not used by cloud runtime");
  }

  const now = new Date();
  await db
    .insert(schema.instanceAuthSettings)
    .values({
      id: INSTANCE_ID,
      signupEnabled: true,
      bootstrapCompleted: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: schema.instanceAuthSettings.id });

  let settings = await getInstanceAuthSettings();
  if (!settings) throw new Error("Failed to initialize instance auth settings");

  const bootstrapUserId = await findBootstrapUser();
  if (!bootstrapUserId) {
    const claimExpired =
      settings.bootstrapClaimedAt &&
      settings.bootstrapClaimedAt.getTime() + BOOTSTRAP_CLAIM_TTL_MS <
        now.getTime();

    if (settings.bootstrapCompleted && !settings.bootstrapUserId) {
      await db
        .update(schema.instanceAuthSettings)
        .set({
          bootstrapCompleted: false,
          signupEnabled: true,
          bootstrapClaimedAt: null,
          updatedAt: now,
        })
        .where(eq(schema.instanceAuthSettings.id, INSTANCE_ID));
    } else if (claimExpired) {
      await db
        .update(schema.instanceAuthSettings)
        .set({
          bootstrapUserId: null,
          bootstrapClaimedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.instanceAuthSettings.id, INSTANCE_ID),
            eq(schema.instanceAuthSettings.bootstrapCompleted, false),
          ),
        );
    }
  } else if (!settings.bootstrapCompleted && !settings.bootstrapUserId) {
    const claimed = await db
      .update(schema.instanceAuthSettings)
      .set({
        bootstrapUserId,
        bootstrapClaimedAt: now,
        bootstrapCompleted: true,
        signupEnabled: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.instanceAuthSettings.id, INSTANCE_ID),
          eq(schema.instanceAuthSettings.bootstrapCompleted, false),
          isNull(schema.instanceAuthSettings.bootstrapUserId),
        ),
      )
      .returning({ id: schema.instanceAuthSettings.id });

    if (claimed.length > 0) {
      await db
        .update(schema.user)
        .set({ role: "admin", updatedAt: now })
        .where(eq(schema.user.id, bootstrapUserId));
    }
  }

  settings = (await getInstanceAuthSettings()) ?? settings;

  // Local credentials are established by the instance itself. Marking them
  // verified keeps Better Auth's invitation APIs usable without requiring a
  // cloud mail provider or pretending that a self-hosted account needs an
  // external proof of ownership.
  await db
    .update(schema.user)
    .set({ emailVerified: true, updatedAt: now })
    .where(eq(schema.user.emailVerified, false));

  return settings;
}

export async function getInstanceAuthSettings() {
  const rows = await db
    .select()
    .from(schema.instanceAuthSettings)
    .where(eq(schema.instanceAuthSettings.id, INSTANCE_ID))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Atomically claims the bootstrap slot. While the slot is claimed, every
 * other new-user request is rejected until the first account is persisted.
 */
export async function authorizeUserProvisioning(user: {
  id: string;
  role?: string | null;
}) {
  if (!isInstanceManagedRuntime()) return { allowed: true, isBootstrap: false };

  const settings = await ensureInstanceAuthSettings();
  if (settings.bootstrapCompleted) {
    return {
      allowed: settings.signupEnabled,
      isBootstrap: false,
    };
  }

  const now = new Date();
  const claimed = await db
    .update(schema.instanceAuthSettings)
    .set({
      bootstrapUserId: user.id,
      bootstrapClaimedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.instanceAuthSettings.id, INSTANCE_ID),
        eq(schema.instanceAuthSettings.bootstrapCompleted, false),
        isNull(schema.instanceAuthSettings.bootstrapUserId),
      ),
    )
    .returning({ id: schema.instanceAuthSettings.id });

  return { allowed: claimed.length > 0, isBootstrap: claimed.length > 0 };
}

export async function finalizeBootstrap(userId: string) {
  if (!isInstanceManagedRuntime()) return false;

  const now = new Date();
  const finalized = await db
    .update(schema.instanceAuthSettings)
    .set({
      bootstrapCompleted: true,
      signupEnabled: false,
      updatedBy: userId,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.instanceAuthSettings.id, INSTANCE_ID),
        eq(schema.instanceAuthSettings.bootstrapCompleted, false),
        eq(schema.instanceAuthSettings.bootstrapUserId, userId),
      ),
    )
    .returning({ id: schema.instanceAuthSettings.id });

  if (finalized.length === 0) return false;

  await db
    .update(schema.user)
    .set({ role: "admin", updatedAt: now })
    .where(eq(schema.user.id, userId));
  return true;
}

export async function updateSignupPolicy(
  signupEnabled: boolean,
  updatedBy: string,
) {
  if (!isInstanceManagedRuntime()) {
    throw new Error(
      "Cloud sign-up policy is managed by the cloud control plane",
    );
  }

  const settings = await ensureInstanceAuthSettings();
  const updated = await db
    .update(schema.instanceAuthSettings)
    .set({ signupEnabled, updatedBy, updatedAt: new Date() })
    .where(eq(schema.instanceAuthSettings.id, INSTANCE_ID))
    .returning();
  return updated[0] ?? settings;
}
