"use client";

import { Artifact } from "@/components/artifacts/artifact";
import { ChatHeader } from "@/components/chat-header";
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
import type { Vote } from "@/db/schema";
import { useArtifactSelector } from "@/hooks/api/chats/use-artifact";
import { ChatSDKError } from "@/lib/errors";
import {
  clearCachePattern,
  fetcher,
  fetchWithErrorHandlers,
  globalMutate,
} from "@/lib/swr";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { generateUUID } from "@/lib/utils";
import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai"; // THE KEY IMPORT!
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { useDataStream } from "./data-stream-provider";
import { MultimodalInput } from "./multimodal-input";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

export function Chat({
  id,
  initialMessages,
  initialChatModel = "gemini-2.5-flash",
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
  const { mutate } = useSWRConfig();
  const { setDataStream } = useDataStream();

  const [input, setInput] = useState<string>("");
  const [usage, setUsage] = useState<AppUsage | undefined>(initialLastContext);
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const [visibilityType, setVisibilityType] = useState(initialVisibilityType);

  const { messages, setMessages, sendMessage, status, stop, regenerate } =
    useChat<ChatMessage>({
      id,
      messages: initialMessages,
      generateId: generateUUID,

      // USE WORKFLOW TRANSPORT - This handles ALL streaming/resumption automatically!
      transport: new WorkflowChatTransport({
        api: "/api/chat",
        fetch: fetchWithErrorHandlers,

        // Prepare the request body
        prepareSendMessagesRequest: (config) => {
          return {
            ...config,
            body: {
              id,
              message: config.messages.at(-1),
              selectedChatModel: currentModelId,
              selectedVisibilityType: visibilityType,
              agentIds: [], // Get from your agent selector
            },
          };
        },

        // Optional: Track when chat completes
        onChatEnd: ({ chatId, chunkIndex }) => {
          console.log(`Chat ${chatId} completed with ${chunkIndex} chunks`);
        },
      }),

      // Handle data stream events
      onData: (dataPart) => {
        setDataStream((ds) => (ds ? [...ds, dataPart] : []));
        if (dataPart.type === "data-usage") {
          setUsage(dataPart.data);
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
        if (error instanceof ChatSDKError) {
          if (
            error.message?.includes("AI Gateway requires a valid credit card")
          ) {
            setShowCreditCardAlert(true);
          } else {
            toast({
              type: "error",
              description: error.message,
            });
          }
        }
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
    fetcher,
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  return (
    <>
      <div className="overscroll-behavior-contain flex h-dvh min-w-0 touch-pan-y flex-col">
        <ChatHeader
          chatId={id}
          isReadonly={isReadonly}
          selectedVisibilityType={initialVisibilityType}
        />

        <Messages
          chatId={id}
          isArtifactVisible={isArtifactVisible}
          isReadonly={isReadonly}
          messages={messages}
          regenerate={regenerate}
          selectedModelId={initialChatModel}
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
              onModelChange={setCurrentModelId}
              selectedModelId={currentModelId}
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
        selectedModelId={currentModelId}
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
