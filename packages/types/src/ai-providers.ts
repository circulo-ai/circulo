import z from "zod";

export const aiProviderIdSchema = z.enum([
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "ollama",
  "openai-compatible",
]);

export type AiProviderId = z.infer<typeof aiProviderIdSchema>;

export const DEFAULT_AI_PROVIDER_ID: AiProviderId = "openrouter";

export const aiProviderCredentialCreateSchema = z
  .object({
    providerId: aiProviderIdSchema,
    name: z.string().trim().min(1).max(80),
    apiKey: z.string().trim().max(500).default(""),
    baseUrl: z.string().trim().url().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (!value.apiKey && value.providerId !== "ollama") {
      context.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: "An API key is required for this provider.",
      });
    }
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
  local?: boolean;
  capabilities?: readonly AiProviderCapability[];
};

export const aiProviderCapabilitySchema = z.enum([
  "chat",
  "tools",
  "vision",
  "embeddings",
  "audio-input",
  "audio-output",
  "reranking",
]);

export type AiProviderCapability = z.infer<typeof aiProviderCapabilitySchema>;
