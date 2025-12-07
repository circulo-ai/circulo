import { codeDocumentHandler } from "@/application/artifact/handlers/code/server";
import { sheetDocumentHandler } from "@/application/artifact/handlers/sheet/server";
import { textDocumentHandler } from "@/application/artifact/handlers/text/server";
import { artifactRepo } from "@/db/repositories";
import type { ArtifactKind, Document } from "@/db/schema";
import type { UIMessageStreamWriter } from "ai";
import type { Session } from "better-auth";
import type { ChatMessage } from "../types";

export type SaveDocumentProps = {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
};

export type CreateDocumentCallbackProps = {
  id: string;
  title: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  session: Session;
};

export type UpdateDocumentCallbackProps = {
  document: Document;
  description: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  session: Session;
};

export type DocumentHandler<T = ArtifactKind> = {
  kind: T;
  onCreateDocument: (args: CreateDocumentCallbackProps) => Promise<void>;
  onUpdateDocument: (args: UpdateDocumentCallbackProps) => Promise<void>;
};

export function createDocumentHandler<T extends ArtifactKind>(config: {
  kind: T;
  onCreateDocument: (params: CreateDocumentCallbackProps) => Promise<string>;
  onUpdateDocument: (params: UpdateDocumentCallbackProps) => Promise<string>;
}): DocumentHandler<T> {
  return {
    kind: config.kind,
    onCreateDocument: async function onCreateDocument(
      args: CreateDocumentCallbackProps,
    ) {
      const draftContent = await config.onCreateDocument({
        id: args.id,
        title: args.title,
        dataStream: args.dataStream,
        session: args.session,
      });

      if (args.session?.userId) {
        await artifactRepo.save({
          id: args.id,
          title: args.title,
          content: draftContent,
          kind: config.kind,
          userId: args.session.userId,
        });
      }

      return;
    },
    onUpdateDocument: async function onUpdateDocument(
      args: UpdateDocumentCallbackProps,
    ) {
      const draftContent = await config.onUpdateDocument({
        document: args.document,
        description: args.description,
        dataStream: args.dataStream,
        session: args.session,
      });

      if (args.session?.userId) {
        await artifactRepo.save({
          id: args.document.id,
          title: args.document.title,
          content: draftContent,
          kind: config.kind,
          userId: args.session.userId,
        });
      }

      return;
    },
  };
}

/*
 * Use this array to define the document handlers for each artifact kind.
 */
export const documentHandlersByArtifactKind: DocumentHandler[] = [
  textDocumentHandler,
  codeDocumentHandler,
  sheetDocumentHandler,
];

export const artifactKinds = ["text", "code", "sheet"] as const;
