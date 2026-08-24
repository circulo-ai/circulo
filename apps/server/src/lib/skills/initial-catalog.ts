import { db } from "@/db";
import { skill, skillAssignment } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/** Safe, broadly useful starter skills that make a new workspace useful on day one. */
export const INITIAL_SKILL_CATALOG = [
  {
    name: "Clear answers",
    description:
      "Give direct, structured answers with the right amount of detail.",
    instructions:
      "Lead with the answer. Use headings or bullets when they improve scanability. State uncertainty plainly and ask one focused follow-up only when the request cannot be completed safely without it.",
    category: "communication",
  },
  {
    name: "Research synthesis",
    description:
      "Turn source material into a grounded, decision-ready summary.",
    instructions:
      "Separate facts from interpretation. Identify the strongest evidence, disagreements, assumptions, and open questions. Never invent sources, access, or completed research.",
    category: "research",
  },
  {
    name: "Writing and editing",
    description:
      "Draft and improve professional writing while preserving intent.",
    instructions:
      "Preserve the author's goal and factual claims. Improve clarity, structure, tone, and concision. When editing, call out material changes and keep the result easy to reuse.",
    category: "writing",
  },
  {
    name: "Project planning",
    description: "Break ambiguous work into practical, sequenced next steps.",
    instructions:
      "Define the outcome, assumptions, dependencies, owners, risks, and a smallest useful next step. Prefer an actionable plan over abstract advice.",
    category: "planning",
  },
  {
    name: "Meeting notes",
    description:
      "Convert conversation or documents into useful meeting artifacts.",
    instructions:
      "Extract decisions, unresolved questions, action items, owners, and dates. Do not assign an owner or deadline unless the source supports it; mark missing ownership explicitly.",
    category: "productivity",
  },
  {
    name: "Code review",
    description:
      "Review implementation changes for correctness and maintainability.",
    instructions:
      "Prioritize bugs, security risks, data-loss risks, regressions, and missing tests. Tie findings to concrete code or behavior. If no issue is found, say what was verified and what remains untestable.",
    category: "engineering",
  },
] as const;

const initializedOrganizations = new Set<string>();
const inFlightOrganizations = new Map<string, Promise<void>>();

export async function ensureInitialSkillCatalog(
  organizationId: string,
  createdBy: string,
): Promise<void> {
  if (initializedOrganizations.has(organizationId)) return;
  const inFlight = inFlightOrganizations.get(organizationId);
  if (inFlight) return inFlight;

  const initialization = initializeSkillCatalog(organizationId, createdBy);
  inFlightOrganizations.set(organizationId, initialization);
  try {
    await initialization;
    initializedOrganizations.add(organizationId);
  } finally {
    inFlightOrganizations.delete(organizationId);
  }
}

async function initializeSkillCatalog(
  organizationId: string,
  createdBy: string,
): Promise<void> {
  const existingSkills = await db.query.skill.findMany({
    where: eq(skill.organizationId, organizationId),
  });

  for (const definition of INITIAL_SKILL_CATALOG) {
    const existing = existingSkills.find(
      (candidate) => candidate.name === definition.name,
    );
    const current =
      existing ??
      (
        await db
          .insert(skill)
          .values({
            organizationId,
            createdBy,
            name: definition.name,
            description: definition.description,
            instructions: definition.instructions,
            metadata: {
              builtin: true,
              category: definition.category,
              catalogVersion: 1,
            },
          })
          .onConflictDoNothing()
          .returning()
      )[0];
    if (!current) continue;

    const assignment = await db.query.skillAssignment.findFirst({
      where: and(
        eq(skillAssignment.skillId, current.id),
        eq(skillAssignment.scope, "organization"),
        isNull(skillAssignment.chatId),
        isNull(skillAssignment.agentId),
      ),
    });
    if (!assignment) {
      await db
        .insert(skillAssignment)
        .values({
          skillId: current.id,
          scope: "organization",
          enabled: true,
        })
        .onConflictDoNothing();
    }
  }
}
