import { z } from "zod";

export const embeddingPreferencesSchema = z
  .object({
    enabled: z.boolean().default(true),
    provider: z.enum(["auto", "openrouter", "openai"]).default("auto"),
    model: z
      .enum(["text-embedding-3-small", "text-embedding-3-large"])
      .default("text-embedding-3-small"),
    strategy: z.enum(["paragraph", "fixed"]).default("paragraph"),
    chunkSize: z.number().int().min(256).max(12000).default(4000),
    overlap: z.number().int().min(0).max(2000).default(400),
  })
  .strict()
  .refine((value) => value.overlap < value.chunkSize / 2, {
    path: ["overlap"],
    message: "Overlap must be less than half the chunk size",
  });
export type EmbeddingPreferences = z.infer<typeof embeddingPreferencesSchema>;
export const DEFAULT_EMBEDDING_PREFERENCES = embeddingPreferencesSchema.parse(
  {},
);
export const EMBEDDING_MODELS = [
  { value: "text-embedding-3-small", label: "Text Embedding 3 Small" },
  { value: "text-embedding-3-large", label: "Text Embedding 3 Large" },
] as const;
