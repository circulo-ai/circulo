import {
	db,
	chatMember,
	knowledgeDocument,
	memory,
	memoryPreference as memoryPreferenceTable,
	message,
	mcpIntegration,
	skill,
	type Agent,
	type Chat,
	type ChatAgent,
	type ChatMember,
	type Message,
} from "@/db";
import { chatMemberRepo, chatRepo, messageRepo } from "@/db/repositories";
import { chatAgent } from "@/db/schema";
import { getUserRole } from "@/lib/permissions";
import { and, desc, eq, inArray, isNull, not, or, sql } from "drizzle-orm";

export interface ChatContext {
	chat: Chat;
	agents: Array<ChatAgent & { agent: Agent }>;
	messages: Message[];
	pastMessages: Message[];
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
	}>;
	memories: Array<{
		scope: string;
		key: string;
		content: string;
	}>;
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
): Promise<ChatContext> {
	const chat = await chatRepo.findById(chatId);
	if (!chat) {
		throw new Error(`Chat ${chatId} not found`);
	}

	const messages = await messageRepo.findForChat(chatId, 100); // Last 100 messages

	// Use the correct method to get ChatAgent objects with agent relations
	const chatAgents = await db.query.chatAgent.findMany({
		where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.isEnabled, true)),
		with: { agent: true },
	});

	const members = await chatMemberRepo.findForChat(chatId);

	const knowledgeBaseIds = [
		...(chat.knowledgeBaseIds ?? []),
		...chatAgents.flatMap((link) => link.agent.defaultKnowledgeBaseIds ?? []),
	];
	const uniqueKnowledgeBaseIds = [...new Set(knowledgeBaseIds)];
	const knowledgeDocuments = uniqueKnowledgeBaseIds.length
		? await db.query.knowledgeDocument.findMany({
				where: and(
					eq(knowledgeDocument.organizationId, chat.organizationId),
					eq(knowledgeDocument.status, "ready"),
					inArray(knowledgeDocument.knowledgeBaseId, uniqueKnowledgeBaseIds),
					...(queryText?.trim()
						? [
								sql`to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}) @@ plainto_tsquery('simple', ${queryText.trim()})`,
							]
						: []),
				),
				with: { knowledgeBase: true },
				orderBy: desc(
					queryText?.trim()
						? sql`ts_rank(to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}), plainto_tsquery('simple', ${queryText.trim()}))`
						: knowledgeDocument.updatedAt,
				),
				limit: queryText?.trim() ? 20 : 100,
			})
		: [];
	const agentIds = chatAgents.map((link) => link.agentId);
	const organizationRole = await getUserRole(userId, chat.organizationId);
	const canReadOrganizationMemory = ["owner", "admin"].includes(
		organizationRole ?? "",
	);
	const currentMember = members.find((member) => member.userId === userId);
	const canReadChatMemory = Boolean(
		currentMember &&
			(currentMember.role === "owner" ||
				currentMember.role === "admin" ||
				currentMember.canManageKnowledge),
	);
	const readableAgentIds = canReadOrganizationMemory
		? agentIds
		: chatAgents
				.filter((link) => link.agent.createdBy === userId)
				.map((link) => link.agentId);
	const userMemoryPreference = await db.query.memoryPreference.findFirst({
		where: and(
			eq(memoryPreferenceTable.organizationId, chat.organizationId),
			eq(memoryPreferenceTable.userId, userId),
		),
	});
	const pastMessages =
		userMemoryPreference?.chatHistoryEnabled === false
			? []
			: await db.query.message.findMany({
					where: and(
						not(eq(message.chatId, chatId)),
						inArray(
							message.chatId,
							db
								.select({ chatId: chatMember.chatId })
								.from(chatMember)
								.where(
									and(eq(chatMember.userId, userId), isNull(chatMember.leftAt)),
								),
						),
					),
					orderBy: desc(message.createdAt),
					limit: 30,
				});
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
	const memories =
		memoryScopeConditions.length === 0
			? []
			: await db.query.memory.findMany({
					where: and(
						eq(memory.organizationId, chat.organizationId),
						or(...memoryScopeConditions),
					),
					orderBy: desc(memory.updatedAt),
					limit: 200,
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
		console.warn(`No active agents found in chat ${chatId}`);
	}

	return {
		chat,
		agents: chatAgents,
		messages,
		pastMessages,
		members,
		knowledgeDocuments: knowledgeDocuments.map((document) => ({
			id: document.id,
			title: document.title,
			content: document.content,
			knowledgeBaseName: document.knowledgeBase.name,
			sourceKey: document.sourceKey,
			contentType: document.contentType,
		})),
		memories: memories.map((item) => ({
			scope: item.scope,
			key: item.key,
			content: item.content,
		})),
		skills: assignedSkills.map((item) => ({
			id: item.id,
			name: item.name,
			description: item.description,
			instructions: item.instructions,
			version: item.version,
		})),
	};
}
