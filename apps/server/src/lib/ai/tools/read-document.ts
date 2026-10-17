import { artifact, db, type ArtifactKind } from "@/db";
import { artifactRepo } from "@/db/repositories";
import type { ActorContext } from "@/lib/types";
import { tool, type Tool } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export function readDocument(session: ActorContext): Tool<
  { id?: string | null; title?: string | null; offset: number; length: number },
  {
    id: string;
    title: string;
    kind: ArtifactKind;
    content: string;
    totalCharacters: number;
    nextOffset: number | null;
  }
> {
  return tool({
    description:
      "Read a saved document to verify that its contents match the requested deliverable. Provide an ID, or the exact title of an existing document in this chat when its ID is unknown. Only your own documents or documents in this authorized chat are accessible. Results are paginated.",
    inputSchema: z.object({
      id: z.string().min(1).max(200).nullable().optional(),
      title: z.string().trim().min(1).max(500).nullable().optional(),
      offset: z.number().int().min(0),
      length: z.number().int().min(256).max(8000),
    }),
    execute: async ({ id, title, offset, length }) => {
      if (!id && !title)
        throw new Error(
          "Provide a saved document ID or its exact title in this chat.",
        );
      let document:
        | Awaited<ReturnType<typeof artifactRepo.getDocumentById>>
        | undefined;
      if (id) document = await artifactRepo.getDocumentById({ id });
      else if (session.chatId && title) {
        const matches = await db
          .select()
          .from(artifact)
          .where(
            and(eq(artifact.chatId, session.chatId), eq(artifact.title, title)),
          )
          .limit(2);
        if (matches.length > 1)
          throw new Error(
            `More than one document has this exact title. Choose an ID: ${matches.map((item) => item.id).join(", ")}`,
          );
        document = matches[0];
      }
      if (
        !document ||
        !(
          document.userId === session.userId ||
          (session.chatId && document.chatId === session.chatId)
        )
      )
        throw new Error(
          "This document is not accessible in this conversation.",
        );
      const content = document.content ?? "";
      return {
        id: document.id,
        title: document.title,
        kind: document.kind,
        content: content.slice(offset, offset + length),
        totalCharacters: content.length,
        nextOffset: offset + length < content.length ? offset + length : null,
      };
    },
  });
}
