import { agentExecutionSettings, db } from "@/db";
import {
  agentExecutionSettingsSchema,
  DEFAULT_AGENT_EXECUTION_SETTINGS,
  type AgentExecutionSettings,
} from "@circulo-ai/types";
import { eq } from "drizzle-orm";

export async function getAgentExecutionSettings(
  organizationId: string,
): Promise<AgentExecutionSettings> {
  const row = await db.query.agentExecutionSettings.findFirst({
    where: eq(agentExecutionSettings.organizationId, organizationId),
  });
  const parsed = agentExecutionSettingsSchema.safeParse(row?.config);
  return parsed.success
    ? parsed.data
    : structuredClone(DEFAULT_AGENT_EXECUTION_SETTINGS);
}

export async function saveAgentExecutionSettings(params: {
  organizationId: string;
  userId: string;
  config: AgentExecutionSettings;
}) {
  const [row] = await db
    .insert(agentExecutionSettings)
    .values({
      organizationId: params.organizationId,
      config: params.config,
      updatedBy: params.userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: agentExecutionSettings.organizationId,
      set: {
        config: params.config,
        updatedBy: params.userId,
        updatedAt: new Date(),
      },
    })
    .returning({ config: agentExecutionSettings.config });
  return row?.config ?? params.config;
}
