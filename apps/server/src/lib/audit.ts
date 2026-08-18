import { db, type DbInstance } from "@/db";
import { auditEvent, auditOutbox } from "@/db/schema";
import { nanoid } from "nanoid";

export type AuditActorType = "user" | "api_key" | "service" | "anonymous";
export type AuditOutcome = "success" | "denied" | "failure";

export type AuditInput = {
  actorType: AuditActorType;
  actorId?: string | null;
  authMethod?: string | null;
  organizationId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  statusCode?: number | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

function boundedMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return undefined;
  const safe = Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !/(authorization|cookie|token|secret|password|key)/i.test(key))
      .slice(0, 32),
  );
  const serialized = JSON.stringify(safe);
  if (serialized.length <= 8_000) return safe;
  return { truncated: true };
}

export async function recordAuditEvent(
  input: AuditInput,
  database: DbInstance = db,
): Promise<string> {
  const eventId = nanoid();
  await database.transaction(async (tx) => {
    await tx.insert(auditEvent).values({
      id: eventId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      authMethod: input.authMethod ?? null,
      organizationId: input.organizationId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      outcome: input.outcome,
      statusCode: input.statusCode ?? null,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: boundedMetadata(input.metadata),
    });
    await tx.insert(auditOutbox).values({
      id: nanoid(),
      eventId,
    });
  });
  return eventId;
}
