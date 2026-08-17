"use client";

import { Artifact } from "@/components/artifacts/artifact";
import { ChatSettingsDialog } from "@/components/chat-settings-dialog";
import { Messages } from "@/components/messages/messages";
import { getChatHistoryPaginationKey } from "@/components/sidebar/sidebar-history";
import { useArtifactSelector } from "@/hooks/api/chats/use-artifact";
import { useChatVisibility } from "@/hooks/api/chats/use-chat-visibility";
import { ApiRequestError } from "@/lib/api/client";
import {
  clearCachePattern,
  fetchWithErrorHandlers,
  getFetcher,
  globalMutate,
} from "@/lib/swr";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { generateUUID } from "@/lib/utils";
import { useChatHistoryStore } from "@/stores/use-chat-history-store";
import { useChat } from "@ai-sdk/react";
import type { Vote } from "@circulo-ai/db/schema";
import { DefaultChatTransport } from "ai";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { useDataStreamActions } from "./data-stream-provider";
import { MultimodalInput } from "./multimodal-input";
import { PageSpinner } from "./page-spinner";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

const WORKFLOW_RUN_ID_KEY_PREFIX = "active-workflow-run-id:";

const ARTIFACT_STREAM_PART_TYPES: ReadonlySet<string> = new Set([
  "data-suggestion",
  "data-textDelta",
  "data-imageDelta",
  "data-sheetDelta",
  "data-codeDelta",
  "data-id",
  "data-title",
  "data-kind",
  "data-clear",
  "data-finish",
]);

