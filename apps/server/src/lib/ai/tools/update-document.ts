import type { ArtifactKind } from "@/db";
import { artifactRepo } from "@/db/repositories";
import { documentHandlersByArtifactKind } from "@/lib/artifacts/server";
import type { ActorContext, ChatMessage } from "@/lib/types";
import { tool, type Tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";

type UpdateDocumentProps = {
  session: ActorContext;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

type UpdateDocumentOutput =
  | { error: string }
  | { id: string; title: string; kind: ArtifactKind; content: string };

export const updateDocument = ({
  session,
  dataStream,
}: UpdateDocumentProps): Tool<
  { id: string; description: string },
  UpdateDocumentOutput
> =>
  tool({
    description: "Update a document with the given description.",
    inputSchema: z.object({
      id: z.string().describe("The ID of the document to update"),
      description: z
        .string()
        .describe("The description of changes that need to be made"),
    }),
    execute: async ({ id, description }) => {
      const document = await artifactRepo.getDocumentById({ id });

      if (!document) {
        return {
          error: "Document not found",
        };
      }

      const canUpdate =
        document.userId === session.userId ||
        (Boolean(session.chatId) && document.chatId === session.chatId);
      if (!canUpdate) {
        return {
          error: "You do not have access to update this document",
        };
      }

      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === document.kind,
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${document.kind}`);
      }

      await documentHandler.onUpdateDocument({
        document,
        description,
        dataStream,
        session,
      });

      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id,
        title: document.title,
        kind: document.kind,
        content: "The document has been updated successfully.",
      };
    },
  });
