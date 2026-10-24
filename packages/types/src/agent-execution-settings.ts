import z from "zod";

const optionalCap = (maximum: number) =>
  z.number().int().min(1).max(maximum).nullable();

export const agentExecutionSettingsSchema = z.object({
  agentLoop: z.object({
    modelSteps: optionalCap(10_000),
    toolCalls: optionalCap(100_000),
    tokens: optionalCap(100_000_000),
    runtimeMs: z
      .number()
      .int()
      .min(1_000)
      .max(7 * 24 * 60 * 60 * 1_000)
      .nullable(),
  }),
  workflow: z.object({
    continuationRounds: optionalCap(1_000),
    totalAgentTasks: optionalCap(10_000),
    runtimeMs: z
      .number()
      .int()
      .min(1_000)
      .max(7 * 24 * 60 * 60 * 1_000)
      .nullable(),
  }),
  conversationContextTokens: z
    .number()
    .int()
    .min(256)
    .max(1_000_000)
    .nullable(),
  usageBudgets: z.object({
    rollingFiveHourTokens: optionalCap(1_000_000_000),
    rollingSevenDayTokens: optionalCap(10_000_000_000),
  }),
});

export type AgentExecutionSettings = z.infer<
  typeof agentExecutionSettingsSchema
>;

/** Existing runtime limits, represented in the workspace settings contract. */
export const DEFAULT_AGENT_EXECUTION_SETTINGS: AgentExecutionSettings = {
  agentLoop: {
    modelSteps: 40,
    toolCalls: 120,
    tokens: 250_000,
    runtimeMs: 10 * 60_000,
  },
  workflow: {
    continuationRounds: 4,
    totalAgentTasks: 12,
    runtimeMs: 25 * 60_000,
  },
  // 30,000 tokens preserves the previous 120,000 character default at the
  // harness's conservative four characters per token estimate.
  conversationContextTokens: 30_000,
  usageBudgets: {
    rollingFiveHourTokens: null,
    rollingSevenDayTokens: null,
  },
};
