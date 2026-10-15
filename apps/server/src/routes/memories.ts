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
  createMemoryEmbedding,
  writeMemoryWithEmbedding,
  type MemoryTransaction,
} from "@/lib/memory/retrieval";
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
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
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
  personalMemoryOwnerId?: string | null,
) {
  if (body.scope === "user") {
    if (body.chatId || body.agentId)
      throw new BadRequestError(
        "Personal memory cannot have a chat or agent target",
      );
    if (personalMemoryOwnerId !== undefined && personalMemoryOwnerId !== userId)
      throw new ForbiddenError("You can only access your personal memories");
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

async function refreshMemorySummaryWhenEnabled(
  organizationId: string,
  userId: string,
) {
  const preference = await getOrCreatePreference(organizationId, userId);
  if (preference?.automaticManagementEnabled) {
    await refreshMemorySummary(organizationId, userId);
  }
}

async function snapshotMemory(
  existing: typeof memory.$inferSelect,
  tx: MemoryTransaction,
) {
  await tx.insert(memoryHistory).values({
    memoryId: existing.id,
    organizationId: existing.organizationId,
    userId: existing.userId ?? existing.createdBy,
    key: existing.key,
    content: existing.content,
    metadata: existing.metadata,
    importance: existing.importance,
  });
}

function memoryResponse(row: typeof memory.$inferSelect | undefined) {
  if (!row) throw new Error("Memory operation did not return a record");
  const { embedding: _embedding, ...visibleMemory } = row;
  return visibleMemory;
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
    const changes = c.req.valid("json");
    await getOrCreatePreference(organizationId, c.var.user!.id);
    const [updated] = await db
      .update(memoryPreference)
      .set({ ...changes, updatedAt: new Date() })
      .where(
        and(
          eq(memoryPreference.organizationId, organizationId),
          eq(memoryPreference.userId, c.var.user!.id),
        ),
      )
      .returning();
    if (changes.automaticManagementEnabled === true) {
      const summary = await refreshMemorySummary(
        organizationId,
        c.var.user!.id,
      );
      return c.json({ ...updated, summary });
    }
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
  if (query.scope === "user")
    conditions.push(eq(memory.userId, c.var.user!.id));
  if (query.chatId) conditions.push(eq(memory.chatId, query.chatId));
  if (query.agentId) conditions.push(eq(memory.agentId, query.agentId));

  if (!query.scope && !query.chatId && !query.agentId) {
    const canReadWorkspaceMemory = await hasPermissionForUser(
      c.var.user!.id,
      organizationId,
      "memory",
      "read",
      c.var.apiKeyPermissions,
    );
    const canManageWorkspaceMemory = await hasPermissionForUser(
      c.var.user!.id,
      organizationId,
      "memory",
      "manage",
      c.var.apiKeyPermissions,
    );
    const [chatMemberships, manageableAgents] = await Promise.all([
      db
        .select({ chatId: chatMember.chatId })
        .from(chatMember)
        .innerJoin(chat, eq(chat.id, chatMember.chatId))
        .where(
          and(
            eq(chat.organizationId, organizationId),
            eq(chat.isDeleted, false),
            eq(chatMember.userId, c.var.user!.id),
            isNull(chatMember.leftAt),
            canReadWorkspaceMemory
              ? undefined
              : or(
                  eq(chatMember.role, "owner"),
                  eq(chatMember.role, "admin"),
                  eq(chatMember.canManageKnowledge, true),
                ),
          ),
        ),
      db
        .select({ id: agent.id })
        .from(agent)
        .where(
          and(
            eq(agent.organizationId, organizationId),
            eq(agent.isArchived, false),
            canManageWorkspaceMemory
              ? undefined
              : eq(agent.createdBy, c.var.user!.id),
          ),
        ),
    ]);
    const readableScopes = [
      and(eq(memory.scope, "user"), eq(memory.userId, c.var.user!.id)),
      ...(canReadWorkspaceMemory ? [eq(memory.scope, "organization")] : []),
      ...(chatMemberships.length
        ? [
            and(
              eq(memory.scope, "chat"),
              inArray(
                memory.chatId,
                chatMemberships.map((membership) => membership.chatId),
              ),
            ),
          ]
        : []),
      ...(manageableAgents.length
        ? [
            and(
              eq(memory.scope, "agent"),
              inArray(
                memory.agentId,
                manageableAgents.map((item) => item.id),
              ),
            ),
          ]
        : []),
    ];
    conditions.push(or(...readableScopes)!);
  }
  return c.json(
    (
      await db.query.memory.findMany({
        where: and(...conditions),
        orderBy: [desc(memory.isPinned), desc(memory.updatedAt)],
        limit: 200,
      })
    ).map(memoryResponse),
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
    const embedding = await createMemoryEmbedding({
      key: body.key,
      content: body.content,
      userId: c.var.user!.id,
      organizationId,
    });
    if (existing) {
      const { row: updated } = await writeMemoryWithEmbedding(
        organizationId,
        embedding,
        async (tx, embeddingFields) => {
          const snapshot = await tx.query.memory.findFirst({
            where: eq(memory.id, existing.id),
          });
          if (snapshot) await snapshotMemory(snapshot, tx);
          const [updated] = await tx
            .update(memory)
            .set({
              content: body.content,
              metadata: body.metadata ?? {},
              importance: body.importance ?? existing.importance,
              ...embeddingFields,
              updatedAt: new Date(),
            })
            .where(eq(memory.id, existing.id))
            .returning();
          return updated;
        },
      );
      if (body.scope === "user") {
        await refreshMemorySummaryWhenEnabled(organizationId, c.var.user!.id);
      }
      return c.json(memoryResponse(updated));
    }
    const { row: created } = await writeMemoryWithEmbedding(
      organizationId,
      embedding,
      async (tx, embeddingFields) => {
        const current = await tx.query.memory.findFirst({
          where: and(...conditions, eq(memory.key, body.key)),
        });
        if (current) {
          await snapshotMemory(current, tx);
          const [updated] = await tx
            .update(memory)
            .set({
              content: body.content,
              metadata: body.metadata ?? {},
              importance: body.importance ?? current.importance,
              ...embeddingFields,
              updatedAt: new Date(),
            })
            .where(eq(memory.id, current.id))
            .returning();
          return updated;
        }
        const [created] = await tx
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
            ...embeddingFields,
            sourceType: body.sourceType ?? "manual",
            sourceId: body.sourceId ?? null,
            userId: body.scope === "user" ? c.var.user!.id : null,
          })
          .returning();
        return created;
      },
    );
    if (body.scope === "user") {
      await refreshMemorySummaryWhenEnabled(organizationId, c.var.user!.id);
    }
    return c.json(memoryResponse(created), 201);
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
      existing.userId,
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
      existing.userId,
    );
    const history = await db.query.memoryHistory.findFirst({
      where: and(
        eq(memoryHistory.id, c.req.valid("json").historyId),
        eq(memoryHistory.memoryId, id),
        eq(memoryHistory.organizationId, organizationId),
      ),
    });
    if (!history) throw new NotFoundError("Memory history entry not found");
    const embedding = await createMemoryEmbedding({
      key: history.key,
      content: history.content,
      userId: c.var.user!.id,
      organizationId,
    });
    const { row: restored } = await writeMemoryWithEmbedding(
      organizationId,
      embedding,
      async (tx, embeddingFields) => {
        const snapshot = await tx.query.memory.findFirst({
          where: eq(memory.id, id),
        });
        if (snapshot) await snapshotMemory(snapshot, tx);
        const [restored] = await tx
          .update(memory)
          .set({
            key: history.key,
            content: history.content,
            metadata: history.metadata,
            importance: history.importance,
            ...embeddingFields,
            updatedAt: new Date(),
          })
          .where(eq(memory.id, id))
          .returning();
        return restored;
      },
    );
    if (existing.scope === "user") {
      await refreshMemorySummaryWhenEnabled(organizationId, c.var.user!.id);
    }
    return c.json(memoryResponse(restored));
  },
);

