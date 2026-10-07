import {
  db,
  message,
  workflowRun,
  workflowWebhook,
  workflowWebhookDelivery,
} from "@/db";
import { chatMemberRepo, chatRepo } from "@/db/repositories";
import { createRouter } from "@/lib/create-app";
import {
  hasPermissionForUser,
  isMemberOf,
  type ApiKeyPermissions,
} from "@/lib/permissions";
import { decryptSecret, encryptSecret } from "@/lib/server-utils";
import {
  DEFAULT_WEBHOOK_MAX_AGE_MS,
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  verifyWebhookSignature,
} from "@/lib/webhooks/signature";
import { requireAuth } from "@/middleware/auth";
import { workflowRunService } from "@/workflows/runtime/workflow-run-service";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const router = createRouter();
const webhookIdParams = z.object({ id: z.uuid() });
const sourceSchema = z.enum(["github", "telegram", "slack", "custom"]);
const managementSchema = z.object({
  organizationId: z.string().min(1),
  chatId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  source: sourceSchema,
  eventName: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/, "Use a safe event name"),
});
const updateSchema = managementSchema
  .omit({ organizationId: true, chatId: true })
  .partial()
  .extend({ status: z.enum(["active", "paused", "disabled"]).optional() });

const MAX_WEBHOOK_BODY_BYTES = 1_000_000;
const STALE_CLAIM_MS = 2 * 60 * 1000;

function endpointFor(id: string): string {
  return `/api/automation/webhooks/${id}/events`;
}

function publicWebhook(row: typeof workflowWebhook.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    chatId: row.chatId,
    name: row.name,
    source: row.source,
    eventName: row.eventName,
    status: row.status,
    endpoint: endpointFor(row.id),
    lastTriggeredAt: row.lastTriggeredAt,
    lastDeliveryStatus: row.lastDeliveryStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function requireManager(
  userId: string,
  organizationId: string,
  apiKeyPermissions?: ApiKeyPermissions,
) {
  if (!(await isMemberOf(userId, organizationId))) {
    throw new ForbiddenError("You don't have access to this organization");
  }
  if (
    !(await hasPermissionForUser(
      userId,
      organizationId,
      "automation",
      "manage",
      apiKeyPermissions,
    ))
  ) {
    throw new ForbiddenError("Only workspace managers can manage webhooks");
  }
}

async function requireConfiguredChat(
  userId: string,
  organizationId: string,
  chatId: string,
) {
  const chat = await chatRepo.findById(chatId);
  if (!chat || chat.isDeleted) throw new NotFoundError("Chat not found");
  if (chat.organizationId !== organizationId) {
    throw new ForbiddenError("Chat belongs to another organization");
  }
  if (!(await chatMemberRepo.isMember(userId, chatId))) {
    throw new ForbiddenError("You are not a member of this chat");
  }
  return chat;
}

router.get("/automation/webhooks", requireAuth, async (c) => {
  const organizationId = c.get("activeOrgId");
  if (!organizationId) throw new BadRequestError("No active organization");
  await requireManager(c.var.user!.id, organizationId, c.var.apiKeyPermissions);
  const rows = await db.query.workflowWebhook.findMany({
    where: eq(workflowWebhook.organizationId, organizationId),
    orderBy: desc(workflowWebhook.createdAt),
  });
  return c.json(rows.map(publicWebhook));
});

router.post(
  "/automation/webhooks",
  requireAuth,
  zValidator("json", managementSchema),
  async (c) => {
    const body = c.req.valid("json");
    await requireManager(
      c.var.user!.id,
      body.organizationId,
      c.var.apiKeyPermissions,
    );
    await requireConfiguredChat(
      c.var.user!.id,
      body.organizationId,
      body.chatId,
    );

    const secret = randomBytes(32).toString("hex");
    const encrypted = await encryptSecret(secret);
    const [created] = await db
      .insert(workflowWebhook)
      .values({
        organizationId: body.organizationId,
        chatId: body.chatId,
        createdBy: c.var.user!.id,
        name: body.name,
        source: body.source,
        eventName: body.eventName,
        secretEncrypted: encrypted.encrypted,
      })
      .returning();
    if (!created) throw new Error("Unable to create webhook");
    return c.json(
      { webhook: publicWebhook(created), secret, secretShownOnce: true },
      201,
    );
  },
);

router.patch(
  "/automation/webhooks/:id",
  requireAuth,
  zValidator("param", webhookIdParams),
  zValidator("json", updateSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const current = await db.query.workflowWebhook.findFirst({
      where: eq(workflowWebhook.id, id),
    });
    if (!current) throw new NotFoundError("Webhook not found");
    await requireManager(
      c.var.user!.id,
      current.organizationId,
      c.var.apiKeyPermissions,
    );
    const [updated] = await db
      .update(workflowWebhook)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(workflowWebhook.id, id))
      .returning();
    return c.json(updated ? publicWebhook(updated) : publicWebhook(current));
  },
);

