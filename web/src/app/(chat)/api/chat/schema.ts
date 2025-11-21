import { z } from "zod";

const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(2000),
});

const filePartSchema = z.object({
  type: z.enum(["file"]),
  mediaType: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  url: z.url(),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

export const postRequestBodySchema = z.object({
  id: z.string().min(1),
  message: z.object({
    id: z.string().min(1),
    role: z.enum(["user"]),
    parts: z.array(partSchema),
  }),
  selectedVisibilityType: z.enum(["public", "private"]),
  agentIds: z.array(z.string().min(1)).optional().default([]),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
