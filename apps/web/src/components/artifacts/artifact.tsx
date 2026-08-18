import { codeArtifact } from "@/artifacts/code/client";
import { imageArtifact } from "@/artifacts/image/client";
import { sheetArtifact } from "@/artifacts/sheet/client";
import { textArtifact } from "@/artifacts/text/client";
import { MultimodalInput } from "@/components/multimodal-input";
import { Toolbar } from "@/components/toolbar";
import { VersionFooter } from "@/components/version-footer";
import type { VisibilityType } from "@/components/visibility-selector";
import { useArtifact } from "@/hooks/api/chats/use-artifact";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Document, Vote } from "@circulo-ai/db/schema";
import { formatDistance } from "date-fns";
import equal from "fast-deep-equal";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import useSWR, { useSWRConfig } from "swr";
import { useDebounceCallback, useWindowSize } from "usehooks-ts";
import { ArtifactActions } from "./artifact-actions";
import { ArtifactCloseButton } from "./artifact-close-button";
import { ArtifactMessages } from "./artifact-messages";

export const artifactDefinitions = [
  textArtifact,
  codeArtifact,
  imageArtifact,
  sheetArtifact,
];
export type ArtifactKind = (typeof artifactDefinitions)[number]["kind"];

export type UIArtifact = {
  title: string;
  documentId: string;
  kind: ArtifactKind;
  content: string;
  isVisible: boolean;
  status: "streaming" | "idle";
  error?: string;
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
};

