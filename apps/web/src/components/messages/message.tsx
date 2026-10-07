"use client";
import { MessageContent } from "@/components/ai-elements/message";
import { Response } from "@/components/ai-elements/response";
import type { ArtifactKind } from "@/components/artifacts/artifact";
import { SparklesIcon } from "@/components/icons/icons";
import { PreviewAttachment } from "@/components/preview-attachment";
import { useArtifact } from "@/hooks/api/chats/use-artifact";
import type { ChatMessage } from "@/lib/types";
import { getSafeNavigationUrl } from "@/lib/urls/safe";
import { cn, sanitizeText } from "@/lib/utils";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Vote } from "@circulo-ai/db/schema";
import equal from "fast-deep-equal";
import { motion } from "framer-motion";
import { ArrowUpRight, ExternalLink, FileText } from "lucide-react";
import { memo, useState } from "react";
import { MessageActions } from "./message-actions";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
import { ToolCallPart } from "./tool-call-part";
import { WorkflowProcess } from "./workflow-process";

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  sendMessage,
  isReadonly,
  requiresScrollPadding,
  canEdit,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  canEdit: boolean;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file",
  );
  const completedArtifacts = message.parts.flatMap((part) => {
    if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") {
      return [];
    }
    const name = part.type.replace(/^tool-/, "");
    if (name !== "createDocument" && name !== "updateDocument") return [];
    const output = (part as unknown as { output?: unknown }).output;
    if (!output || typeof output !== "object") return [];
    const result = output as { id?: unknown; title?: unknown; kind?: unknown };
    if (
      typeof result.id !== "string" ||
      typeof result.title !== "string" ||
      !isArtifactKind(result.kind)
    ) {
      return [];
    }
    const action: "Created" | "Updated" =
      name === "updateDocument" ? "Updated" : "Created";
    return [
      {
        id: result.id,
        title: result.title,
        kind: result.kind,
        action,
      },
    ];
  });

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="group/message w-full"
      data-role={message.role}
      data-testid={`message-${message.role}`}
      initial={{ opacity: 0 }}
    >
      <div
        className={cn("flex w-full min-w-0 items-start gap-2 md:gap-3", {
          "justify-end": message.role === "user" && mode !== "edit",
          "justify-start": message.role === "assistant",
        })}
      >
        {message.role === "assistant" && (
          <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
            <SparklesIcon size={14} />
          </div>
        )}

        <div
          className={cn("flex max-w-full min-w-0 flex-col", {
            "gap-2 md:gap-4": message.parts?.some(
              (p) => p.type === "text" && p.text?.trim(),
            ),
            "min-h-96": message.role === "assistant" && requiresScrollPadding,
            "w-full":
              (message.role === "assistant" &&
                message.parts?.some(
                  (p) => p.type === "text" && p.text?.trim(),
                )) ||
              mode === "edit",
            "max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]":
              message.role === "user" && mode !== "edit",
          })}
        >
          {attachmentsFromMessage.length > 0 && (
            <div
              className="flex chat-scrollbar max-w-full flex-row justify-end gap-2 overflow-x-auto"
              data-testid={"message-attachments"}
            >
              {attachmentsFromMessage.map((attachment, index) => (
                <PreviewAttachment
                  attachment={{
                    name:
                      attachment.filename ??
                      (attachment as typeof attachment & { name?: string })
                        .name ??
                      "file",
                    contentType: attachment.mediaType,
                    url: attachment.url,
                    downloadUrl: (
                      attachment as typeof attachment & {
                        downloadUrl?: string;
                      }
                    ).downloadUrl,
                  }}
                  key={`${message.id}-attachment-${attachment.url || index}`}
                />
              ))}
            </div>
          )}

          <WorkflowProcess isReadonly={isReadonly} parts={message.parts} />

          {message.parts?.map((part, index) => {
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            if (type === "reasoning" && part.text?.trim().length > 0) {
              return (
                <MessageReasoning
                  isLoading={isLoading}
                  key={key}
                  reasoning={part.text}
                />
              );
            }

            if (type === "text") {
              if (mode === "view") {
                return (
                  <div key={key}>
                    <MessageContent
                      className={cn({
                        "w-fit max-w-full rounded-2xl px-3 py-2 text-right wrap-break-word text-white":
                          message.role === "user",
                        "bg-transparent px-0 py-0 text-left":
                          message.role === "assistant",
                      })}
                      data-testid="message-content"
                      style={
                        message.role === "user"
                          ? { backgroundColor: "#006cff" }
                          : undefined
                      }
                    >
                      <Response>{sanitizeText(part.text)}</Response>
                    </MessageContent>
                  </div>
                );
              }

              if (mode === "edit") {
                return (
                  <div
                    className="flex w-full flex-row items-start gap-3"
                    key={key}
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        sendMessage={sendMessage}
                        setMessages={setMessages}
                        setMode={setMode}
                      />
                    </div>
                  </div>
                );
              }
            }

            if (type === "source-url" || type === "source-document") {
              const source = part as unknown as {
                url?: string;
                title?: string;
                filename?: string;
                sourceId?: string;
              };
              const label =
                source.title ??
                source.filename ??
                source.url ??
                source.sourceId ??
                "Source";
              const safeUrl = getSafeNavigationUrl(source.url);

              return safeUrl ? (
                <a
                  className="inline-flex max-w-full min-w-0 items-center gap-1.5 self-start rounded-full border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  href={safeUrl}
                  key={key}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="size-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </a>
              ) : (
                <div
                  className="inline-flex max-w-full min-w-0 items-center gap-1.5 self-start rounded-full border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground"
                  key={key}
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </div>
              );
            }

            if (type.startsWith("data-workflow")) return null;
            if (type === "file" || type === "step-start") return null;

            if (type.startsWith("tool-") || type === "dynamic-tool") {
              return (
                <ToolCallPart
                  isReadonly={isReadonly}
                  key={
                    (part as unknown as { toolCallId?: string }).toolCallId ??
                    key
                  }
                  part={
                    part as unknown as Parameters<
                      typeof ToolCallPart
                    >[0]["part"]
                  }
                />
              );
            }

            return null;
          })}

          {completedArtifacts.length > 0 && (
            <div
              className="flex flex-col gap-2 pt-1"
              data-testid="message-artifacts"
            >
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <FileText className="size-3.5" />
                Artifacts from this message
              </div>
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                {completedArtifacts.map((artifact) => (
                  <MessageArtifactCard
                    artifact={artifact}
                    key={`${artifact.id}:${artifact.action}`}
                  />
                ))}
              </div>
            </div>
          )}

          {!isReadonly && (
            <MessageActions
              chatId={chatId}
              isLoading={isLoading}
              key={`action-${message.id}`}
              message={message}
              canEdit={canEdit}
              setMode={setMode}
              vote={vote}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
};

function isArtifactKind(value: unknown): value is ArtifactKind {
  return (
    value === "text" ||
    value === "code" ||
    value === "image" ||
    value === "sheet"
  );
}

function MessageArtifactCard({
  artifact,
}: {
  artifact: {
    id: string;
    title: string;
    kind: ArtifactKind;
    action: "Created" | "Updated";
  };
}) {
  const { setArtifact } = useArtifact();

  return (
    <button
      className="group flex min-w-0 items-center gap-3 rounded-2xl border bg-background/70 p-3 text-left transition-colors hover:bg-muted"
      onClick={() => {
        setArtifact((currentArtifact) => ({
          ...currentArtifact,
          documentId: artifact.id,
          title: artifact.title,
          kind: artifact.kind,
          content: "",
          status: "idle",
          error: undefined,
          isVisible: true,
        }));
      }}
      type="button"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <FileText className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{artifact.title}</div>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span>{artifact.action}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{artifact.kind}</span>
        </div>
      </div>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </button>
  );
}

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) return false;
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.isReadonly !== nextProps.isReadonly) return false;
    if (prevProps.message.id !== nextProps.message.id) {
      return false;
    }
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding) {
      return false;
    }
    if (prevProps.canEdit !== nextProps.canEdit) {
      return false;
    }
    // The AI SDK replaces the message snapshot for each streamed chunk. Use
    // that identity as the render boundary so nested part mutations cannot be
    // hidden by a deep-equality short circuit during live workflow updates.
    if (prevProps.message !== nextProps.message) {
      return false;
    }
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }

    return true;
  },
);

export const ThinkingMessage = () => {
  const role = "assistant";

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="group/message w-full"
      data-role={role}
      data-testid="message-assistant-loading"
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start justify-start gap-3">
        <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex w-full flex-col gap-2 md:gap-4">
          <div className="p-0 text-sm text-muted-foreground">Thinking...</div>
        </div>
      </div>
    </motion.div>
  );
};
