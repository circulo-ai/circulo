import { db } from "@/db";
import {
  agent,
  chat,
  chatMember,
  memory,
  memoryHistory,
  memoryPreference,
} from "@/db/schema";
import { createRouter } from "@/lib/create-app";
import {
  hasPermissionForUser,
  isMemberOf,
  type ApiKeyPermissions,
} from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/create-app";

const router = createRouter();
const idParams = z.object({ id: z.uuid() });
const scopeSchema = z.enum(["user", "organization", "chat", "agent"]);
const memoryBody = z.object({
  scope: scopeSchema,
  chatId: z.uuid().nullable().optional(),
  agentId: z.uuid().nullable().optional(),
  key: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20_000),
  importance: z.number().int().min(0).max(100).optional(),
  sourceType: z.string().trim().min(1).max(100).optional(),
  sourceId: z.string().trim().max(500).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function activeOrganization(c: Context<AppEnv>) {
  const organizationId = c.get("activeOrgId");
  if (!organizationId) throw new BadRequestError("No active organization");
  if (!(await isMemberOf(c.var.user!.id, organizationId))) {
    throw new ForbiddenError("You don't have access to this organization");
  }
  return organizationId;
}

async function requireOrganizationMemoryReadAccess(
  userId: string,
  organizationId: string,
  apiKeyPermissions?: ApiKeyPermissions,
) {
  if (
    !(await hasPermissionForUser(
      userId,
      organizationId,
      "memory",
      "read",
      apiKeyPermissions,
    ))
  ) {
    throw new ForbiddenError(
      "You need the workspace memory-read permission to read organization memory",
    );
  }
}

async function assertTargetAccess(
  userId: string,
  organizationId: string,
  body: z.infer<typeof memoryBody>,
  apiKeyPermissions?: ApiKeyPermissions,
) {
  if (body.scope === "user") {
    if (body.chatId || body.agentId)
      throw new BadRequestError(
        "Personal memory cannot have a chat or agent target",
      );
    return;
  }
  if (body.scope === "organization") {
    if (
      !(await hasPermissionForUser(
        userId,
        organizationId,
        "memory",
        "manage",
        apiKeyPermissions,
      ))
    ) {
      throw new ForbiddenError(
        "You need the workspace memory-management permission to change organization memory",
      );
    }
    if (body.chatId || body.agentId)
      throw new BadRequestError("Organization memory cannot have a target");
    return;
  }

  if (body.scope === "chat") {
    if (!body.chatId || body.agentId)
      throw new BadRequestError("Chat memory requires only chatId");
    const target = await db.query.chat.findFirst({
      where: and(
        eq(chat.id, body.chatId),
        eq(chat.organizationId, organizationId),
      ),
    });
    if (!target || target.isDeleted) throw new NotFoundError("Chat not found");
    const membership = await db.query.chatMember.findFirst({
      where: and(
        eq(chatMember.chatId, body.chatId),
        eq(chatMember.userId, userId),
        isNull(chatMember.leftAt),
      ),
    });
    if (
      !membership ||
      (membership.role !== "owner" &&
        membership.role !== "admin" &&
        !membership.canManageKnowledge)
    ) {
      throw new ForbiddenError("Only chat managers can manage chat memory");
    }
    return;
  }

  if (!body.agentId || body.chatId)
    throw new BadRequestError("Agent memory requires only agentId");
  const target = await db.query.agent.findFirst({
    where: and(
      eq(agent.id, body.agentId),
      eq(agent.organizationId, organizationId),
    ),
  });
  if (!target || target.isArchived) throw new NotFoundError("Agent not found");
  const canManageWorkspaceMemory = await hasPermissionForUser(
    userId,
    organizationId,
    "memory",
    "manage",
    apiKeyPermissions,
  );
  if (target.createdBy !== userId && !canManageWorkspaceMemory) {
    throw new ForbiddenError(
      "Only the agent owner or workspace managers can manage agent memory",
    );
  }
}

function targetConditions(
  organizationId: string,
  scope: z.infer<typeof scopeSchema>,
  chatId?: string | null,
  agentId?: string | null,
  userId?: string | null,
) {
  return [
    eq(memory.organizationId, organizationId),
    eq(memory.scope, scope),
    scope === "chat"
      ? eq(memory.chatId, chatId!)
      : scope === "agent"
        ? eq(memory.agentId, agentId!)
        : scope === "user"
          ? eq(memory.userId, userId!)
          : eq(memory.organizationId, organizationId),
  ];
}

async function getOrCreatePreference(organizationId: string, userId: string) {
  const existing = await db.query.memoryPreference.findFirst({
    where: and(
      eq(memoryPreference.organizationId, organizationId),
      eq(memoryPreference.userId, userId),
    ),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(memoryPreference)
    .values({ organizationId, userId })
    .onConflictDoNothing()
    .returning();
  return (
    created ??
    (await db.query.memoryPreference.findFirst({
      where: and(
        eq(memoryPreference.organizationId, organizationId),
        eq(memoryPreference.userId, userId),
      ),
    }))
  );
}

async function refreshMemorySummary(organizationId: string, userId: string) {
  const rows = await db.query.memory.findMany({
    where: and(
      eq(memory.organizationId, organizationId),
      eq(memory.scope, "user"),
      eq(memory.userId, userId),
    ),
    orderBy: desc(memory.importance),
    limit: 100,
  });
  const summary = rows.map((row) => `- ${row.key}: ${row.content}`).join("\n");
  await db
    .update(memoryPreference)
    .set({ summary: summary || null, updatedAt: new Date() })
    .where(
      and(
        eq(memoryPreference.organizationId, organizationId),
        eq(memoryPreference.userId, userId),
      ),
    );
  return summary;
}

async function snapshotMemory(existing: typeof memory.$inferSelect) {
  await db.insert(memoryHistory).values({
    memoryId: existing.id,
    organizationId: existing.organizationId,
    userId: existing.userId ?? existing.createdBy,
    key: existing.key,
    content: existing.content,
    metadata: existing.metadata,
    importance: existing.importance,
  });
}

router.get("/memories/preferences", requireAuth, async (c) => {
  const organizationId = await activeOrganization(c);
  return c.json(await getOrCreatePreference(organizationId, c.var.user!.id));
});

router.patch(
  "/memories/preferences",
  requireAuth,
  zValidator(
    "json",
    z.object({
      savedMemoryEnabled: z.boolean().optional(),
      chatHistoryEnabled: z.boolean().optional(),
      automaticManagementEnabled: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const organizationId = await activeOrganization(c);
    await getOrCreatePreference(organizationId, c.var.user!.id);
    const [updated] = await db
      .update(memoryPreference)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(
        and(
          eq(memoryPreference.organizationId, organizationId),
          eq(memoryPreference.userId, c.var.user!.id),
        ),
      )
      .returning();
    return c.json(updated);
  },
);

router.post("/memories/refresh", requireAuth, async (c) => {
  const organizationId = await activeOrganization(c);
  const preference = await getOrCreatePreference(
    organizationId,
    c.var.user!.id,
  );
  const summary = await refreshMemorySummary(organizationId, c.var.user!.id);
  return c.json({ ...preference, summary });
});

router.get("/memories", requireAuth, async (c) => {
  const organizationId = await activeOrganization(c);
  const query = z
    .object({
      scope: scopeSchema.optional(),
      chatId: z.uuid().optional(),
      agentId: z.uuid().optional(),
    })
    .parse(c.req.query());
  if (query.chatId) {
    if (query.scope && query.scope !== "chat") {
      throw new BadRequestError("chatId can only be used with chat scope");
    }
    await assertTargetAccess(
      c.var.user!.id,
      organizationId,
      {
        scope: "chat",
        chatId: query.chatId,
        key: "read",
        content: "read",
      },
      c.var.apiKeyPermissions,
    );
  }
  if (query.scope === "chat" && !query.chatId) {
    throw new BadRequestError("chatId is required for chat memory queries");
  }
  if (query.scope === "agent" && !query.agentId) {
    throw new BadRequestError("agentId is required for agent memory queries");
  }
  if (
    query.scope === "organization" ||
    (!query.scope && !query.chatId && !query.agentId)
  ) {
    if (query.scope === "organization") {
      await requireOrganizationMemoryReadAccess(
        c.var.user!.id,
        organizationId,
        c.var.apiKeyPermissions,
      );
    }
  }
  if (query.agentId) {
    if (query.scope && query.scope !== "agent") {
      throw new BadRequestError("agentId can only be used with agent scope");
    }
    await assertTargetAccess(
      c.var.user!.id,
      organizationId,
      {
        scope: "agent",
        agentId: query.agentId,
        key: "read",
        content: "read",
      },
      c.var.apiKeyPermissions,
    );
  }
  const conditions = [eq(memory.organizationId, organizationId)];
  if (query.scope) conditions.push(eq(memory.scope, query.scope));
  if (!query.scope && !query.chatId && !query.agentId) {
    conditions.push(
      eq(memory.scope, "user"),
      eq(memory.userId, c.var.user!.id),
    );
  }
  if (query.scope === "user")
    conditions.push(eq(memory.userId, c.var.user!.id));
  if (query.chatId) conditions.push(eq(memory.chatId, query.chatId));
  if (query.agentId) conditions.push(eq(memory.agentId, query.agentId));
  return c.json(
    await db.query.memory.findMany({
      where: and(...conditions),
      orderBy: desc(memory.updatedAt),
      limit: 200,
    }),
  );
});

router.post(
  "/memories",
  requireAuth,
  zValidator("json", memoryBody),
  async (c) => {
    const organizationId = await activeOrganization(c);
    const body = c.req.valid("json");
    await assertTargetAccess(
      c.var.user!.id,
      organizationId,
      body,
      c.var.apiKeyPermissions,
    );
    const conditions = targetConditions(
      organizationId,
      body.scope,
      body.chatId,
      body.agentId,
      body.scope === "user" ? c.var.user!.id : undefined,
    );
    const existing = await db.query.memory.findFirst({
      where: and(...conditions, eq(memory.key, body.key)),
    });
    if (existing) {
      await snapshotMemory(existing);
      const [updated] = await db
        .update(memory)
        .set({
          content: body.content,
          metadata: body.metadata ?? {},
          updatedAt: new Date(),
        })
        .where(eq(memory.id, existing.id))
        .returning();
      await refreshMemorySummary(organizationId, c.var.user!.id);
      return c.json(updated);
    }
    const [created] = await db
      .insert(memory)
      .values({
        organizationId,
        chatId: body.scope === "chat" ? body.chatId : null,
        agentId: body.scope === "agent" ? body.agentId : null,
        createdBy: c.var.user!.id,
        scope: body.scope,
        key: body.key,
        content: body.content,
        metadata: body.metadata ?? {},
        importance: body.importance ?? 50,
        sourceType: body.sourceType ?? "manual",
        sourceId: body.sourceId ?? null,
        userId: body.scope === "user" ? c.var.user!.id : null,
      })
      .returning();
    await refreshMemorySummary(organizationId, c.var.user!.id);
    return c.json(created, 201);
  },
);

router.get(
  "/memories/:id/history",
  requireAuth,
  zValidator("param", idParams),
  async (c) => {
    const organizationId = await activeOrganization(c);
    const { id } = c.req.valid("param");
    const existing = await db.query.memory.findFirst({
      where: eq(memory.id, id),
    });
    if (!existing || existing.organizationId !== organizationId)
      throw new NotFoundError("Memory not found");
    await assertTargetAccess(
      c.var.user!.id,
      organizationId,
      {
        scope: existing.scope,
        chatId: existing.chatId,
        agentId: existing.agentId,
        key: existing.key,
        content: existing.content,
      },
      c.var.apiKeyPermissions,
    );
    return c.json(
      await db.query.memoryHistory.findMany({
        where: and(
          eq(memoryHistory.memoryId, id),
          eq(memoryHistory.organizationId, organizationId),
        ),
        orderBy: desc(memoryHistory.createdAt),
        limit: 50,
      }),
    );
  },
);

router.post(
  "/memories/:id/restore",
  requireAuth,
  zValidator("param", idParams),
  zValidator("json", z.object({ historyId: z.uuid() })),
  async (c) => {
    const organizationId = await activeOrganization(c);
    const { id } = c.req.valid("param");
    const existing = await db.query.memory.findFirst({
      where: eq(memory.id, id),
    });
    if (!existing || existing.organizationId !== organizationId)
      throw new NotFoundError("Memory not found");
    await assertTargetAccess(
      c.var.user!.id,
      organizationId,
      {
        scope: existing.scope,
        chatId: existing.chatId,
        agentId: existing.agentId,
        key: existing.key,
        content: existing.content,
      },
      c.var.apiKeyPermissions,
    );
    const history = await db.query.memoryHistory.findFirst({
      where: and(
        eq(memoryHistory.id, c.req.valid("json").historyId),
        eq(memoryHistory.memoryId, id),
        eq(memoryHistory.organizationId, organizationId),
      ),
    });
    if (!history) throw new NotFoundError("Memory history entry not found");
    await snapshotMemory(existing);
    const [restored] = await db
      .update(memory)
      .set({
        key: history.key,
        content: history.content,
        metadata: history.metadata,
        importance: history.importance,
        updatedAt: new Date(),
      })
      .where(eq(memory.id, id))
      .returning();
    if (existing.scope === "user")
      await refreshMemorySummary(organizationId, c.var.user!.id);
    return c.json(restored);
  },
);

router.patch(
  "/memories/:id",
  requireAuth,
  zValidator("param", idParams),
  zValidator(
    "json",
    z.object({
      content: z.string().trim().min(1).max(20_000),
      importance: z.number().int().min(0).max(100).optional(),
      isPinned: z.boolean().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  async (c) => {
    const organizationId = await activeOrganization(c);
    const { id } = c.req.valid("param");
    const existing = await db.query.memory.findFirst({
      where: eq(memory.id, id),
    });
    if (!existing || existing.organizationId !== organizationId) {
      throw new NotFoundError("Memory not found");
    }
    await assertTargetAccess(
      c.var.user!.id,
      organizationId,
      {
        scope: existing.scope,
        chatId: existing.chatId,
        agentId: existing.agentId,
        key: existing.key,
        content: existing.content,
      },
      c.var.apiKeyPermissions,
    );
    await snapshotMemory(existing);
    const [updated] = await db
      .update(memory)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(memory.id, id))
      .returning();
    if (existing.scope === "user")
      await refreshMemorySummary(organizationId, c.var.user!.id);
    return c.json(updated);
  },
);

router.delete(
  "/memories/:id",
  requireAuth,
  zValidator("param", idParams),
  async (c) => {
    const organizationId = await activeOrganization(c);
    const { id } = c.req.valid("param");
    const existing = await db.query.memory.findFirst({
      where: eq(memory.id, id),
    });
    if (!existing || existing.organizationId !== organizationId) {
      throw new NotFoundError("Memory not found");
    }
    await assertTargetAccess(
      c.var.user!.id,
      organizationId,
      {
        scope: existing.scope,
        chatId: existing.chatId,
        agentId: existing.agentId,
        key: existing.key,
        content: existing.content,
      },
      c.var.apiKeyPermissions,
    );
    await db.delete(memory).where(eq(memory.id, id));
    if (existing.scope === "user")
      await refreshMemorySummary(organizationId, c.var.user!.id);
    return c.json({ deleted: true });
  },
);

export default router;
