import { db } from "@/db";
import { mcpIntegration, skill } from "@/db/schema";
import { CONNECTED_APP_CATALOG } from "@/lib/apps/catalog";
import { getConnectedAppsForUser } from "@/lib/apps/connections";
import { createRouter } from "@/lib/create-app";
import { STARTER_MCP_CATALOG } from "@/lib/mcp/starter-catalog";
import { hasPermissionForUser, isMemberOf } from "@/lib/permissions";
import { ensureInitialSkillCatalog } from "@/lib/skills/initial-catalog";
import { ensureWorkspaceRoleCatalog } from "@/lib/workspace-role-catalog";
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
      "Search and update explicit personal and organization memory according to policy.",
    status: "active" as const,
    capabilities: ["read", "write"],
    tools: ["searchMemory", "rememberMemory"],
  },
  {
    id: "builtin:knowledge",
    type: "plugin" as const,
    name: "Knowledge retrieval",
    description:
      "Search assigned workspace sources with lexical and semantic retrieval.",
    status: "active" as const,
    capabilities: ["read"],
    tools: ["searchKnowledge"],
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
  await ensureInitialSkillCatalog(organizationId, userId);
  await ensureWorkspaceRoleCatalog(organizationId, userId);
  const isManager = await hasPermissionForUser(
    userId,
    organizationId,
    "workspace",
    "manage",
    c.var.apiKeyPermissions,
  );
  const canReadSkills = await hasPermissionForUser(
    userId,
    organizationId,
    "skills",
    "read",
    c.var.apiKeyPermissions,
  );
  const canReadApps = await hasPermissionForUser(
    userId,
    organizationId,
    "apps",
    "read",
    c.var.apiKeyPermissions,
  );

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
  const skills = canReadSkills
    ? await db.query.skill.findMany({
        where: eq(skill.organizationId, organizationId),
        with: { assignments: true },
        orderBy: desc(skill.updatedAt),
      })
    : [];
  const apps = canReadApps ? await getConnectedAppsForUser(userId) : [];

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
    apps,
    appCatalog: canReadApps ? CONNECTED_APP_CATALOG : [],
    mcpCatalog: STARTER_MCP_CATALOG,
    mcps: integrations,
    skills,
    counts: {
      plugins: builtinPlugins.length + integrations.length,
      apps: apps.length,
      mcps: integrations.length,
      skills: skills.length,
    },
  });
});

export default router;
