import { db } from "@/db";
import { mcpIntegration, skill } from "@/db/schema";
import { createRouter } from "@/lib/create-app";
import { getUserRole, isMemberOf } from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import { BadRequestError, ForbiddenError } from "@circulo-ai/types";
import { and, desc, eq } from "drizzle-orm";

const router = createRouter();

/**
 * These entries are the capabilities that are actually registered in the
 * orchestration runtime. This list intentionally excludes unsupported desktop
 * automation and vendor integrations that Circulo cannot execute.
 */
const builtinPlugins = [
	{
		id: "builtin:document-authoring",
		type: "plugin" as const,
		name: "Document authoring",
		description: "Create and update document artifacts in a chat.",
		status: "active" as const,
		capabilities: ["read", "write"],
		tools: ["createDocument", "updateDocument"],
	},
	{
		id: "builtin:workflow-coordination",
		type: "plugin" as const,
		name: "Workflow coordination",
		description: "Coordinate handoffs, scheduled work, and human decisions.",
		status: "active" as const,
		capabilities: ["read", "write", "approval"],
		tools: ["handoffTask", "scheduleTask", "requestHumanApproval"],
	},
	{
		id: "builtin:memory",
		type: "plugin" as const,
		name: "Memory",
		description:
			"Use explicit personal and organization memory according to policy.",
		status: "active" as const,
		capabilities: ["read", "write"],
		tools: ["rememberMemory"],
	},
	{
		id: "builtin:suggestions",
		type: "plugin" as const,
		name: "Suggestions",
		description: "Request structured suggestions while drafting content.",
		status: "active" as const,
		capabilities: ["read", "write"],
		tools: ["requestSuggestions"],
	},
];

async function requireOrganizationMember(
	userId: string,
	organizationId: string,
) {
	if (!(await isMemberOf(userId, organizationId))) {
		throw new ForbiddenError("You don't have access to this organization");
	}
}

router.get("/capabilities", requireAuth, async (c) => {
	const organizationId = c.get("activeOrgId");
	if (!organizationId) throw new BadRequestError("No active organization");
	const userId = c.var.user!.id;
	await requireOrganizationMember(userId, organizationId);
	const role = await getUserRole(userId, organizationId);
	const isManager = ["owner", "admin"].includes(role ?? "");

	const integrations = await db.query.mcpIntegration.findMany({
		where: isManager
			? eq(mcpIntegration.organizationId, organizationId)
			: and(
					eq(mcpIntegration.organizationId, organizationId),
					eq(mcpIntegration.enabled, true),
					eq(mcpIntegration.status, "published"),
				),
		with: { tools: true, links: true },
		orderBy: desc(mcpIntegration.updatedAt),
	});
	const skills = isManager
		? await db.query.skill.findMany({
				where: eq(skill.organizationId, organizationId),
				with: { assignments: true },
				orderBy: desc(skill.updatedAt),
			})
		: [];

	return c.json({
		plugins: [
			...builtinPlugins,
			...integrations.map((integration) => ({
				id: `mcp:${integration.id}`,
				type: "plugin" as const,
				name: integration.name,
				description:
					integration.description ?? `MCP server at ${integration.endpoint}`,
				status: integration.status,
				capabilities: ["mcp"],
				tools: integration.tools.map((tool) => tool.name),
				integrationId: integration.id,
			})),
		],
		apps: [],
		mcps: integrations,
		skills,
		counts: {
			plugins: builtinPlugins.length + integrations.length + skills.length,
			apps: 0,
			mcps: integrations.length,
			skills: skills.length,
		},
	});
});

export default router;