function PureArtifact({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  sendMessage,
  messages,
  setMessages,
  regenerate,
  votes,
  isReadonly,
  selectedVisibilityType,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: UseChatHelpers<ChatMessage>["stop"];
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  votes: Vote[] | undefined;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  selectedVisibilityType: VisibilityType;
}) {
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();

  const {
    data: documents,
    error: documentError,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Document[]>(
    artifact.documentId !== "init" && artifact.status !== "streaming"
      ? `/api/artifact?id=${artifact.documentId}`
      : null,
  );

  const [mode, setMode] = useState<"edit" | "diff">("edit");
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");

  useEffect(() => {
    setDocument(null);
    setCurrentVersionIndex(-1);
    setMode("edit");
    setSaveError(null);
  }, [artifact.documentId]);

  useEffect(() => {
    if (documents && documents.length > 0) {
      const mostRecentDocument = documents.at(-1);

      if (mostRecentDocument) {
        setDocument(mostRecentDocument);
        setCurrentVersionIndex(documents.length - 1);
        setArtifact((currentArtifact) => ({
          ...currentArtifact,
          title: mostRecentDocument.title,
          kind: mostRecentDocument.kind as ArtifactKind,
          content: mostRecentDocument.content ?? "",
        }));
      }
    }
  }, [documents, setArtifact]);

  useEffect(() => {
    mutateDocuments();
  }, [mutateDocuments]);

  const { mutate } = useSWRConfig();
  const saveQueueRef = useRef(Promise.resolve());
  const latestContentRef = useRef("");

  const handleContentChange = useCallback(
    (updatedContent: string) => {
      if (
        !artifact ||
        artifact.documentId === "init" ||
        artifact.status === "streaming"
      )
        return;
      latestContentRef.current = updatedContent;
      setSaveState("saving");
      saveQueueRef.current = saveQueueRef.current
        .then(async () => {
          const contentToSave = latestContentRef.current;
          if (!document || document.content === contentToSave) {
            setSaveState("saved");
            return;
          }
          const response = await fetch(
            `/api/artifact?id=${artifact.documentId}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: artifact.title,
                content: contentToSave,
                kind: artifact.kind,
                chatId,
              }),
            },
          );
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
              message?: string;
            } | null;
            throw new Error(
              payload?.message ?? "Artifact changes could not be saved",
            );
          }
          setSaveError(null);
          setSaveState("saved");
          await mutateDocuments();
        })
        .catch((error) => {
          setSaveState("saved");
          setSaveError(
            error instanceof Error
              ? error.message
              : "Artifact changes could not be saved",
          );
        });
    },
    [artifact, chatId, document, mutateDocuments],
  );

  const debouncedHandleContentChange = useDebounceCallback(
    handleContentChange,
    2000,
  );

  const saveContent = useCallback(
    (updatedContent: string, debounce: boolean) => {
      if (document && updatedContent !== document.content) {
        if (debounce) {
          debouncedHandleContentChange(updatedContent);
        } else {
          handleContentChange(updatedContent);
        }
      }
    },
    [document, debouncedHandleContentChange, handleContentChange],
  );

  function getDocumentContentById(index: number) {
    if (!documents) {
      return "";
    }
    if (!documents[index]) {
      return "";
    }
    return documents[index].content ?? "";
  }

  const handleVersionChange = (type: "next" | "prev" | "toggle" | "latest") => {
    if (!documents) {
      return;
    }

    if (type === "latest") {
      setCurrentVersionIndex(documents.length - 1);
      setMode("edit");
    }

    if (type === "toggle") {
      setMode((currentMode) => (currentMode === "edit" ? "diff" : "edit"));
    }

    if (type === "prev") {
      if (currentVersionIndex > 0) {
        setCurrentVersionIndex((index) => index - 1);
      }
    } else if (type === "next" && currentVersionIndex < documents.length - 1) {
      setCurrentVersionIndex((index) => index + 1);
    }
  };

  const [isToolbarVisible, setIsToolbarVisible] = useState(false);

  /*
   * NOTE: if there are no documents, or if
   * the documents are being fetched, then
   * we mark it as the current version.
   */

  const isCurrentVersion =
    documents && documents.length > 0
      ? currentVersionIndex === documents.length - 1
      : true;

  const { width: windowWidth } = useWindowSize();
  const isMobile = windowWidth ? windowWidth < 768 : false;
  const prefersReducedMotion = useReducedMotion();

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind,
  );

  if (!artifactDefinition) {
    throw new Error("Artifact definition not found!");
  }

  useEffect(() => {
    if (artifact.documentId !== "init" && artifactDefinition.initialize) {
      artifactDefinition.initialize({
        documentId: artifact.documentId,
        setMetadata,
      });
    }
  }, [artifact.documentId, artifactDefinition, setMetadata]);

  useEffect(() => {
    if (!artifact.isVisible) return;

    const previousOverflow = window.document.body.style.overflow;
    const previousPaddingRight = window.document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - window.document.documentElement.clientWidth;

    window.document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      window.document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.document.body.style.paddingRight = previousPaddingRight;
    };
  }, [artifact.isVisible]);

  return (
    <AnimatePresence initial={false}>
      {artifact.isVisible && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex h-dvh w-full max-w-none flex-row overflow-hidden bg-background"
          role="dialog"
          aria-modal="true"
          aria-label={artifact.title || "Artifact"}
          data-testid="artifact"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0.01 : 0.24,
            ease: "easeOut",
          }}
        >
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="relative hidden h-dvh w-[clamp(18rem,30vw,26rem)] min-w-0 shrink-0 flex-col overflow-hidden border-r bg-muted/30 md:flex dark:bg-background"
            exit={{ opacity: 0, x: -12 }}
            initial={{ opacity: 0, x: -12 }}
            transition={{
              duration: prefersReducedMotion ? 0.01 : 0.22,
              ease: "easeOut",
            }}
          >
            <AnimatePresence>
              {!isCurrentVersion && (
                <motion.div
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 z-50 bg-zinc-900/50"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                />
              )}
            </AnimatePresence>

            <div className="flex h-full min-h-0 flex-col">
              <ArtifactMessages
                artifactStatus={artifact.status}
                chatId={chatId}
                isReadonly={isReadonly}
                messages={messages}
                sendMessage={sendMessage}
                setMessages={setMessages}
                status={status}
                votes={votes}
              />

              <div className="relative w-full shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
                <MultimodalInput
                  attachments={attachments}
                  chatId={chatId}
                  className="bg-background dark:bg-muted"
                  input={input}
                  messages={messages}
                  selectedVisibilityType={selectedVisibilityType}
                  sendMessage={sendMessage}
                  setAttachments={setAttachments}
                  setInput={setInput}
                  setMessages={setMessages}
                  status={status}
                  stop={stop}
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            animate={{ opacity: 1, x: 0, y: 0, borderRadius: 0 }}
            className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background md:border-l dark:bg-muted"
            exit={{ opacity: 0, y: 12 }}
            initial={{
              opacity: 0,
              x: isMobile ? 0 : 12,
              y: isMobile ? 12 : 0,
            }}
            transition={{
              duration: prefersReducedMotion ? 0.01 : 0.26,
              ease: "easeOut",
            }}
          >
            <div className="flex shrink-0 flex-row items-start justify-between gap-3 border-b px-3 py-3 sm:px-5">
              <div className="flex min-w-0 flex-1 flex-row items-start gap-3 sm:gap-4">
                <ArtifactCloseButton />

                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {artifact.title || "Untitled artifact"}
                  </div>

                  {saveState === "saving" ? (
                    <div className="text-xs text-muted-foreground sm:text-sm">
                      Saving changes...
                    </div>
                  ) : artifact.error ? (
                    <div className="truncate text-xs text-destructive sm:text-sm">
                      Artifact generation stopped
                    </div>
                  ) : artifact.status === "streaming" ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
                      <Loader2 className="size-3.5 animate-spin" />
                      Generating content...
                    </div>
                  ) : document ? (
                    <div className="truncate text-xs text-muted-foreground sm:text-sm">
                      {`Updated ${formatDistance(
                        new Date(document.createdAt),
                        new Date(),
                        {
                          addSuffix: true,
                        },
                      )}`}
                    </div>
                  ) : (
                    <div className="mt-2 h-3 w-32 animate-pulse rounded-md bg-muted-foreground/20" />
                  )}
                </div>
              </div>

              <ArtifactActions
                artifact={artifact}
                currentVersionIndex={currentVersionIndex}
                handleVersionChange={handleVersionChange}
                isCurrentVersion={isCurrentVersion}
                metadata={metadata}
                mode={mode}
                setMetadata={setMetadata}
              />
            </div>

            <div className="relative chat-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-background dark:bg-muted">
              {artifact.error ? (
                <ArtifactErrorState message={artifact.error} />
              ) : saveError ? (
                <ArtifactErrorState
                  message={saveError}
                  title="Couldn’t save artifact changes"
                />
              ) : documentError ? (
                <ArtifactErrorState
                  message="We couldn’t load the latest artifact version. Try closing and reopening it."
                  title="Artifact unavailable"
                />
              ) : artifact.status === "streaming" &&
                !artifact.content.trim() ? (
                <ArtifactStreamingState title={artifact.title} />
              ) : artifact.status === "idle" &&
                !artifact.content.trim() &&
                !document &&
                !isDocumentsFetching ? (
                <ArtifactEmptyState />
              ) : (
                <artifactDefinition.content
                  content={
                    isCurrentVersion
                      ? artifact.content
                      : getDocumentContentById(currentVersionIndex)
                  }
                  currentVersionIndex={currentVersionIndex}
                  getDocumentContentById={getDocumentContentById}
                  isCurrentVersion={isCurrentVersion}
                  isInline={false}
                  isLoading={isDocumentsFetching && !artifact.content}
                  metadata={metadata}
                  mode={mode}
                  onSaveContent={saveContent}
                  setMetadata={setMetadata}
                  status={artifact.status}
                  suggestions={[]}
                  title={artifact.title}
                />
              )}

              <AnimatePresence>
                {isCurrentVersion && (
                  <Toolbar
                    artifactKind={artifact.kind}
                    isToolbarVisible={isToolbarVisible}
                    sendMessage={sendMessage}
                    setIsToolbarVisible={setIsToolbarVisible}
                    setMessages={setMessages}
                    status={status}
                    stop={stop}
                  />
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {!isCurrentVersion && (
                <VersionFooter
                  currentVersionIndex={currentVersionIndex}
                  documents={documents}
                  handleVersionChange={handleVersionChange}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ArtifactStreamingState({ title }: { title: string }) {
  return (
    <div className="flex min-h-[min(28rem,60dvh)] w-full flex-col items-center justify-center gap-4 px-6 text-center sm:px-10">
      <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/50">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
      <div className="max-w-md space-y-1.5">
        <h2 className="font-medium">Generating {title || "your artifact"}</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          The artifact will appear here as the agent produces content. You can
          continue reading the conversation while it streams.
        </p>
      </div>
    </div>
  );
}

function ArtifactErrorState({
  message,
  title = "Artifact generation stopped",
}: {
  message: string;
  title?: string;
}) {
  return (
    <div className="flex min-h-[min(28rem,60dvh)] w-full flex-col items-center justify-center gap-4 px-6 text-center sm:px-10">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive">
        <AlertCircle className="size-5" />
      </div>
      <div className="max-w-lg space-y-1.5">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {message || "The artifact stream ended before content was generated."}
        </p>
      </div>
    </div>
  );
}

function ArtifactEmptyState() {
  return (
    <div className="flex min-h-[min(28rem,60dvh)] w-full flex-col items-center justify-center gap-2 px-6 text-center sm:px-10">
      <h2 className="font-medium">No artifact content yet</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        The artifact is ready, but no content was returned. Check the workflow
        activity in the conversation for details.
      </p>
    </div>
  );
}

export const Artifact = memo(PureArtifact, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) {
    return false;
  }
  if (!equal(prevProps.votes, nextProps.votes)) {
    return false;
  }
  if (prevProps.input !== nextProps.input) {
    return false;
  }
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }
  if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
    return false;
  }

  return true;
});
