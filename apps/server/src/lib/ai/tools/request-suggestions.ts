import type { ArtifactKind } from "@/db";
import { artifactRepo, suggestionRepo } from "@/db/repositories";
import type {
  ActorContext,
  ChatMessage,
  SuggestionStreamData,
} from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import {
  Output,
  streamText,
  tool,
  type Tool,
  type UIMessageStreamWriter,
} from "ai";
import { z } from "zod";
import { resolveLanguageModel } from "../provider-registry";

type RequestSuggestionsProps = {
  session: ActorContext;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

type RequestSuggestionsOutput =
  | { error: string }
  | { id: string; title: string; kind: ArtifactKind; message: string };

export const requestSuggestions = ({
  session,
  dataStream,
}: RequestSuggestionsProps): Tool<
  { documentId: string },
  RequestSuggestionsOutput
> =>
  tool({
    description: "Request suggestions for a document",
    inputSchema: z.object({
      documentId: z
        .string()
        .describe("The ID of the document to request edits"),
    }),
    execute: async ({ documentId }) => {
      const document = await artifactRepo.getDocumentById({ id: documentId });

      if (!document || !document.content) {
        return {
          error: "Document not found",
        };
      }

      const suggestions: SuggestionStreamData[] = [];

      const { elementStream } = streamText({
        model: await resolveLanguageModel({
          userId: session.userId,
          providerId: session.providerId,
          modelId: session.modelId,
        }),
        system:
          "You are a help writing assistant. Given a piece of writing, please offer suggestions to improve the piece of writing and describe the change. It is very important for the edits to contain full sentences instead of just words. Max 5 suggestions.",
        prompt: document.content,
        output: Output.array({
          element: z.object({
            originalSentence: z.string().describe("The original sentence"),
            suggestedSentence: z.string().describe("The suggested sentence"),
            description: z
              .string()
              .describe("The description of the suggestion"),
          }),
        }),
      });

      for await (const element of elementStream) {
        const suggestion: SuggestionStreamData = {
          originalText: element.originalSentence,
          suggestedText: element.suggestedSentence,
          description: element.description,
          id: generateUUID(),
          documentId,
          isResolved: false,
        };

        dataStream.write({
          type: "data-suggestion",
          data: suggestion,
          transient: true,
        });

        suggestions.push(suggestion);
      }

      if (session.userId) {
        const userId = session.userId;

        await suggestionRepo.save({
          suggestions: suggestions.map((suggestion) => ({
            ...suggestion,
            userId,
            createdAt: new Date(),
            documentCreatedAt: document.createdAt,
          })),
        });
      }

      return {
        id: documentId,
        title: document.title,
        kind: document.kind,
        message: "Suggestions have been added to the document",
      };
    },
  });
