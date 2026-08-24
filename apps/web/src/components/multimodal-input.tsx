"use client";

import {
  MentionItemType,
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { ArrowUpIcon, PaperclipIcon, StopIcon } from "@/components/icons/icons";
import { useUploadTaskManager } from "@/hooks/use-upload-task-manager";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { attachmentFromUploadTask } from "@/lib/attachments";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import type { UseChatHelpers } from "@ai-sdk/react";
import { Agent, ChatAgent } from "@circulo-ai/db";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import { AtSign, Mic, Square } from "lucide-react";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { PreviewAttachment } from "./preview-attachment";
import { SuggestedActions } from "./suggested-actions";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";
import { VoiceRecordingIndicator } from "./voice-recording-indicator";

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType,
  usage,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  selectedVisibilityType: VisibilityType;
  usage?: AppUsage;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const { width } = useWindowSize();

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    "",
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustHeight, localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  useEffect(() => {
    if (status === "ready" || status === "error") {
      submittingRef.current = false;
    }
  }, [status]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadManager = useUploadTaskManager({
    defaultStorageContext: "chat",
  });

  const [isReadingAttachments, setIsReadingAttachments] = useState(false);

  // Sync successful uploads into parent attachment state. Small files are also
  // carried as data URLs so the server can pass private local uploads to
  // OpenRouter without exposing a localhost-only URL to the provider.
  useEffect(() => {
    let active = true;
    const completedTasks = uploadManager.uploadTasks.filter(
      (task) => task.status === "success" && task.url,
    );
    setIsReadingAttachments(completedTasks.length > 0);
    void Promise.all(completedTasks.map(attachmentFromUploadTask)).then(
      (completedAttachments) => {
        if (!active) return;
        setAttachments((prev) => {
          const map = new Map(
            prev.map((attachment) => [attachment.url, attachment]),
          );
          completedAttachments.forEach((attachment) => {
            if (attachment) map.set(attachment.url, attachment);
          });
          return Array.from(map.values());
        });
        setIsReadingAttachments(false);
      },
    );
    return () => {
      active = false;
    };
  }, [uploadManager.uploadTasks, setAttachments]);

  const handleVoiceFile = useCallback(
    (file: File, transcript?: string) => {
      if (transcript?.trim()) {
        setInput(
          (current) =>
            `${current}${current.trim() ? " " : ""}${transcript.trim()}`,
        );
        return;
      }
      uploadManager.enqueueUploads([file], "chat");
    },
    [setInput, uploadManager],
  );
  const voiceRecorder = useVoiceRecorder({
    onRecordingComplete: handleVoiceFile,
    onRecordingError: (error) => toast.error(error.message),
  });

  const submitForm = useCallback(() => {
    if (
      submittingRef.current ||
      status !== "ready" ||
      uploadManager.hasUploadErrors ||
      (!input.trim() && attachments.length === 0)
    ) {
      return;
    }
    submittingRef.current = true;
    window.history.pushState({}, "", `/chat/${chatId}`);

    sendMessage({
      role: "user",
      parts: [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.dataUrl ?? attachment.url,
          filename: attachment.name,
          mediaType: attachment.contentType,
          downloadUrl: attachment.downloadUrl,
        })),
        {
          type: "text",
          text: input,
        },
      ],
    });

    uploadManager.resetAllUploadTasks();
    setAttachments([]);
    setLocalStorageInput("");
    resetHeight();
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    status,
    setInput,
    attachments,
    sendMessage,
    uploadManager,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    resetHeight,
  ]);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length > 0) {
        uploadManager.enqueueUploads(files, "chat");
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [uploadManager],
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/"),
      );

      if (imageItems.length === 0) return;

      // Prevent default paste behavior for images
      event.preventDefault();

      const files: File[] = [];
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (files.length > 0) {
        uploadManager.enqueueUploads(files, "chat");
      }
    },
    [uploadManager],
  );

  // Add paste event listener to textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return (
    <div
      className={cn(
        "relative flex w-full min-w-0 flex-1 flex-col items-stretch gap-3",
        className,
      )}
    >
      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadManager.uploadTasks.every(
          (task) =>
            task.status !== "queued" &&
            task.status !== "preparing" &&
            task.status !== "uploading",
        ) && (
          <SuggestedActions
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
            sendMessage={sendMessage}
          />
        )}

      <input
        className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <PromptInput
        className="mx-auto w-full max-w-3xl"
        onSubmit={(_message, event) => {
          event.preventDefault();
          if (status === "submitted" || status === "streaming") {
            toast.error("Please wait for the model to finish its response!");
          } else {
            submitForm();
          }
        }}
      >
        {(attachments.length > 0 ||
          uploadManager.uploadTasks.some(
            (item) =>
              item.status === "queued" ||
              item.status === "preparing" ||
              item.status === "uploading",
          )) && (
          <div
            className="flex max-w-full min-w-0 flex-row items-end gap-2 overflow-x-auto overscroll-contain"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  const match = uploadManager.uploadTasks.find(
                    (item) => item.url === attachment.url,
                  );
                  if (match) {
                    uploadManager.removeUploadTask(match.id);
                  } else {
                    setAttachments((current) =>
                      current.filter((a) => a.url !== attachment.url),
                    );
                  }
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            ))}

            {uploadManager.uploadTasks
              .filter(
                (item) =>
                  item.status === "queued" ||
                  item.status === "preparing" ||
                  item.status === "uploading" ||
                  item.status === "error",
              )
              .map((item) => (
                <PreviewAttachment
                  attachment={{
                    url: "",
                    name: item.file.name,
                    contentType: item.file.type,
                  }}
                  error={item.error}
                  isUploading={
                    item.status === "queued" ||
                    item.status === "preparing" ||
                    item.status === "uploading"
                  }
                  key={item.id}
                  onRemove={() => uploadManager.removeUploadTask(item.id)}
                  onRetry={
                    item.status === "error"
                      ? () => uploadManager.retryUploadTask(item.id)
                      : undefined
                  }
                />
              ))}
          </div>
        )}
        {voiceRecorder.isRecording ? (
          <VoiceRecordingIndicator
            elapsedSeconds={voiceRecorder.elapsedSeconds}
            interimTranscript={voiceRecorder.interimTranscript}
            onCancel={voiceRecorder.cancel}
            onStop={voiceRecorder.stop}
            transcript={voiceRecorder.transcript}
          />
        ) : (
          <>
            <div className="flex w-full min-w-0 flex-1 flex-row items-end gap-1 sm:gap-2">
              <PromptInputTextarea
                enableMentions
                enableCommands
                fetchMentions={async (query) => {
                  const response = await fetch(`/api/chat/${chatId}/agent`);
                  if (!response.ok) {
                    return [];
                  }

                  const json = (await response.json()) as
                    | Omit<ChatAgent & Agent, "agentId">[]
                    | { agents?: Omit<ChatAgent & Agent, "agentId">[] }
                    | {
                        data?: {
                          agents?: Omit<ChatAgent & Agent, "agentId">[];
                        };
                      };
                  const agents = Array.isArray(json)
                    ? json
                    : (("agents" in json
                        ? json.agents
                        : "data" in json
                          ? json.data?.agents
                          : undefined) ?? []);

                  return agents
                    .filter((agent) => agent.isEnabled !== false)
                    .filter((agent) =>
                      `${agent.name} ${agent.id}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((e) => {
                      return {
                        type: "mention",
                        name: e.name,
                        username: e.id,
                        icon: <AtSign />,
                      } satisfies MentionItemType;
                    });
                }}
                autoFocus
                className="block w-full min-w-0 flex-1 grow resize-none [scrollbar-width:none] border-0! border-none! bg-transparent px-2 py-2 text-sm leading-6 ring-0 outline-none [-ms-overflow-style:none] placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none [&::-webkit-scrollbar]:hidden"
                data-testid="multimodal-input"
                disableAutoResize={true}
                maxHeight={200}
                minHeight={44}
                onValueChange={setInput}
                placeholder="Send a message..."
                ref={textareaRef}
                value={input}
              />{" "}
              {/*<Context {...contextProps} />*/}
            </div>
            <PromptInputToolbar className="border-top-0! min-w-0 flex-wrap border-t-0! px-3 pt-0 pb-3 shadow-none sm:px-3 sm:pb-3 dark:border-0 dark:border-transparent!">
              <PromptInputTools className="min-w-0 gap-0 sm:gap-0.5">
                <AttachmentsButton
                  fileInputRef={fileInputRef}
                  status={status}
                />
                <Button
                  aria-label={
                    voiceRecorder.isRecording
                      ? "Stop recording"
                      : "Record voice"
                  }
                  className={cn(
                    "aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent",
                    voiceRecorder.isRecording && "text-red-500",
                  )}
                  disabled={
                    status === "submitted" ||
                    status === "streaming" ||
                    voiceRecorder.isStarting
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    if (voiceRecorder.isRecording) {
                      voiceRecorder.stop();
                    } else {
                      void voiceRecorder.start().catch(() => undefined);
                    }
                  }}
                  type="button"
                  variant="ghost"
                >
                  {voiceRecorder.isRecording ? (
                    <Square size={14} />
                  ) : (
                    <Mic size={14} />
                  )}
                </Button>
                {/*<ModelSelectorCompact*/}
                {/*  onModelChange={onModelChange}*/}
                {/*  selectedModelId={selectedModelId}*/}
                {/*/>*/}
              </PromptInputTools>

              {status === "submitted" ? (
                <StopButton setMessages={setMessages} stop={stop} />
              ) : (
                <PromptInputSubmit
                  className="size-8 rounded-full bg-teal-50 text-background transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
                  disabled={
                    (input.trim().length === 0 && attachments.length === 0) ||
                    isReadingAttachments ||
                    voiceRecorder.isRecording ||
                    uploadManager.hasUploadErrors ||
                    uploadManager.uploadTasks.some(
                      (item) =>
                        item.status === "queued" ||
                        item.status === "preparing" ||
                        item.status === "uploading",
                    )
                  }
                  status={status}
                  data-testid="send-button"
                >
                  <ArrowUpIcon size={14} />
                </PromptInputSubmit>
              )}
            </PromptInputToolbar>
          </>
        )}
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }

    return true;
  },
);

function PureAttachmentsButton({
  fileInputRef,
  status,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
}) {
  return (
    <Button
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={status === "submitted" || status === "streaming"}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="size-7 rounded-full bg-foreground p-1 text-background transition-colors duration-200 hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