router.post(
  "/automation/webhooks/:id/rotate-secret",
  requireAuth,
  zValidator("param", webhookIdParams),
  async (c) => {
    const { id } = c.req.valid("param");
    const current = await db.query.workflowWebhook.findFirst({
      where: eq(workflowWebhook.id, id),
    });
    if (!current) throw new NotFoundError("Webhook not found");
    await requireManager(
      c.var.user!.id,
      current.organizationId,
      c.var.apiKeyPermissions,
    );
    const secret = randomBytes(32).toString("hex");
    const encrypted = await encryptSecret(secret);
    const [updated] = await db
      .update(workflowWebhook)
      .set({ secretEncrypted: encrypted.encrypted, updatedAt: new Date() })
      .where(eq(workflowWebhook.id, id))
      .returning();
    if (!updated) throw new Error("Unable to rotate webhook secret");
    return c.json({
      webhook: publicWebhook(updated),
      secret,
      secretShownOnce: true,
    });
  },
);

router.delete(
  "/automation/webhooks/:id",
  requireAuth,
  zValidator("param", webhookIdParams),
  async (c) => {
    const { id } = c.req.valid("param");
    const current = await db.query.workflowWebhook.findFirst({
      where: eq(workflowWebhook.id, id),
    });
    if (!current) throw new NotFoundError("Webhook not found");
    await requireManager(
      c.var.user!.id,
      current.organizationId,
      c.var.apiKeyPermissions,
    );
    await db.delete(workflowWebhook).where(eq(workflowWebhook.id, id));
    return c.json({ deleted: true });
  },
);

router.get(
  "/automation/webhooks/:id/deliveries",
  requireAuth,
  zValidator("param", webhookIdParams),
  async (c) => {
    const { id } = c.req.valid("param");
    const current = await db.query.workflowWebhook.findFirst({
      where: eq(workflowWebhook.id, id),
    });
    if (!current) throw new NotFoundError("Webhook not found");
    await requireManager(
      c.var.user!.id,
      current.organizationId,
      c.var.apiKeyPermissions,
    );
    return c.json(
      await db.query.workflowWebhookDelivery.findMany({
        where: eq(workflowWebhookDelivery.webhookId, id),
        orderBy: desc(workflowWebhookDelivery.receivedAt),
        limit: 50,
      }),
    );
  },
);

/**
 * Public signed ingress. It intentionally does not use session auth: the
 * encrypted per-webhook secret and a five-minute timestamp window are the
 * authentication boundary for external providers.
 */
