"use client";

import { Artifact } from "@/components/artifacts/artifact";
import { Messages } from "@/components/messages/messages";
import { getChatHistoryPaginationKey } from "@/components/sidebar/sidebar-history";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useArtifactSelector } from "@/hooks/api/chats/use-artifact";
import { useChatVisibility } from "@/hooks/api/chats/use-chat-visibility";
import { ApiRequestError } from "@/lib/api/client";
import {
  clearCachePattern,
  fetchWithErrorHandlers,
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
import { useDataStream } from "./data-stream-provider";
import { MultimodalInput } from "./multimodal-input";
import { PageSpinner } from "./page-spinner";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

const WORKFLOW_RUN_ID_KEY = "active-workflow-run-id";

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
  const { setDataStream } = useDataStream();

  const [input, setInput] = useState<string>("");
  const [usage, setUsage] = useState<AppUsage | undefined>(initialLastContext);
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);

  // Workflow orchestration state
  const [workflowStatus, setWorkflowStatus] = useState<{
    isRunning: boolean;
    currentPhase?: string;
    progress?: number;
  }>({ isRunning: false });

  const activeWorkflowRunId = useMemo(() => {
    if (typeof window === "undefined") return;
    return localStorage.getItem(WORKFLOW_RUN_ID_KEY) ?? undefined;
  }, []);

  const handleChatEnd = useCallback(() => {
    localStorage.removeItem(WORKFLOW_RUN_ID_KEY);
    setWorkflowStatus({ isRunning: false });
  }, []);

  const chatFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetchWithErrorHandlers(input, init);
      const workflowRunId = response.headers.get("x-workflow-run-id");
      if (workflowRunId) {
        localStorage.setItem(WORKFLOW_RUN_ID_KEY, workflowRunId);
        setWorkflowStatus({ isRunning: true, currentPhase: "starting" });
      }
      return response;
    },
    [],
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
          const workflowRunId = localStorage.getItem(WORKFLOW_RUN_ID_KEY);
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
        // Store data parts for components that need them
        setDataStream((ds) => (ds ? [...ds, dataPart] : []));

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
            console.log("Workflow started:", dataPart.data);
            break;

          case "data-workflowClassification":
            setWorkflowStatus((prev) => ({
              ...prev,
              currentPhase: "classified",
              progress: 15,
            }));
            console.log("Request classified:", dataPart.data);
            break;

          case "data-workflowPlan":
            setWorkflowStatus((prev) => ({
              ...prev,
              currentPhase: "planned",
              progress: 25,
            }));
            console.log("Execution plan:", dataPart.data);
            break;

          case "data-workflowAgentStarted":
            setWorkflowStatus((prev) => ({
              ...prev,
              currentPhase: `executing:${dataPart.data.agentName}`,
            }));
            console.log("Agent started:", dataPart.data);
            break;

          case "data-workflowAgentProgress":
            console.log("Agent progress:", dataPart.data);
            break;

          case "data-workflowAgentCompleted":
            console.log("Agent completed:", dataPart.data);
            break;

          case "data-workflowAggregated":
            setWorkflowStatus((prev) => ({
              ...prev,
              currentPhase: "aggregated",
              progress: 95,
            }));
            console.log("Results aggregated:", dataPart.data);
            break;

          case "data-workflowCompleted":
            setWorkflowStatus({
              isRunning: false,
              currentPhase: "completed",
              progress: 100,
            });
            console.log("Workflow completed:", dataPart.data);
            handleChatEnd();
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

        if (
          error instanceof ApiRequestError &&
          error.message?.includes("AI Gateway requires a valid credit card")
        ) {
          setShowCreditCardAlert(true);
          return;
        }

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
      <div className="overscroll-behavior-contain flex h-dvh min-w-0 touch-pan-y flex-col">
        <Messages
          chatId={id}
          isArtifactVisible={isArtifactVisible}
          isReadonly={isReadonly}
          messages={messages}
          regenerate={regenerate}
          setMessages={setMessages}
          status={status}
          votes={votes}
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

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate AI Gateway</AlertDialogTitle>
            <AlertDialogDescription>
              This application requires{" "}
              {process.env.NODE_ENV === "production" ? "the owner" : "you"} to
              activate Vercel AI Gateway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank",
                );
                window.location.href = "/";
              }}
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