export function Chat({
  id,
  initialMessages,
  initialVisibilityType,
  isReadonly,
  initialLastContext,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel?: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  initialLastContext?: AppUsage;
}) {
  const { isChatLoading } = useChatHistoryStore();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();
  const setDataStream = useDataStreamActions();
  const workflowRunStorageKey = `${WORKFLOW_RUN_ID_KEY_PREFIX}${id}`;

  const [input, setInput] = useState<string>("");
  const [usage, setUsage] = useState<AppUsage | undefined>(initialLastContext);
  const { data: chatMemberAccess } = useSWR<{
    humanMemberCount: number;
    canEditMessages: boolean;
  }>(isReadonly ? null : `/api/chat/${id}/members`, getFetcher(), {
    shouldRetryOnError: false,
    onError: () => undefined,
  });

  // Workflow orchestration state
  const [workflowStatus, setWorkflowStatus] = useState<{
    isRunning: boolean;
    currentPhase?: string;
    progress?: number;
  }>({ isRunning: false });

  const persistedWorkflowRunId = useMemo(() => {
    for (const message of [...initialMessages].reverse()) {
      const tracePart = message.parts?.find(
        (part) => part.type === "data-workflowTrace",
      ) as
        | {
            type: "data-workflowTrace";
            data?: { workflowId?: unknown; status?: unknown };
          }
        | undefined;
      if (
        (tracePart?.data?.status === "paused" ||
          tracePart?.data?.status === "running") &&
        typeof tracePart.data.workflowId === "string"
      ) {
        return tracePart.data.workflowId;
      }
    }
    return undefined;
  }, [initialMessages]);

  const activeWorkflowRunId = useMemo(() => {
    if (typeof window === "undefined") return;
    return (
      localStorage.getItem(workflowRunStorageKey) ?? persistedWorkflowRunId
    );
  }, [persistedWorkflowRunId, workflowRunStorageKey]);

  useEffect(() => {
    if (activeWorkflowRunId) {
      localStorage.setItem(workflowRunStorageKey, activeWorkflowRunId);
    }
  }, [activeWorkflowRunId, workflowRunStorageKey]);

  const handleChatEnd = useCallback(() => {
    localStorage.removeItem(workflowRunStorageKey);
    setWorkflowStatus({ isRunning: false });
  }, [workflowRunStorageKey]);

  const chatFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetchWithErrorHandlers(input, init);
      const workflowRunId = response.headers.get("x-workflow-run-id");
      if (workflowRunId) {
        localStorage.setItem(workflowRunStorageKey, workflowRunId);
        setWorkflowStatus({ isRunning: true, currentPhase: "starting" });
      }
      return response;
    },
    [workflowRunStorageKey],
  );

  const { messages, setMessages, sendMessage, status, stop, regenerate } =
    useChat<ChatMessage>({
      resume: !!activeWorkflowRunId,
      id,
      messages: initialMessages,
      generateId: generateUUID,

      transport: new DefaultChatTransport<ChatMessage>({
        api: "/api/chat",
        fetch: chatFetch,

        prepareSendMessagesRequest: (config) => {
          const message = config.messages.at(-1);
          if (!message) {
            throw new Error("No message to send");
          }

          return {
            ...config,
            body: {
              ...config.body,
              id: config.id,
              message: {
                ...message,
                id: message.id ?? generateUUID(),
              },
              visibility: visibilityType,
              agentIds: [],
            },
          };
        },

        prepareReconnectToStreamRequest: ({ api, ...rest }) => {
          const workflowRunId =
            localStorage.getItem(workflowRunStorageKey) ?? activeWorkflowRunId;
          if (!workflowRunId) {
            throw new Error("No active workflow run ID found");
          }
          return {
            ...rest,
            api: `/api/chat/${encodeURIComponent(workflowRunId)}/stream`,
          };
        },
      }),

      onData: (dataPart) => {
        // Only artifact parts belong in the artifact stream queue. Workflow,
        // usage, and message-control events are handled below or by the chat
        // message stream and must not cause artifact-store writes.
        if (ARTIFACT_STREAM_PART_TYPES.has(dataPart.type)) {
          setDataStream((ds) => [...ds, dataPart]);
        }

        // Handle different data types
        switch (dataPart.type) {
          case "data-usage":
            setUsage(dataPart.data);
            break;

          case "data-workflowStarted":
            setWorkflowStatus({
              isRunning: true,
              currentPhase: "started",
              progress: 0,
            });
            break;

          case "data-workflowClassification":
            setWorkflowStatus((prev) => ({
              ...prev,
              currentPhase: "classified",
              progress: 15,
            }));
            break;

          case "data-workflowPlan":
            setWorkflowStatus((prev) => ({
              ...prev,
              currentPhase: "planned",
              progress: 25,
            }));
            break;

          case "data-workflowAgentStarted":
            setWorkflowStatus((prev) => ({
              ...prev,
              currentPhase: `executing:${dataPart.data.agentName}`,
            }));
            break;

          case "data-workflowAgentProgress":
            break;

          case "data-workflowAgentCompleted":
            break;

          case "data-workflowAggregated":
            setWorkflowStatus((prev) => ({
              ...prev,
              currentPhase: "aggregated",
              progress: 95,
            }));
            break;

          case "data-workflowCompleted":
            setWorkflowStatus({
              isRunning: false,
              currentPhase: "completed",
              progress: 100,
            });
            handleChatEnd();
            break;
          case "data-workflowPaused":
            setWorkflowStatus({
              isRunning: true,
              currentPhase: "awaiting approval",
            });
            break;

          case "data-workflowError":
            setWorkflowStatus({
              isRunning: false,
              currentPhase: "error",
            });
            console.error("Workflow error:", dataPart.data);
            toast({
              type: "error",
              description: dataPart.data.error,
            });
            handleChatEnd();
            break;
        }
      },

      onFinish: async () => {
        mutate(unstable_serialize(getChatHistoryPaginationKey));
        await clearCachePattern(/\/api\/conversations.*/);
        await globalMutate(
          (key) =>
            typeof key === "string" && key.startsWith("/api/conversations"),
        );
      },

      onError: (error) => {
        console.error("Chat error:", error);
        handleChatEnd();

        toast({
          type: "error",
          description:
            error instanceof ApiRequestError
              ? error.message
              : "An unexpected error occurred",
        });
      },
    });

  const searchParams = useSearchParams();
  const query = searchParams.get("query");
  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  if (isChatLoading) return <PageSpinner />;

  return (
    <>
      <div className="overscroll-behavior-contain relative flex h-dvh min-w-0 touch-pan-y flex-col">
        {!isReadonly && <ChatSettingsDialog chatId={id} />}
        <Messages
          chatId={id}
          isArtifactVisible={isArtifactVisible}
          isReadonly={isReadonly}
          messages={messages}
          regenerate={regenerate}
          setMessages={setMessages}
          status={status}
          votes={votes}
          canEditMessages={chatMemberAccess?.canEditMessages ?? false}
        />

        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 px-2 pb-3 md:px-4 md:pb-4">
          {!isReadonly && (
            <MultimodalInput
              attachments={attachments}
              chatId={id}
              input={input}
              messages={messages}
              selectedVisibilityType={visibilityType}
              sendMessage={sendMessage}
              setAttachments={setAttachments}
              setInput={setInput}
              setMessages={setMessages}
              status={status}
              stop={stop}
              usage={usage}
            />
          )}
        </div>
      </div>

      <Artifact
        attachments={attachments}
        chatId={id}
        input={input}
        isReadonly={isReadonly}
        messages={messages}
        regenerate={regenerate}
        selectedVisibilityType={visibilityType}
        sendMessage={sendMessage}
        setAttachments={setAttachments}
        setInput={setInput}
        setMessages={setMessages}
        status={status}
        stop={stop}
        votes={votes}
      />
    </>
  );
}
