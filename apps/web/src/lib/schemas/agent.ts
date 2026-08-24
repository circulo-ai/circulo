import { LLM_MODELS, defaultModel } from "@/lib/ai/providers";
import { z } from "zod";

export const getQuerySchema = z.object({
  id: z.uuid().optional(),
  search: z.string().optional(),
  includeArchived: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const baseAgentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  instructions: z.string().min(1, "Instructions are required"),
  avatarUrl: z.url().or(z.string().startsWith("/")).optional(),
  model: z.enum(LLM_MODELS).default(defaultModel),
  maxTokens: z.coerce.number().int().positive().optional(),
  temperature: z.coerce.number().int().min(0).max(100).optional(),
  toolAccessMode: z.enum(["all", "allowlist"]).default("allowlist"),
  defaultToolIds: z.array(z.string()).optional(),
  defaultKnowledgeBaseIds: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const createBodySchema = baseAgentSchema.extend({
  id: z.uuid().optional(),
});

export const updateBodySchema = baseAgentSchema
  .partial()
  .extend({
    id: z.uuid(),
  })
  .refine(
    (data) =>
      Object.entries(data).some(
        ([key, value]) => key !== "id" && value !== undefined,
      ),
    { message: "At least one field must be provided to update" },
  );

export const deleteQuerySchema = z.object({
  id: z.uuid(),
  hard: z.coerce.boolean().optional().default(false),
});
