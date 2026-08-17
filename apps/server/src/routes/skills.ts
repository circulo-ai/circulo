import { db } from "@/db";
import {
	agent,
	chat,
	mcpIntegration,
	skill,
	skillAssignment,
} from "@/db/schema";
import { createRouter } from "@/lib/create-app";
import { getUserRole, isMemberOf } from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import {
	BadRequestError,
	ForbiddenError,
	NotFoundError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

const router = createRouter();
const idParams = z.object({ id: z.uuid() });
const skillBody = z.object({
	name: z.string().trim().min(1).max(200),
	description: z.string().trim().max(1000).optional().nullable(),
	instructions: z.string().trim().min(1).max(50_000),
	sourceType: z.enum(["manual", "mcp"]).default("manual"),
	mcpIntegrationId: z.uuid().optional().nullable(),
	version: z.string().trim().min(1).max(50).default("1.0.0"),
	enabled: z.boolean().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});
const assignmentBody = z
	.object({
		scope: z.enum(["organization", "chat", "agent"]),
		chatId: z.uuid().optional(),
		agentId: z.uuid().optional(),
		enabled: z.boolean().optional(),
	})
	.superRefine((value, ctx) => {
		if (value.scope === "organization" && (value.chatId || value.agentId)) {
			ctx.addIssue({
				code: "custom",
				message: "Organization skills cannot target a chat or agent",
			});
		}
		if (value.scope === "chat" && !value.chatId) {
			ctx.addIssue({
				code: "custom",
				message: "Chat assignment requires chatId",
				path: ["chatId"],
			});
		}
		if (value.scope === "chat" && value.agentId) {
			ctx.addIssue({
				code: "custom",
				message: "Chat assignments cannot target an agent",
				path: ["agentId"],
			});
		}
		if (value.scope === "agent" && !value.agentId) {
			ctx.addIssue({
				code: "custom",
				message: "Agent assignment requires agentId",
				path: ["agentId"],
			});
		}
		if (value.scope === "agent" && value.chatId) {
			ctx.addIssue({
				code: "custom",
				message: "Agent assignments cannot target a chat",
				path: ["chatId"],
			});
		}
	});

async function requireManager(userId: string, organizationId: string) {
	if (!(await isMemberOf(userId, organizationId))) {
		throw new ForbiddenError("You don't have access to this organization");
	}
	const role = await getUserRole(userId, organizationId);
	if (!role || !["owner", "admin"].includes(role)) {
		throw new ForbiddenError("Only workspace managers can manage skills");
	}
}

async function requireSkill(id: string, organizationId: string) {
	const current = await db.query.skill.findFirst({
		where: and(eq(skill.id, id), eq(skill.organizationId, organizationId)),
		with: { assignments: true },
	});
	if (!current) throw new NotFoundError("Skill not found");
	return current;
}

async function validateMcpReference(
	organizationId: string,
	sourceType: "manual" | "mcp",
	mcpIntegrationId: string | null | undefined,
) {
	if (sourceType === "mcp" && !mcpIntegrationId) {
		throw new BadRequestError("MCP skills must reference an MCP integration");
	}
	if (sourceType === "manual" && mcpIntegrationId) {
		throw new BadRequestError(
			"Manual skills cannot reference an MCP integration",
		);
	}
	if (!mcpIntegrationId) return;

	const integration = await db.query.mcpIntegration.findFirst({
		where: and(
			eq(mcpIntegration.id, mcpIntegrationId),
			eq(mcpIntegration.organizationId, organizationId),
		),
	});
	if (!integration) {
		throw new BadRequestError(
			"The referenced MCP integration is not in this organization",
		);
	}
}

router.get("/skills", requireAuth, async (c) => {
	const organizationId = c.get("activeOrgId");
	if (!organizationId) throw new BadRequestError("No active organization");
	await requireManager(c.var.user!.id, organizationId);
	return c.json(
		await db.query.skill.findMany({
			where: eq(skill.organizationId, organizationId),
			with: { assignments: true },
			orderBy: desc(skill.updatedAt),
		}),
	);
});

router.post(
	"/skills",
	requireAuth,
	zValidator("json", skillBody),
	async (c) => {
		const organizationId = c.get("activeOrgId");
		if (!organizationId) throw new BadRequestError("No active organization");
		await requireManager(c.var.user!.id, organizationId);
		const body = c.req.valid("json");
		await validateMcpReference(
			organizationId,
			body.sourceType,
			body.mcpIntegrationId,
		);
		const [created] = await db
			.insert(skill)
			.values({
				...body,
				organizationId,
				createdBy: c.var.user!.id,
				metadata: body.metadata ?? {},
			})
			.returning();
		return c.json(created, 201);
	},
);

router.patch(
	"/skills/:id",
	requireAuth,
	zValidator("param", idParams),
	zValidator("json", skillBody.partial()),
	async (c) => {
		const organizationId = c.get("activeOrgId");
		if (!organizationId) throw new BadRequestError("No active organization");
		await requireManager(c.var.user!.id, organizationId);
		const { id } = c.req.valid("param");
		const current = await requireSkill(id, organizationId);
		const body = c.req.valid("json");
		const sourceType = body.sourceType ?? current.sourceType;
		const mcpIntegrationId =
			body.sourceType === "manual"
				? null
				: body.mcpIntegrationId ?? current.mcpIntegrationId;
		await validateMcpReference(organizationId, sourceType, mcpIntegrationId);
		const [updated] = await db
			.update(skill)
			.set({
				...body,
				sourceType,
				mcpIntegrationId,
				updatedAt: new Date(),
			})
			.where(and(eq(skill.id, id), eq(skill.organizationId, organizationId)))
			.returning();
		return c.json(updated);
	},
);

router.delete(
	"/skills/:id",
	requireAuth,
	zValidator("param", idParams),
	async (c) => {
		const organizationId = c.get("activeOrgId");
		if (!organizationId) throw new BadRequestError("No active organization");
		await requireManager(c.var.user!.id, organizationId);
		const { id } = c.req.valid("param");
		await requireSkill(id, organizationId);
		await db
			.delete(skill)
			.where(and(eq(skill.id, id), eq(skill.organizationId, organizationId)));
		return c.json({ deleted: true });
	},
);

router.post(
	"/skills/:id/assignments",
	requireAuth,
	zValidator("param", idParams),
	zValidator("json", assignmentBody),
	async (c) => {
		const organizationId = c.get("activeOrgId");
		if (!organizationId) throw new BadRequestError("No active organization");
		await requireManager(c.var.user!.id, organizationId);
		const { id } = c.req.valid("param");
		await requireSkill(id, organizationId);
		const body = c.req.valid("json");
		if (body.chatId) {
			const target = await db.query.chat.findFirst({
				where: and(
					eq(chat.id, body.chatId),
					eq(chat.organizationId, organizationId),
				),
			});
			if (!target)
				throw new BadRequestError(
					"The target chat is not in this organization",
				);
		}
		if (body.agentId) {
			const target = await db.query.agent.findFirst({
				where: and(
					eq(agent.id, body.agentId),
					eq(agent.organizationId, organizationId),
				),
			});
			if (!target)
				throw new BadRequestError(
					"The target agent is not in this organization",
				);
		}
		const [created] = await db
			.insert(skillAssignment)
			.values({
				skillId: id,
				scope: body.scope,
				chatId: body.scope === "chat" ? body.chatId : null,
				agentId: body.scope === "agent" ? body.agentId : null,
				enabled: body.enabled ?? true,
			})
			.returning();
		return c.json(created, 201);
	},
);

router.patch(
	"/skills/:id/assignments/:assignmentId",
	requireAuth,
	zValidator("param", z.object({ id: z.uuid(), assignmentId: z.uuid() })),
	zValidator("json", z.object({ enabled: z.boolean() })),
	async (c) => {
		const organizationId = c.get("activeOrgId");
		if (!organizationId) throw new BadRequestError("No active organization");
		await requireManager(c.var.user!.id, organizationId);
		const { id, assignmentId } = c.req.valid("param");
		await requireSkill(id, organizationId);
		const [updated] = await db
			.update(skillAssignment)
			.set(c.req.valid("json"))
			.where(
				and(
					eq(skillAssignment.id, assignmentId),
					eq(skillAssignment.skillId, id),
				),
			)
			.returning();
		if (!updated) throw new NotFoundError("Skill assignment not found");
		return c.json(updated);
	},
);

router.delete(
	"/skills/:id/assignments/:assignmentId",
	requireAuth,
	zValidator("param", z.object({ id: z.uuid(), assignmentId: z.uuid() })),
	async (c) => {
		const organizationId = c.get("activeOrgId");
		if (!organizationId) throw new BadRequestError("No active organization");
		await requireManager(c.var.user!.id, organizationId);
		const { id, assignmentId } = c.req.valid("param");
		await requireSkill(id, organizationId);
		await db
			.delete(skillAssignment)
			.where(
				and(
					eq(skillAssignment.id, assignmentId),
					eq(skillAssignment.skillId, id),
				),
			);
		return c.json({ deleted: true });
	},
);

export default router;
