import { db } from "@/db";
import { agentTemplate } from "@/db/schema";
import { api, success } from "@/lib/server";
import { and, eq, inArray } from "drizzle-orm";

// GET /api/v1/agents/templates
// Lists all published, publicly visible agent templates
export const GET = api({ auth: true }, async (req, ctx) => {
  const templates = await db.query.agentTemplate.findMany({
    where: and(
      eq(agentTemplate.status, "published"),
      eq(agentTemplate.deleted, false),
      inArray(agentTemplate.visibility, ["public", "marketplace"]),
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return success({ templates });
});