router.post("/automation/webhooks/:id/events", async (c) => {
  const { id } = c.req.param();
  if (!z.uuid().safeParse(id).success) {
    throw new BadRequestError("Invalid webhook id");
  }
  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
    throw new BadRequestError("Webhook payload is too large");
  }
  const body = await c.req.text();
  if (new TextEncoder().encode(body).byteLength > MAX_WEBHOOK_BODY_BYTES) {
    throw new BadRequestError("Webhook payload is too large");
  }

  const webhook = await db.query.workflowWebhook.findFirst({
    where: eq(workflowWebhook.id, id),
  });
  if (!webhook || webhook.status === "disabled") {
    throw new NotFoundError("Webhook not found");
  }
  if (webhook.status !== "active") {
    throw new ForbiddenError("Webhook is paused");
  }

  let secret: string;
  try {
    secret = (await decryptSecret(webhook.secretEncrypted)).decrypted;
  } catch {
    throw new Error("Webhook secret could not be decrypted");
  }
  const signature = verifyWebhookSignature({
    secret,
    body,
    signature: c.req.header(WEBHOOK_SIGNATURE_HEADER),
    timestamp: c.req.header(WEBHOOK_TIMESTAMP_HEADER),
    maxAgeMs: DEFAULT_WEBHOOK_MAX_AGE_MS,
  });
  if (!signature.valid) {
    throw new UnauthorizedError("Invalid webhook signature");
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("payload must be an object");
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestError("Webhook body must be a JSON object");
  }

  const eventId =
    c.req.header(WEBHOOK_EVENT_ID_HEADER)?.trim() ||
    createHash("sha256")
      .update(`${c.req.header(WEBHOOK_TIMESTAMP_HEADER) ?? ""}.${body}`, "utf8")
      .digest("hex");
  if (eventId.length > 255) throw new BadRequestError("Event id is too long");

  let [delivery] = await db
    .insert(workflowWebhookDelivery)
    .values({ webhookId: webhook.id, eventId, status: "accepted" })
    .onConflictDoNothing({
      target: [
        workflowWebhookDelivery.webhookId,
        workflowWebhookDelivery.eventId,
      ],
    })
    .returning();

  if (!delivery) {
    const existing = await db.query.workflowWebhookDelivery.findFirst({
      where: and(
        eq(workflowWebhookDelivery.webhookId, webhook.id),
        eq(workflowWebhookDelivery.eventId, eventId),
      ),
    });
    if (!existing) throw new Error("Unable to claim webhook delivery");
    const staleClaim =
      existing.status === "accepted" &&
      !existing.runId &&
      existing.receivedAt.getTime() < Date.now() - STALE_CLAIM_MS;
    const failedRetry = existing.status === "failed";
    if (staleClaim || failedRetry) {
      [delivery] = await db
        .update(workflowWebhookDelivery)
        .set({ status: "accepted", error: null, receivedAt: new Date() })
        .where(
          and(
            eq(workflowWebhookDelivery.id, existing.id),
            failedRetry
              ? eq(workflowWebhookDelivery.status, "failed")
              : and(
                  eq(workflowWebhookDelivery.status, "accepted"),
                  isNull(workflowWebhookDelivery.runId),
                  lte(
                    workflowWebhookDelivery.receivedAt,
                    new Date(Date.now() - STALE_CLAIM_MS),
                  ),
                ),
          ),
        )
        .returning();
    }
    if (!delivery) {
      return c.json(
        {
          accepted: true,
          duplicate: true,
          deliveryId: existing.id,
          runId: existing.runId,
        },
        202,
      );
    }
  }

  const now = new Date();
  const messageId = crypto.randomUUID();
  const content = `[Webhook event: ${webhook.source}/${webhook.eventName}]\n${JSON.stringify(payload)}`;
  try {
    if (!(await isMemberOf(webhook.createdBy, webhook.organizationId))) {
      throw new ForbiddenError("Webhook owner is no longer a workspace member");
    }
    await requireConfiguredChat(
      webhook.createdBy,
      webhook.organizationId,
      webhook.chatId,
    );
    await db.insert(message).values({
      id: messageId,
      chatId: webhook.chatId,
      authorType: "user",
      authorId: webhook.createdBy,
      role: "user",
      content,
      parts: [{ type: "text", text: content }],
      attachments: [],
    });
    const run = await workflowRunService.start({
      chatId: webhook.chatId,
      messageId,
      messages: [
        {
          id: messageId,
          role: "user",
          parts: [{ type: "text", text: content }],
        },
      ],
      triggerType: "webhook_event",
      actor: {
        userId: webhook.createdBy,
        organizationId: webhook.organizationId,
      },
      webhookPayload: {
        source: webhook.source as "github" | "telegram" | "slack" | "custom",
        event: webhook.eventName,
        data: payload,
      },
    });
    // The durable workflow store inserts this row during start(). Keep the
    // ownership registration idempotent, matching the authenticated chat and
    // scheduler paths, so a webhook cannot fail after creating a run.
    await db
      .insert(workflowRun)
      .values({
        id: run.runId,
        chatId: webhook.chatId,
        userId: webhook.createdBy,
        organizationId: webhook.organizationId,
      })
      .onConflictDoNothing();
    await db
      .update(workflowWebhookDelivery)
      .set({ runId: run.runId, status: "accepted", receivedAt: now })
      .where(eq(workflowWebhookDelivery.id, delivery.id));
    await db
      .update(workflowWebhook)
      .set({
        lastTriggeredAt: now,
        lastDeliveryStatus: "accepted",
        updatedAt: now,
      })
      .where(eq(workflowWebhook.id, webhook.id));
    void workflowRunService.run(run.runId).catch((error: unknown) => {
      console.error("[Webhook Workflow Error]", { runId: run.runId, error });
    });
    return c.json(
      {
        accepted: true,
        duplicate: false,
        deliveryId: delivery.id,
        runId: run.runId,
      },
      202,
    );
  } catch (error) {
    const messageText =
      error instanceof Error
        ? error.message
        : "Webhook workflow could not start";
    await db
      .update(workflowWebhookDelivery)
      .set({ status: "failed", error: messageText, receivedAt: now })
      .where(eq(workflowWebhookDelivery.id, delivery.id));
    await db
      .update(workflowWebhook)
      .set({
        lastTriggeredAt: now,
        lastDeliveryStatus: "failed",
        updatedAt: now,
      })
      .where(eq(workflowWebhook.id, webhook.id));
    throw error;
  }
});

export default router;
