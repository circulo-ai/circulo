import z from "zod";

export const aiProviderIdSchema = z.enum([
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "openai-compatible",
]);

export type AiProviderId = z.infer<typeof aiProviderIdSchema>;

export const DEFAULT_AI_PROVIDER_ID: AiProviderId = "openrouter";

export const aiProviderCredentialCreateSchema = z.object({
  providerId: aiProviderIdSchema,
  name: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(1).max(500),
  baseUrl: z.string().trim().url().max(500).optional(),
});

export const aiProviderCredentialIdSchema = z.object({
  id: z.uuid(),
});

export type AiProviderCredentialCreate = z.infer<
  typeof aiProviderCredentialCreateSchema
>;

export type AiProviderModel = {
  id: string;
  name: string;
  description?: string;
  supportsTools?: boolean;
  supportsVision?: boolean;
};

export type AiProviderDefinition = {
  id: AiProviderId;
  name: string;
  description: string;
  requiresBaseUrl?: boolean;
  defaultBaseUrl?: string;
};
