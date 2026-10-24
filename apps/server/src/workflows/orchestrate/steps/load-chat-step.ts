import {
  chatMember,
  chat as chatTable,
  db,
  knowledgeBase,
  knowledgeDocument,
  mcpIntegration,
  memory,
  memoryPreference as memoryPreferenceTable,
  message,
  skill,
  user as userTable,
  type Agent,
  type Chat,
  type ChatAgent,
  type ChatMember,
  type Message,
} from "@/db";
import { chatMemberRepo, chatRepo, messageRepo } from "@/db/repositories";
import { agent as agentTable, chatAgent } from "@/db/schema";
import { getAgentExecutionSettings } from "@/lib/agent-execution-settings";
import {
  getKnowledgeAssetKey,
  isKnowledgeImageDocument,
  toKnowledgeImageDataUrl,
} from "@/lib/knowledge/assets";
import { createKnowledgeEmbeddingWithMetadata } from "@/lib/knowledge/embeddings";
import {
  knowledgeSemanticDistance,
  relevantKnowledgeContent,
} from "@/lib/knowledge/semantic-distance";
import { createLogger } from "@/lib/logs/console/logger";
import { retrieveMemories } from "@/lib/memory/retrieval";
import {
  hasPermissionForUser,
  type ApiKeyPermissions,
} from "@/lib/permissions";
import { ensureInitialSkillCatalog } from "@/lib/skills/initial-catalog";
import { storageManager } from "@/lib/storage/config";
import { ensureWorkspaceRoleCatalog } from "@/lib/workspace-role-catalog";
import type { AgentExecutionSettings } from "@circulo-ai/types";
import { and, asc, desc, eq, inArray, isNull, not, or, sql } from "drizzle-orm";

const logger = createLogger("LoadChatStep");

export interface ChatContext {
  chat: Chat;
  /** Start time captured with this workflow's immutable execution snapshot. */
  workflowStartedAt?: number;
  /** Immutable execution configuration captured when the logical run starts. */
  executionSettings?: AgentExecutionSettings;
  orchestrationAgent?: Agent | null;
  agents: Array<ChatAgent & { agent: Agent }>;
  messages: Message[];
  pastMessages: Array<
    Pick<Message, "role" | "parts" | "content"> & {
      chatId: string;
      chatTitle: string;
      authorName: string;
      createdAt: Date;
    }
  >;
  members: Array<
    ChatMember & { user: { id: string; name: string; email: string } }
  >;
  knowledgeDocuments: Array<{
    id: string;
    title: string;
    content: string;
    knowledgeBaseName: string;
    sourceKey: string | null;
    contentType: string;
    imageDataUrl?: string;
  }>;
  memories: Array<{
    scope: string;
    key: string;
    content: string;
  }>;
  memoryPolicy: {
    canReadUserMemory: boolean;
    canReadOrganizationMemory: boolean;
    canReadChatMemory: boolean;
    canWritePersonalMemory: boolean;
    automaticManagementEnabled: boolean;
    readableAgentIds: string[];
  };
  knowledgeBaseIds: string[];
  skills: Array<{
    id: string;
    name: string;
    description: string | null;
    instructions: string;
    version: string;
  }>;
}

