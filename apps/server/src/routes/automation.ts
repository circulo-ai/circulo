import { db, workflowRun } from "@/db";
import { chatMemberRepo, chatRepo } from "@/db/repositories";
import {
	agent,
	chatAgent,
	chatMember,
	humanApproval,
	mcpIntegration,
	mcpIntegrationLink,
	mcpTool,
	scheduledTask,
	taskHandoff,
} from "@/db/schema";
import { createRouter } from "@/lib/create-app";
import { validateMcpEndpoint } from "@/lib/mcp/endpoint";
import { McpClient } from "@/lib/mcp/client";
import { getUserRole, isMemberOf } from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import { calculateNextRun, validateSchedule } from "@/services/scheduling";
import { workflowRunService } from "@/workflows/runtime/workflow-run-service";
import {
	BadRequestError,
	ForbiddenError,
	NotFoundError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";

const router = createRouter();
const idParams = z.object({ id: z.uuid() });
function nextRunAt(
	scheduleType: "once" | "interval" | "cron",
	schedule: string,
	timezone: string,
) {
	try {
		validateSchedule({ scheduleType, schedule, timezone });
		if (scheduleType === "once") return new Date(schedule);
		return calculateNextRun({ scheduleType, schedule, timezone }, new Date());
	} catch (error) {
		throw new BadRequestError(
			error instanceof Error ? error.message : "Invalid schedule",
		);
	}
}

async function requireOrganization(userId: string, organizationId: string) {
	if (!(await isMemberOf(userId, organizationId)))
		throw new ForbiddenError("You don't have access to this organization");
}

function requireActiveOrganization(
	c: { get: (key: "activeOrgId") => string | undefined },
	organizationId: string,
) {
	const activeOrganizationId = c.get("activeOrgId");
	if (!activeOrganizationId)
		throw new BadRequestError("No active organization");
	if (activeOrganizationId !== organizationId) {
		throw new ForbiddenError(
			"The request organization must be the active organization",
		);
	}
}

async function requireWorkspaceManager(userId: string, organizationId: string) {
	await requireOrganization(userId, organizationId);
	const role = await getUserRole(userId, organizationId);
	if (!role || !["owner", "admin"].includes(role)) {
		throw new ForbiddenError("Only workspace managers can access this data");
	}
	return role;
}

function activeChatIdsForUser(userId: string) {
	return db
		.select({ chatId: chatMember.chatId })
		.from(chatMember)
		.where(and(eq(chatMember.userId, userId), isNull(chatMember.leftAt)));
}

async function requireChatMember(userId: string, chatId: string) {
	const chat = await chatRepo.findById(chatId);
	if (!chat || chat.isDeleted) throw new NotFoundError("Chat not found");
	if (!(await chatMemberRepo.isMember(userId, chatId)))
		throw new ForbiddenError("You are not a member of this chat");
	return chat;
}

const taskSchema = z.object({
	organizationId: z.string().min(1),
	chatId: z.uuid(),
	name: z.string().trim().min(1).max(200),
	prompt: z.string().trim().min(1).max(20000),
	scheduleType: z.enum(["once", "interval", "cron"]),
	schedule: z.string().trim().min(1),
	timezone: z.string().trim().min(1).max(100).default("UTC"),
	metadata: z.record(z.string(), z.unknown()).optional(),
});
const taskUpdateSchema = taskSchema
	.partial()
	.omit({ organizationId: true })
	.extend({ status: z.enum(["active", "paused"]).optional() });

router.get("/automation/tasks", requireAuth, async (c) => {
	const organizationId = c.get("activeOrgId");
	if (!organizationId) throw new BadRequestError("No active organization");
	await requireOrganization(c.var.user!.id, organizationId);
	const role = await getUserRole(c.var.user!.id, organizationId);
	const isManager = ["owner", "admin"].includes(role ?? "");
	const tasks = await db.query.scheduledTask.findMany({
		where: isManager
			? eq(scheduledTask.organizationId, organizationId)
			: and(
					eq(scheduledTask.organizationId, organizationId),
					eq(scheduledTask.createdBy, c.var.user!.id),
					inArray(scheduledTask.chatId, activeChatIdsForUser(c.var.user!.id)),
				),
		orderBy: desc(scheduledTask.createdAt),
	});
	return c.json(tasks);
});

router.post(
	"/automation/tasks",
	requireAuth,
	zValidator("json", taskSchema),
	async (c) => {
		const body = c.req.valid("json");
		const userId = c.var.user!.id;
		requireActiveOrganization(c, body.organizationId);
		await requireOrganization(userId, body.organizationId);
		if (body.chatId) {
			const chat = await requireChatMember(userId, body.chatId);
			if (chat.organizationId !== body.organizationId)
				throw new ForbiddenError("Chat belongs to another organization");
		}
		const next = nextRunAt(body.scheduleType, body.schedule, body.timezone);
		const [created] = await db
			.insert(scheduledTask)
			.values({
				...body,
				createdBy: userId,
				nextRunAt: next,
				metadata: body.metadata ?? {},
			})
			.returning();
		return c.json(created, 201);
	},
);

router.patch(
	"/automation/tasks/:id",
	requireAuth,
	zValidator("param", idParams),
	zValidator("json", taskUpdateSchema),
	async (c) => {
		const { id } = c.req.valid("param");
		const body = c.req.valid("json");
		const current = await db.query.scheduledTask.findFirst({
			where: eq(scheduledTask.id, id),
		});
		if (!current) throw new NotFoundError("Scheduled task not found");
		requireActiveOrganization(c, current.organizationId);
		await requireOrganization(c.var.user!.id, current.organizationId);
		const role = await getUserRole(c.var.user!.id, current.organizationId);
		const isOrganizationManager = ["owner", "admin"].includes(role ?? "");
		if (current.createdBy !== c.var.user!.id && !isOrganizationManager)
			throw new ForbiddenError("You don't have permission to update this task");

		// A task can target a chat, so every update must re-check chat access. This
		// prevents a creator who later leaves a chat from continuing to mutate a
		// chat-scoped automation, and prevents retargeting a task across chats
		// without the target chat manager's permission.
		const targetChatId = body.chatId ?? current.chatId;
		if (targetChatId) {
			const targetChat = await requireChatMember(c.var.user!.id, targetChatId);
			if (targetChat.organizationId !== current.organizationId)
				throw new ForbiddenError("Chat belongs to another organization");
			if (targetChat.creatorId !== c.var.user!.id && !isOrganizationManager)
				throw new ForbiddenError("Only chat managers can update chat tasks");
		}
		const scheduleType = body.scheduleType ?? current.scheduleType;
		const schedule = body.schedule ?? current.schedule;
		const timezone = body.timezone ?? current.timezone;
		const status = body.status ?? current.status;
		if (status === "active" && !current.chatId && !body.chatId) {
			throw new BadRequestError(
				"A scheduled task needs an active chat before it can resume",
			);
		}
		const [updated] = await db
			.update(scheduledTask)
			.set({
				...body,
				status,
				scheduleType,
				schedule,
				timezone,
				nextRunAt:
					status === "paused"
						? current.nextRunAt
						: nextRunAt(scheduleType, schedule, timezone),
				updatedAt: new Date(),
			})
			.where(eq(scheduledTask.id, id))
			.returning();
		return c.json(updated);
	},
);

router.delete(
	"/automation/tasks/:id",
	requireAuth,
	zValidator("param", idParams),
	async (c) => {
		const { id } = c.req.valid("param");
		const current = await db.query.scheduledTask.findFirst({
			where: eq(scheduledTask.id, id),
		});
		if (!current) throw new NotFoundError("Scheduled task not found");
		requireActiveOrganization(c, current.organizationId);
		await requireOrganization(c.var.user!.id, current.organizationId);
		if (
			current.createdBy !== c.var.user!.id &&
			!["owner", "admin"].includes(
				(await getUserRole(c.var.user!.id, current.organizationId)) ?? "",
			)
		)
			throw new ForbiddenError("You don't have permission to delete this task");
		await db.delete(scheduledTask).where(eq(scheduledTask.id, id));
		return c.json({ deleted: true });
	},
);

const handoffSchema = z
	.object({
		organizationId: z.string().min(1),
		chatId: z.uuid(),
		fromAgentId: z.uuid().nullable().optional(),
		toAgentId: z.uuid().nullable().optional(),
		toUserId: z.string().nullable().optional(),
		task: z.string().trim().min(1).max(20000),
		context: z.record(z.string(), z.unknown()).optional(),
	})
	.refine(
		(value) => Boolean(value.toAgentId) !== Boolean(value.toUserId),
		"Choose exactly one target agent or user",
	);

router.get("/automation/handoffs", requireAuth, async (c) => {
	const organizationId = c.get("activeOrgId");
	if (!organizationId) throw new BadRequestError("No active organization");
	await requireOrganization(c.var.user!.id, organizationId);
	const role = await getUserRole(c.var.user!.id, organizationId);
	const isManager = ["owner", "admin"].includes(role ?? "");
	const rows = await db.query.taskHandoff.findMany({
		where: isManager
			? eq(taskHandoff.organizationId, organizationId)
			: and(
					eq(taskHandoff.organizationId, organizationId),
					inArray(taskHandoff.chatId, activeChatIdsForUser(c.var.user!.id)),
				),
		orderBy: desc(taskHandoff.createdAt),
	});
	return c.json(rows);
});

router.post(
	"/automation/handoffs",
	requireAuth,
	zValidator("json", handoffSchema),
	async (c) => {
		const body = c.req.valid("json");
		requireActiveOrganization(c, body.organizationId);
		const chat = await requireChatMember(c.var.user!.id, body.chatId);
		if (chat.organizationId !== body.organizationId)
			throw new ForbiddenError("Chat belongs to another organization");
		if (
			body.toUserId &&
			!(await chatMemberRepo.isMember(body.toUserId, body.chatId))
		)
			throw new ForbiddenError("The target user is not a member of this chat");
		if (body.fromAgentId && body.fromAgentId === body.toAgentId)
			throw new BadRequestError("An agent cannot hand off a task to itself");
		for (const agentId of [body.fromAgentId, body.toAgentId]) {
			if (!agentId) continue;
			const linkedAgent = await db.query.chatAgent.findFirst({
				where: and(
					eq(chatAgent.chatId, body.chatId),
					eq(chatAgent.agentId, agentId),
					eq(chatAgent.isEnabled, true),
				),
				with: { agent: true },
			});
			if (
				!linkedAgent ||
				linkedAgent.agent.organizationId !== body.organizationId
			)
				throw new ForbiddenError(
					"The handoff agent is not enabled for this chat",
				);
		}
		const [created] = await db
			.insert(taskHandoff)
			.values({
				...body,
				createdBy: c.var.user!.id,
				context: body.context ?? {},
			})
			.returning();
		return c.json(created, 201);
	},
);

router.patch(
	"/automation/handoffs/:id",
	requireAuth,
	zValidator("param", idParams),
	zValidator(
		"json",
		z.object({
			status: z.enum(["accepted", "completed", "rejected", "cancelled"]),
			completionNote: z.string().trim().max(20000).optional(),
		}),
	),
	async (c) => {
		const { id } = c.req.valid("param");
		const body = c.req.valid("json");
		const { status } = body;
		const current = await db.query.taskHandoff.findFirst({
			where: eq(taskHandoff.id, id),
		});
		if (!current) throw new NotFoundError("Task handoff not found");
		const chat = await requireChatMember(c.var.user!.id, current.chatId);
		requireActiveOrganization(c, chat.organizationId);
		const role = await getUserRole(c.var.user!.id, chat.organizationId);
		const isTarget = current.toUserId === c.var.user!.id;
		if (!isTarget && !["owner", "admin"].includes(role ?? ""))
			throw new ForbiddenError("You cannot update this handoff");

		const allowedTransitions: Record<string, string[]> = {
			pending: ["accepted", "rejected", "cancelled"],
			accepted: ["completed", "rejected", "cancelled"],
			completed: [],
			rejected: [],
			cancelled: [],
		};
		if (!allowedTransitions[current.status]?.includes(status)) {
			throw new BadRequestError(
				`Cannot change a ${current.status} handoff to ${status}`,
			);
		}
		if (status !== "completed" && body.completionNote) {
			throw new BadRequestError(
				"A completion note can only be provided when completing a handoff",
			);
		}

		const now = new Date();
		const [updated] = await db
			.update(taskHandoff)
			.set({
				status,
				context:
					body.completionNote === undefined
						? current.context
						: { ...current.context, completionNote: body.completionNote },
				acceptedAt:
					status === "accepted"
						? (current.acceptedAt ?? now)
						: current.acceptedAt,
				completedAt: ["completed", "rejected", "cancelled"].includes(status)
					? now
					: current.completedAt,
			})
			.where(eq(taskHandoff.id, id))
			.returning();
		const workflowRunId = updated?.context?.workflowRunId;
		if (
			typeof workflowRunId === "string" &&
			["completed", "rejected", "cancelled"].includes(status)
		) {
			await workflowRunService.resume(workflowRunId);
		}
		return c.json(updated);
	},
);

const approvalSchema = z.object({
	organizationId: z.string().min(1),
	chatId: z.uuid(),
	workflowRunId: z.string().optional(),
	title: z.string().trim().min(1).max(200),
	description: z.string().trim().min(1).max(10000),
	requestedAction: z.record(z.string(), z.unknown()),
	approverUserId: z.string().optional(),
	expiresAt: z.coerce.date().optional(),
});

router.get("/automation/approvals", requireAuth, async (c) => {
	const organizationId = c.get("activeOrgId");
	if (!organizationId) throw new BadRequestError("No active organization");
	await requireOrganization(c.var.user!.id, organizationId);
	const role = await getUserRole(c.var.user!.id, organizationId);
	const isManager = ["owner", "admin"].includes(role ?? "");
	const expired = await db
		.update(humanApproval)
		.set({ status: "expired", decidedAt: new Date() })
		.where(
			and(
				eq(humanApproval.organizationId, organizationId),
				eq(humanApproval.status, "pending"),
				lte(humanApproval.expiresAt, new Date()),
			),
		)
		.returning({ workflowRunId: humanApproval.workflowRunId });
	await Promise.all(
		expired
			.map((approval) => approval.workflowRunId)
			.filter((workflowRunId): workflowRunId is string =>
				Boolean(workflowRunId),
			)
			.map((workflowRunId) => workflowRunService.resume(workflowRunId)),
	);
	return c.json(
		await db.query.humanApproval.findMany({
			where: isManager
				? and(
						eq(humanApproval.organizationId, organizationId),
						eq(humanApproval.status, "pending"),
					)
				: and(
						eq(humanApproval.organizationId, organizationId),
						eq(humanApproval.status, "pending"),
						inArray(humanApproval.chatId, activeChatIdsForUser(c.var.user!.id)),
					),
			orderBy: desc(humanApproval.createdAt),
		}),
	);
});

router.post(
	"/automation/approvals",
	requireAuth,
	zValidator("json", approvalSchema),
	async (c) => {
		const body = c.req.valid("json");
		requireActiveOrganization(c, body.organizationId);
		const chat = await requireChatMember(c.var.user!.id, body.chatId);
		if (chat.organizationId !== body.organizationId)
			throw new ForbiddenError("Chat belongs to another organization");
		if (body.workflowRunId) {
			const run = await db.query.workflowRun.findFirst({
				where: eq(workflowRun.id, body.workflowRunId),
			});
			if (
				!run ||
				run.chatId !== body.chatId ||
				run.organizationId !== body.organizationId
			) {
				throw new BadRequestError(
					"The approval workflow run does not belong to this chat",
				);
			}
		}
		if (body.approverUserId) {
			const approver = await chatMemberRepo.findByUserAndChat(
				body.approverUserId,
				body.chatId,
			);
			if (!approver) {
				throw new BadRequestError(
					"The approval assignee must be an active member of this chat",
				);
			}
		}
		if (body.expiresAt && body.expiresAt.getTime() <= Date.now()) {
			throw new BadRequestError("Approval expiry must be in the future");
		}
		const [created] = await db
			.insert(humanApproval)
			.values({ ...body, requestedBy: c.var.user!.id })
			.returning();
		return c.json(created, 201);
	},
);

router.patch(
	"/automation/approvals/:id",
	requireAuth,
	zValidator("param", idParams),
	zValidator(
		"json",
		z.object({
			status: z.enum(["approved", "rejected", "cancelled"]),
			decisionNote: z.string().max(5000).optional(),
		}),
	),
	async (c) => {
		const { id } = c.req.valid("param");
		const body = c.req.valid("json");
		const current = await db.query.humanApproval.findFirst({
			where: eq(humanApproval.id, id),
		});
		if (!current || current.status !== "pending")
			throw new NotFoundError("Pending approval not found");
		requireActiveOrganization(c, current.organizationId);
		if (current.expiresAt && current.expiresAt.getTime() <= Date.now()) {
			await db
				.update(humanApproval)
				.set({ status: "expired", decidedAt: new Date() })
				.where(
					and(eq(humanApproval.id, id), eq(humanApproval.status, "pending")),
				);
			throw new BadRequestError("This approval request has expired");
		}
		const chat = await requireChatMember(c.var.user!.id, current.chatId);
		const member = await chatMemberRepo.findByUserAndChat(
			c.var.user!.id,
			current.chatId,
		);
		const role = await getUserRole(c.var.user!.id, chat.organizationId);
		if (current.approverUserId && current.approverUserId !== c.var.user!.id)
			throw new ForbiddenError("This approval is assigned to another user");
		if (
			!member ||
			(!["owner", "admin"].includes(member.role) &&
				!["owner", "admin"].includes(role ?? ""))
		)
			throw new ForbiddenError(
				"Only chat or workspace managers can decide approvals",
			);
		const [updated] = await db
			.update(humanApproval)
			.set({ ...body, approverUserId: c.var.user!.id, decidedAt: new Date() })
			.where(and(eq(humanApproval.id, id), eq(humanApproval.status, "pending")))
			.returning();
		if (updated?.workflowRunId) {
			await workflowRunService.resume(updated.workflowRunId);
		}
		return c.json(updated);
	},
);

const integrationSchema = z.object({
	organizationId: z.string().min(1),
	name: z.string().trim().min(1).max(200),
	description: z.string().max(2000).nullable().optional(),
	transport: z.enum(["sse", "streamable_http"]),
	endpoint: z.url(),
	credentialRef: z
		.string()
		.trim()
		.regex(
			/^MCP_CREDENTIAL_[A-Z0-9_]+$/,
			"Credential references must use the MCP_CREDENTIAL_* environment variable namespace",
		)
		.nullable()
		.optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});
const linkSchema = z
	.object({
		scope: z.enum(["organization", "chat", "agent"]),
		chatId: z.uuid().nullable().optional(),
		agentId: z.uuid().nullable().optional(),
		allowedTools: z.array(z.string().max(200)).default([]),
	})
	.superRefine((value, ctx) => {
		if (value.scope === "chat" && !value.chatId)
			ctx.addIssue({
				code: "custom",
				message: "chatId is required for chat scope",
				path: ["chatId"],
			});
		if (value.scope === "agent" && !value.agentId)
			ctx.addIssue({
				code: "custom",
				message: "agentId is required for agent scope",
				path: ["agentId"],
			});
	});

router.get("/automation/mcp", requireAuth, async (c) => {
	const organizationId = c.get("activeOrgId");
	if (!organizationId) throw new BadRequestError("No active organization");
	await requireWorkspaceManager(c.var.user!.id, organizationId);
	return c.json(
		await db.query.mcpIntegration.findMany({
			where: eq(mcpIntegration.organizationId, organizationId),
			with: { links: true, tools: true },
			orderBy: desc(mcpIntegration.createdAt),
		}),
	);
});

router.post(
	"/automation/mcp",
	requireAuth,
	zValidator("json", integrationSchema),
	async (c) => {
		const body = c.req.valid("json");
		requireActiveOrganization(c, body.organizationId);
		await requireOrganization(c.var.user!.id, body.organizationId);
		const role = await getUserRole(c.var.user!.id, body.organizationId);
		if (!role || !["owner", "admin"].includes(role))
			throw new ForbiddenError(
				"Only workspace managers can manage MCP integrations",
			);
		let endpoint: string;
		try {
			endpoint = await validateMcpEndpoint(body.endpoint);
		} catch (error) {
			throw new BadRequestError(
				error instanceof Error ? error.message : "Invalid MCP endpoint",
			);
		}
		const [created] = await db
			.insert(mcpIntegration)
			.values({
				...body,
				createdBy: c.var.user!.id,
				endpoint,
				metadata: body.metadata ?? {},
			})
			.returning();
		return c.json(created, 201);
	},
);

router.post(
	"/automation/mcp/:id/test",
	requireAuth,
	zValidator("param", idParams),
	async (c) => {
		const { id } = c.req.valid("param");
		const current = await db.query.mcpIntegration.findFirst({
			where: eq(mcpIntegration.id, id),
		});
		if (!current) throw new NotFoundError("MCP integration not found");
		requireActiveOrganization(c, current.organizationId);
		await requireWorkspaceManager(c.var.user!.id, current.organizationId);
		try {
			const tools = await new McpClient(current).listTools();
			return c.json({
				ok: true,
				toolCount: tools.length,
				tools: tools.map((tool) => tool.name),
			});
		} catch (error) {
			throw new BadRequestError(
				error instanceof Error
					? `MCP connection failed: ${error.message}`
					: "MCP connection failed",
			);
		}
	},
);

const mcpToolParams = z.object({ id: z.uuid(), toolId: z.uuid() });
const mcpToolUpdateSchema = z.object({
	enabled: z.boolean().optional(),
	approvalMode: z.enum(["auto", "prompt", "writes", "approve"]).optional(),
});

router.post(
	"/automation/mcp/:id/scan",
	requireAuth,
	zValidator("param", idParams),
	async (c) => {
		const { id } = c.req.valid("param");
		const current = await db.query.mcpIntegration.findFirst({
			where: eq(mcpIntegration.id, id),
		});
		if (!current) throw new NotFoundError("MCP integration not found");
		requireActiveOrganization(c, current.organizationId);
		await requireWorkspaceManager(c.var.user!.id, current.organizationId);
		try {
			const remoteTools = await new McpClient(current).listTools();
			await db.transaction(async (tx) => {
				for (const tool of remoteTools) {
					await tx
						.insert(mcpTool)
						.values({
							integrationId: current.id,
							name: tool.name,
							title: tool.title ?? null,
							description: tool.description ?? null,
							inputSchema: tool.inputSchema ?? {
								type: "object",
								additionalProperties: true,
							},
							readOnlyHint:
								tool.readOnlyHint ?? tool.annotations?.readOnlyHint ?? null,
						})
						.onConflictDoUpdate({
							target: [mcpTool.integrationId, mcpTool.name],
							set: {
								title: tool.title ?? null,
								description: tool.description ?? null,
								inputSchema: tool.inputSchema ?? {
									type: "object",
									additionalProperties: true,
								},
								readOnlyHint:
									tool.readOnlyHint ?? tool.annotations?.readOnlyHint ?? null,
								updatedAt: new Date(),
							},
						});
				}
				await tx
					.update(mcpIntegration)
					.set({
						lastScannedAt: new Date(),
						lastScanError: null,
						updatedAt: new Date(),
					})
					.where(eq(mcpIntegration.id, id));
			});
			return c.json({ ok: true, toolCount: remoteTools.length });
		} catch (error) {
			await db
				.update(mcpIntegration)
				.set({
					lastScanError:
						error instanceof Error ? error.message : "MCP scan failed",
					updatedAt: new Date(),
				})
				.where(eq(mcpIntegration.id, id));
			throw new BadRequestError(
				error instanceof Error
					? `MCP scan failed: ${error.message}`
					: "MCP scan failed",
			);
		}
	},
);

router.patch(
	"/automation/mcp/:id/tools/:toolId",
	requireAuth,
	zValidator("param", mcpToolParams),
	zValidator("json", mcpToolUpdateSchema),
	async (c) => {
		const { id, toolId } = c.req.valid("param");
		const current = await db.query.mcpIntegration.findFirst({
			where: eq(mcpIntegration.id, id),
		});
		if (!current) throw new NotFoundError("MCP integration not found");
		requireActiveOrganization(c, current.organizationId);
		await requireWorkspaceManager(c.var.user!.id, current.organizationId);
		const [updated] = await db
			.update(mcpTool)
			.set({ ...c.req.valid("json"), updatedAt: new Date() })
			.where(and(eq(mcpTool.id, toolId), eq(mcpTool.integrationId, id)))
			.returning();
		if (!updated) throw new NotFoundError("MCP tool not found");
		return c.json(updated);
	},
);

router.patch(
	"/automation/mcp/:id",
	requireAuth,
	zValidator("param", idParams),
	zValidator(
		"json",
		integrationSchema
			.partial()
			.omit({ organizationId: true })
			.extend({
				status: z.enum(["draft", "published", "disabled"]).optional(),
			}),
	),
	async (c) => {
		const { id } = c.req.valid("param");
		const body = c.req.valid("json");
		const current = await db.query.mcpIntegration.findFirst({
			where: eq(mcpIntegration.id, id),
		});
		if (!current) throw new NotFoundError("MCP integration not found");
		requireActiveOrganization(c, current.organizationId);
		await requireOrganization(c.var.user!.id, current.organizationId);
		const role = await getUserRole(c.var.user!.id, current.organizationId);
		if (!role || !["owner", "admin"].includes(role))
			throw new ForbiddenError(
				"Only workspace managers can manage MCP integrations",
			);
		if (body.status === "published" && !current.lastScannedAt) {
			throw new BadRequestError("Scan the MCP server before publishing it");
		}
		let endpoint: string | undefined;
		if (body.endpoint) {
			try {
				endpoint = await validateMcpEndpoint(body.endpoint);
			} catch (error) {
				throw new BadRequestError(
					error instanceof Error ? error.message : "Invalid MCP endpoint",
				);
			}
		}
		const endpointChanged = Boolean(body.endpoint || body.transport);
		const [updated] = await db
			.update(mcpIntegration)
			.set({
				...body,
				endpoint,
				...(endpointChanged
					? { status: "draft", lastScannedAt: null, lastScanError: null }
					: {}),
				updatedAt: new Date(),
			})
			.where(eq(mcpIntegration.id, id))
			.returning();
		return c.json(updated);
	},
);

router.delete(
	"/automation/mcp/:id",
	requireAuth,
	zValidator("param", idParams),
	async (c) => {
		const { id } = c.req.valid("param");
		const current = await db.query.mcpIntegration.findFirst({
			where: eq(mcpIntegration.id, id),
		});
		if (!current) throw new NotFoundError("MCP integration not found");
		requireActiveOrganization(c, current.organizationId);
		await requireOrganization(c.var.user!.id, current.organizationId);
		const role = await getUserRole(c.var.user!.id, current.organizationId);
		if (!role || !["owner", "admin"].includes(role))
			throw new ForbiddenError(
				"Only workspace managers can manage MCP integrations",
			);
		await db.delete(mcpIntegration).where(eq(mcpIntegration.id, id));
		return c.json({ deleted: true });
	},
);

router.post(
	"/automation/mcp/:id/links",
	requireAuth,
	zValidator("param", idParams),
	zValidator("json", linkSchema),
	async (c) => {
		const { id } = c.req.valid("param");
		const body = c.req.valid("json");
		const integration = await db.query.mcpIntegration.findFirst({
			where: eq(mcpIntegration.id, id),
		});
		if (!integration) throw new NotFoundError("MCP integration not found");
		requireActiveOrganization(c, integration.organizationId);
		await requireOrganization(c.var.user!.id, integration.organizationId);
		const role = await getUserRole(c.var.user!.id, integration.organizationId);
		if (!role || !["owner", "admin"].includes(role))
			throw new ForbiddenError(
				"Only workspace managers can link MCP integrations",
			);
		if (body.scope === "chat") {
			const chat = body.chatId ? await chatRepo.findById(body.chatId) : null;
			if (!chat || chat.organizationId !== integration.organizationId)
				throw new ForbiddenError("The target chat is not in this organization");
		}
		if (body.scope === "agent") {
			const targetAgent = body.agentId
				? await db.query.agent.findFirst({ where: eq(agent.id, body.agentId) })
				: null;
			if (
				!targetAgent ||
				targetAgent.organizationId !== integration.organizationId
			)
				throw new ForbiddenError(
					"The target agent is not in this organization",
				);
		}
		const [created] = await db
			.insert(mcpIntegrationLink)
			.values({
				integrationId: id,
				scope: body.scope,
				chatId: body.scope === "chat" ? body.chatId : null,
				agentId: body.scope === "agent" ? body.agentId : null,
				allowedTools: body.allowedTools,
			})
			.returning();
		return c.json(created, 201);
	},
);

router.delete(
	"/automation/mcp/links/:id",
	requireAuth,
	zValidator("param", idParams),
	async (c) => {
		const { id } = c.req.valid("param");
		const link = await db.query.mcpIntegrationLink.findFirst({
			where: eq(mcpIntegrationLink.id, id),
			with: { integration: true },
		});
		if (!link) throw new NotFoundError("MCP link not found");
		requireActiveOrganization(c, link.integration.organizationId);
		await requireOrganization(c.var.user!.id, link.integration.organizationId);
		const role = await getUserRole(
			c.var.user!.id,
			link.integration.organizationId,
		);
		if (!role || !["owner", "admin"].includes(role))
			throw new ForbiddenError(
				"Only workspace managers can unlink MCP integrations",
			);
		await db.delete(mcpIntegrationLink).where(eq(mcpIntegrationLink.id, id));
		return c.json({ deleted: true });
	},
);

export default router;
