import { db } from "@/db";
import { knowledgeBase, knowledgeDocument } from "@/db/schema";
import { enforceOrganizationFeatureLimit } from "@/lib/billing/limits";
import { createRouter } from "@/lib/create-app";
import { getUserRole, isMemberOf } from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import {
	BadRequestError,
	ForbiddenError,
	NotFoundError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/create-app";

const router = createRouter();
const idParams = z.object({ id: z.uuid() });
const documentParams = z.object({ id: z.uuid(), documentId: z.uuid() });

const baseSchema = z.object({
	name: z.string().trim().min(1).max(200),
	description: z.string().trim().max(2000).nullable().optional(),
});

const documentSchema = z.object({
	title: z.string().trim().min(1).max(300),
	content: z.string().max(500_000),
	sourceKey: z.string().trim().max(1000).nullable().optional(),
	contentType: z.string().trim().max(200).default("text/plain"),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

async function getActiveOrganization(c: Context<AppEnv>) {
	const organizationId = c.get("activeOrgId");
	if (!organizationId) throw new BadRequestError("No active organization");
	if (!(await isMemberOf(c.var.user!.id, organizationId))) {
		throw new ForbiddenError("You don't have access to this organization");
	}
	return organizationId;
}

async function requireOrganizationManager(
	userId: string,
	organizationId: string,
) {
	const role = await getUserRole(userId, organizationId);
	if (!role || !["owner", "admin"].includes(role)) {
		throw new ForbiddenError(
			"Only workspace owners and admins can manage knowledge bases",
		);
	}
}

async function getBase(id: string, organizationId: string) {
	const base = await db.query.knowledgeBase.findFirst({
		where: and(
			eq(knowledgeBase.id, id),
			eq(knowledgeBase.organizationId, organizationId),
		),
		with: { documents: true },
	});
	if (!base) throw new NotFoundError("Knowledge base not found");
	return base;
}

router.get("/knowledge-bases", requireAuth, async (c) => {
	const organizationId = await getActiveOrganization(c);
	const bases = await db.query.knowledgeBase.findMany({
		where: eq(knowledgeBase.organizationId, organizationId),
		with: { documents: true },
		orderBy: desc(knowledgeBase.updatedAt),
	});
	return c.json(
		bases.map(({ documents, ...base }) => ({
			...base,
			documentCount: documents.length,
		})),
	);
});

router.post(
	"/knowledge-bases",
	requireAuth,
	zValidator("json", baseSchema),
	async (c) => {
		const organizationId = await getActiveOrganization(c);
		await requireOrganizationManager(c.var.user!.id, organizationId);
		const body = c.req.valid("json");
		const [baseCount] = await db
			.select({ current: count() })
			.from(knowledgeBase)
			.where(
				and(
					eq(knowledgeBase.organizationId, organizationId),
					eq(knowledgeBase.isArchived, false),
				),
			);
		await enforceOrganizationFeatureLimit({
			organizationId,
			feature: "kb_slots",
			current: Number(baseCount?.current ?? 0),
			resourceName: "Knowledge base",
		});
		const [created] = await db
			.insert(knowledgeBase)
			.values({
				organizationId,
				createdBy: c.var.user!.id,
				name: body.name,
				description: body.description ?? null,
			})
			.returning();
		return c.json(created, 201);
	},
);

router.patch(
	"/knowledge-bases/:id",
	requireAuth,
	zValidator("param", idParams),
	zValidator("json", baseSchema.partial()),
	async (c) => {
		const organizationId = await getActiveOrganization(c);
		await requireOrganizationManager(c.var.user!.id, organizationId);
		const { id } = c.req.valid("param");
		await getBase(id, organizationId);
		const [updated] = await db
			.update(knowledgeBase)
			.set({ ...c.req.valid("json"), updatedAt: new Date() })
			.where(
				and(
					eq(knowledgeBase.id, id),
					eq(knowledgeBase.organizationId, organizationId),
				),
			)
			.returning();
		return c.json(updated);
	},
);

router.delete(
	"/knowledge-bases/:id",
	requireAuth,
	zValidator("param", idParams),
	async (c) => {
		const organizationId = await getActiveOrganization(c);
		await requireOrganizationManager(c.var.user!.id, organizationId);
		const { id } = c.req.valid("param");
		await getBase(id, organizationId);
		await db
			.delete(knowledgeBase)
			.where(
				and(
					eq(knowledgeBase.id, id),
					eq(knowledgeBase.organizationId, organizationId),
				),
			);
		return c.json({ deleted: true });
	},
);

router.get(
	"/knowledge-bases/:id/documents",
	requireAuth,
	zValidator("param", idParams),
	async (c) => {
		const organizationId = await getActiveOrganization(c);
		const { id } = c.req.valid("param");
		const base = await getBase(id, organizationId);
		return c.json(base.documents);
	},
);

router.get(
	"/knowledge-bases/:id/search",
	requireAuth,
	zValidator("param", idParams),
	async (c) => {
		const organizationId = await getActiveOrganization(c);
		const { id } = c.req.valid("param");
		await getBase(id, organizationId);
		const query = z
			.object({
				q: z.string().trim().min(1).max(500),
				limit: z.coerce.number().int().min(1).max(50).default(10),
			})
			.parse(c.req.query());
		return c.json(
			await db.query.knowledgeDocument.findMany({
				where: and(
					eq(knowledgeDocument.knowledgeBaseId, id),
					eq(knowledgeDocument.organizationId, organizationId),
					eq(knowledgeDocument.status, "ready"),
					sql`to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}) @@ plainto_tsquery('simple', ${query.q})`,
				),
				orderBy: desc(
					sql`ts_rank(to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}), plainto_tsquery('simple', ${query.q}))`,
				),
				limit: query.limit,
			}),
		);
	},
);

router.post(
	"/knowledge-bases/:id/documents",
	requireAuth,
	zValidator("param", idParams),
	zValidator("json", documentSchema),
	async (c) => {
		const organizationId = await getActiveOrganization(c);
		await requireOrganizationManager(c.var.user!.id, organizationId);
		const { id } = c.req.valid("param");
		await getBase(id, organizationId);
		const body = c.req.valid("json");
		if (!body.content.trim()) throw new BadRequestError("Document is empty");
		const [created] = await db
			.insert(knowledgeDocument)
			.values({
				knowledgeBaseId: id,
				organizationId,
				createdBy: c.var.user!.id,
				title: body.title,
				content: body.content,
				sourceKey: body.sourceKey ?? null,
				contentType: body.contentType,
				metadata: body.metadata ?? {},
			})
			.returning();
		return c.json(created, 201);
	},
);

router.patch(
	"/knowledge-bases/:id/documents/:documentId",
	requireAuth,
	zValidator("param", documentParams),
	zValidator("json", documentSchema.partial()),
	async (c) => {
		const organizationId = await getActiveOrganization(c);
		await requireOrganizationManager(c.var.user!.id, organizationId);
		const { id, documentId } = c.req.valid("param");
		await getBase(id, organizationId);
		const existing = await db.query.knowledgeDocument.findFirst({
			where: and(
				eq(knowledgeDocument.id, documentId),
				eq(knowledgeDocument.knowledgeBaseId, id),
				eq(knowledgeDocument.organizationId, organizationId),
			),
		});
		if (!existing) throw new NotFoundError("Knowledge document not found");
		const [updated] = await db
			.update(knowledgeDocument)
			.set({ ...c.req.valid("json"), updatedAt: new Date() })
			.where(eq(knowledgeDocument.id, documentId))
			.returning();
		return c.json(updated);
	},
);

router.delete(
	"/knowledge-bases/:id/documents/:documentId",
	requireAuth,
	zValidator("param", documentParams),
	async (c) => {
		const organizationId = await getActiveOrganization(c as never);
		await requireOrganizationManager(c.var.user!.id, organizationId);
		const { id, documentId } = c.req.valid("param");
		await getBase(id, organizationId);
		const deleted = await db
			.delete(knowledgeDocument)
			.where(
				and(
					eq(knowledgeDocument.id, documentId),
					eq(knowledgeDocument.knowledgeBaseId, id),
					eq(knowledgeDocument.organizationId, organizationId),
				),
			)
			.returning({ id: knowledgeDocument.id });
		if (!deleted[0]) throw new NotFoundError("Knowledge document not found");
		return c.json({ deleted: true });
	},
);

export async function validateKnowledgeBaseIds(
	organizationId: string,
	ids: string[],
): Promise<void> {
	if (ids.length === 0) return;
	const bases = await db
		.select({ id: knowledgeBase.id })
		.from(knowledgeBase)
		.where(
			and(
				eq(knowledgeBase.organizationId, organizationId),
				inArray(knowledgeBase.id, ids),
				eq(knowledgeBase.isArchived, false),
			),
		);
	if (bases.length !== new Set(ids).size) {
		throw new BadRequestError(
			"Every knowledge base must belong to the active organization",
		);
	}
}

export default router;