export async function loadChatContextStep(
  chatId: string,
  userId: string,
  queryText?: string,
  apiKeyPermissions?: ApiKeyPermissions,
): Promise<ChatContext> {
  const chat = await chatRepo.findById(chatId);
  if (!chat) {
    throw new Error(`Chat ${chatId} not found`);
  }

  const messages = await messageRepo.findForChat(chatId, 100); // Last 100 messages

  await ensureInitialSkillCatalog(chat.organizationId, userId);
  await ensureWorkspaceRoleCatalog(chat.organizationId, userId);

  // Use the correct method to get ChatAgent objects with agent relations
  const chatAgents = await db.query.chatAgent.findMany({
    where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.isEnabled, true)),
    with: { agent: true },
  });

  const orchestrationAgent = chat.orchestrationAgentId
    ? await db.query.agent.findFirst({
        where: and(
          eq(agentTable.id, chat.orchestrationAgentId),
          eq(agentTable.organizationId, chat.organizationId),
          eq(agentTable.isArchived, false),
        ),
      })
    : null;

  const members = await chatMemberRepo.findForChat(chatId);

  const requestedKnowledgeBaseIds = [
    ...(chat.knowledgeBaseIds ?? []),
    ...chatAgents.flatMap((link) => link.agent.defaultKnowledgeBaseIds ?? []),
  ];
  const uniqueKnowledgeBaseIds = [...new Set(requestedKnowledgeBaseIds)];
  const activeKnowledgeBases = uniqueKnowledgeBaseIds.length
    ? await db
        .select({ id: knowledgeBase.id })
        .from(knowledgeBase)
        .where(
          and(
            eq(knowledgeBase.organizationId, chat.organizationId),
            eq(knowledgeBase.isArchived, false),
            inArray(knowledgeBase.id, uniqueKnowledgeBaseIds),
          ),
        )
    : [];
  const readableKnowledgeBaseIds = activeKnowledgeBases.map((base) => base.id);
  const queryEmbeddingResult = queryText?.trim()
    ? await createKnowledgeEmbeddingWithMetadata(queryText.trim(), "", {
        userId,
        organizationId: chat.organizationId,
        purpose: "query",
      }).catch(() => null)
    : null;
  const queryEmbedding = queryEmbeddingResult?.embedding ?? null;
  const lexicalKnowledgeMatch = queryText?.trim()
    ? sql`to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}) @@ plainto_tsquery('simple', ${queryText.trim()})`
    : null;
  const semanticDistance = queryEmbedding
    ? knowledgeSemanticDistance(queryEmbeddingResult)
    : null;
  const knowledgeDocuments = uniqueKnowledgeBaseIds.length
    ? await db.query.knowledgeDocument.findMany({
        where: and(
          eq(knowledgeDocument.organizationId, chat.organizationId),
          eq(knowledgeDocument.status, "ready"),
          inArray(knowledgeDocument.knowledgeBaseId, readableKnowledgeBaseIds),
          ...(queryText?.trim()
            ? [
                queryEmbedding
                  ? or(
                      sql`${knowledgeSemanticDistance(queryEmbeddingResult)} IS NOT NULL`,
                      lexicalKnowledgeMatch!,
                      sql`${knowledgeDocument.contentType} LIKE 'image/%'`,
                    )
                  : or(
                      lexicalKnowledgeMatch!,
                      sql`${knowledgeDocument.contentType} LIKE 'image/%'`,
                    ),
              ]
            : []),
        ),
        with: { knowledgeBase: true },
        orderBy: queryEmbedding
          ? [
              asc(
                sql`CASE WHEN ${knowledgeSemanticDistance(queryEmbeddingResult)} IS NULL THEN 1 ELSE 0 END`,
              ),
              asc(semanticDistance!),
              desc(
                sql`ts_rank(to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}), plainto_tsquery('simple', ${queryText!.trim()}))`,
              ),
            ]
          : desc(
              queryText?.trim()
                ? sql`ts_rank(to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}), plainto_tsquery('simple', ${queryText.trim()}))`
                : knowledgeDocument.updatedAt,
            ),
        limit: queryText?.trim() ? 20 : 100,
      })
    : [];
  const agentIds = chatAgents.map((link) => link.agentId);
  const canReadOrganizationMemory = await hasPermissionForUser(
    userId,
    chat.organizationId,
    "memory",
    "read",
    apiKeyPermissions,
  );
  const currentMember = members.find((member) => member.userId === userId);
  const canReadChatMemory = Boolean(
    currentMember &&
    (currentMember.role === "owner" ||
      currentMember.role === "admin" ||
      currentMember.canManageKnowledge ||
      canReadOrganizationMemory),
  );
  const readableAgentIds = agentIds;
  const userMemoryPreference = await db.query.memoryPreference.findFirst({
    where: and(
      eq(memoryPreferenceTable.organizationId, chat.organizationId),
      eq(memoryPreferenceTable.userId, userId),
    ),
  });
  const pastMessageRank = queryText?.trim()
    ? sql<number>`ts_rank(
        to_tsvector(
          'simple',
          coalesce(${message.content}, '') || ' ' || coalesce(${message.parts}::text, '')
        ),
        plainto_tsquery('simple', ${queryText.trim()})
      )`
    : null;
  const pastMessages =
    userMemoryPreference?.chatHistoryEnabled !== false && pastMessageRank
      ? await db
          .select({
            role: message.role,
            parts: message.parts,
            content: message.content,
            chatId: chatTable.id,
            chatTitle: chatTable.title,
            createdAt: message.createdAt,
            authorType: message.authorType,
            userName: userTable.name,
            agentName: agentTable.name,
          })
          .from(message)
          .innerJoin(chatTable, eq(chatTable.id, message.chatId))
          .innerJoin(chatMember, eq(chatMember.chatId, chatTable.id))
          .leftJoin(
            userTable,
            and(
              eq(message.authorType, "user"),
              eq(message.authorId, userTable.id),
            ),
          )
          .leftJoin(
            agentTable,
            and(
              eq(message.authorType, "agent"),
              sql`${agentTable.id}::text = ${message.authorId}`,
            ),
          )
          .where(
            and(
              eq(message.isDeleted, false),
              not(eq(message.chatId, chatId)),
              eq(chatTable.organizationId, chat.organizationId),
              eq(chatTable.isDeleted, false),
              eq(chatMember.userId, userId),
              isNull(chatMember.leftAt),
              sql`${pastMessageRank} > 0`,
            ),
          )
          .orderBy(desc(pastMessageRank), desc(message.createdAt))
          .limit(8)
          .then((rows) =>
            rows.map((row) => ({
              role: row.role,
              parts: row.parts,
              content: row.content,
              chatId: row.chatId,
              chatTitle: row.chatTitle,
              authorName:
                row.authorType === "agent"
                  ? (row.agentName ?? "Agent")
                  : row.authorType === "system"
                    ? "System"
                    : (row.userName ?? "Workspace member"),
              createdAt: row.createdAt,
            })),
          )
      : [];
  const memoryScopeConditions = [
    ...(userMemoryPreference?.savedMemoryEnabled !== false
      ? [and(eq(memory.scope, "user"), eq(memory.userId, userId))]
      : []),
    ...(canReadOrganizationMemory ? [eq(memory.scope, "organization")] : []),
    ...(canReadChatMemory
      ? [and(eq(memory.scope, "chat"), eq(memory.chatId, chatId))]
      : []),
    ...(readableAgentIds.length > 0
      ? [
          and(
            eq(memory.scope, "agent"),
            inArray(memory.agentId, readableAgentIds),
          ),
        ]
      : []),
  ];
  const memories = await retrieveMemories({
    organizationId: chat.organizationId,
    userId,
    scopes: memoryScopeConditions,
    query: queryText ?? "",
    limit: 12,
    queryEmbedding: queryEmbeddingResult,
  });
  const publishedMcpIntegrations = await db.query.mcpIntegration.findMany({
    where: and(
      eq(mcpIntegration.organizationId, chat.organizationId),
      eq(mcpIntegration.enabled, true),
      eq(mcpIntegration.status, "published"),
    ),
    columns: { id: true },
  });
  const publishedMcpIds = new Set(
    publishedMcpIntegrations.map((integration) => integration.id),
  );
  const skills = await db.query.skill.findMany({
    where: and(
      eq(skill.organizationId, chat.organizationId),
      eq(skill.enabled, true),
    ),
    with: { assignments: true },
  });
  const activeAgentIds = new Set(agentIds);
  const assignedSkills = skills.filter((item) => {
    if (
      item.sourceType === "mcp" &&
      (!item.mcpIntegrationId || !publishedMcpIds.has(item.mcpIntegrationId))
    ) {
      return false;
    }
    return item.assignments.some(
      (assignment) =>
        assignment.enabled &&
        (assignment.scope === "organization" ||
          (assignment.scope === "chat" && assignment.chatId === chatId) ||
          (assignment.scope === "agent" &&
            assignment.agentId &&
            activeAgentIds.has(assignment.agentId))),
    );
  });

  if (!chatAgents || chatAgents.length === 0) {
    logger.warn(`No active agents found in chat ${chatId}`);
  }

  const knowledgeDocumentsWithImages = await Promise.all(
    knowledgeDocuments.map(async (sourceDocument) => {
      const document = {
        ...sourceDocument,
        content: await relevantKnowledgeContent(
          sourceDocument,
          queryEmbeddingResult,
        ),
      };
      if (!isKnowledgeImageDocument(document)) return { document };
      const assetKey = getKnowledgeAssetKey(document.metadata);
      if (!assetKey) return { document };
      try {
        const buffer = await storageManager.download({
          context: "knowledge-base",
          key: assetKey,
        });
        const imageDataUrl = toKnowledgeImageDataUrl(
          buffer,
          document.contentType,
        );
        return { document, imageDataUrl: imageDataUrl ?? undefined };
      } catch {
        return { document };
      }
    }),
  );

  return {
    chat,
    executionSettings: await getAgentExecutionSettings(chat.organizationId),
    orchestrationAgent,
    agents: chatAgents,
    messages,
    pastMessages,
    members,
    knowledgeDocuments: knowledgeDocumentsWithImages.map(
      ({ document, imageDataUrl }) => ({
        id: document.id,
        title: document.title,
        content: document.content,
        knowledgeBaseName: document.knowledgeBase.name,
        sourceKey: document.sourceKey,
        contentType: document.contentType,
        imageDataUrl,
      }),
    ),
    memories: memories.map((item) => ({
      scope: item.scope,
      key: item.key,
      content: item.content,
    })),
    memoryPolicy: {
      canReadUserMemory: userMemoryPreference?.savedMemoryEnabled !== false,
      canReadOrganizationMemory,
      canReadChatMemory,
      canWritePersonalMemory:
        userMemoryPreference?.savedMemoryEnabled !== false,
      automaticManagementEnabled:
        userMemoryPreference?.automaticManagementEnabled !== false,
      readableAgentIds,
    },
    knowledgeBaseIds: readableKnowledgeBaseIds,
    skills: assignedSkills.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      instructions: item.instructions,
      version: item.version,
    })),
  };
}