router.patch(
  "/memories/:id",
  requireAuth,
  zValidator("param", idParams),
  zValidator(
    "json",
    z
      .object({
        content: z.string().trim().min(1).max(20_000).optional(),
        importance: z.number().int().min(0).max(100).optional(),
        isPinned: z.boolean().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .refine((changes) => Object.keys(changes).length > 0, {
        message: "Provide at least one memory field to update",
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
      existing.userId,
    );
    const changes = c.req.valid("json");
    const nextContent = changes.content ?? existing.content;
    const contentChanged = nextContent !== existing.content;
    const embedding = contentChanged
      ? await createMemoryEmbedding({
          key: existing.key,
          content: nextContent,
          userId: c.var.user!.id,
          organizationId,
        })
      : undefined;
    const { row: updated } = await writeMemoryWithEmbedding(
      organizationId,
      embedding,
      async (tx, embeddingFields) => {
        if (
          contentChanged ||
          changes.importance !== undefined ||
          changes.metadata !== undefined
        ) {
          const snapshot = await tx.query.memory.findFirst({
            where: eq(memory.id, id),
          });
          if (snapshot) await snapshotMemory(snapshot, tx);
        }
        const [updated] = await tx
          .update(memory)
          .set({
            ...changes,
            ...embeddingFields,
            updatedAt: new Date(),
          })
          .where(eq(memory.id, id))
          .returning();
        return updated;
      },
    );
    if (existing.scope === "user") {
      await refreshMemorySummaryWhenEnabled(organizationId, c.var.user!.id);
    }
    return c.json(memoryResponse(updated));
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
      existing.userId,
    );
    await db.delete(memory).where(eq(memory.id, id));
    if (existing.scope === "user") {
      await refreshMemorySummaryWhenEnabled(organizationId, c.var.user!.id);
    }
    return c.json({ deleted: true });
  },
);

export default router;
