import { artifactRepo } from "@/db/repositories";
import type { AgentExecutionMeteringContext } from "@/lib/ai/agent-execution-meter";
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from "@/lib/artifacts/server";
import type { ActorContext, ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { tool, type Tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";

type CreateDocumentProps = {
  session: ActorContext;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  metering?: AgentExecutionMeteringContext;
};

export const createDocument = ({
  session,
  dataStream,
  metering,
}: CreateDocumentProps): Tool<
  {
    title: string;
    kind: (typeof artifactKinds)[number];
    content?: string | null;
  },
  {
    id: string;
    title: string;
    kind: (typeof artifactKinds)[number];
    content: string;
  }
> =>
  tool({
    description:
      "Create a saved document. Supply content to preserve the exact researched draft (Markdown for text, source for code, CSV for sheets); otherwise a draft is generated from the title. Read the saved document afterward to verify its contents.",
    inputSchema: z.object({
      title: z.string(),
      kind: z.enum(artifactKinds),
      content: z.string().trim().min(1).max(200000).nullable().optional(),
    }),
    execute: async ({ title, kind, content }) => {
      const id = generateUUID();

      dataStream.write({
        type: "data-kind",
        data: kind,
        transient: true,
      });

      dataStream.write({
        type: "data-id",
        data: id,
        transient: true,
      });

      dataStream.write({
        type: "data-title",
        data: title,
        transient: true,
      });

      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === kind,
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${kind}`);
      }

      if (content) {
        await artifactRepo.save({
          id,
          title,
          kind,
          content,
          userId: session.userId,
          chatId: session.chatId,
        });
        dataStream.write({
          type:
            kind === "code"
              ? "data-codeDelta"
              : kind === "sheet"
                ? "data-sheetDelta"
                : "data-textDelta",
          data: content,
          transient: true,
        });
      } else {
        await documentHandler.onCreateDocument({
          id,
          title,
          dataStream,
          session,
          metering,
        });
      }

      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id,
        title,
        kind,
        content: "A document was created and is now visible to the user.",
      };
    },
  });
