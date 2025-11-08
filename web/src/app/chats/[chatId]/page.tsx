"use client";

import { useParams } from "next/navigation";
import { useMessages } from "@/hooks/use-messages";
import { useChatAgents } from "@/hooks/use-chat-agents";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { Fragment, useMemo, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Response } from "@/components/ai-elements/response";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

// Utility: convert stored DB message to UIMessage-like for rendering
function toUIMessages(dbMessages: Array<{ uiMessage: any; content: string; userId: string | null; agentId: string | null }>) {
  return dbMessages.map((m) => {
    if (m.uiMessage) return m.uiMessage;
    const role = m.userId ? "user" : "assistant";
    return {
      id: Math.random().toString(36).slice(2),
      role,
      parts: [{ type: "text", text: m.content }],
    };
  });
}

export default function ChatPage() {
  const params = useParams();
  const chatId = String(params?.chatId);
  const { messages: serverMessages, chat, isLoading } = useMessages(chatId);
  const { agents, isLoading: isLoadingAgents } = useChatAgents(chatId);
  const [input, setInput] = useState("");

  const transport = useMemo(
    () => new DefaultChatTransport({ api: `/api/v1/chats/${chatId}` }),
    [chatId]
  );

  const { messages: liveMessages, sendMessage, status } = useChat({ transport });

  const combined: UIMessage[] = useMemo(() => {
    const base = toUIMessages(serverMessages);
    const merged: UIMessage[] = [];
    const indexById = new Map<string, number>();

    // Add server messages first
    for (const m of base) {
      if (!indexById.has(m.id)) {
        indexById.set(m.id, merged.length);
        merged.push(m);
      }
    }

    // Merge live messages, replacing duplicates by id
    for (const m of liveMessages) {
      const idx = indexById.get(m.id);
      if (idx === undefined) {
        indexById.set(m.id, merged.length);
        merged.push(m);
      } else {
        merged[idx] = m;
      }
    }

    return merged;
  }, [serverMessages, liveMessages]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const hasText = Boolean(message.text) || Boolean(message.files?.length);
    if (!hasText) return;
    sendMessage({ text: message.text || "Sent with attachments", files: message.files });
    setInput("");
  };

  return (
    <div className="h-full">
      <div className="flex h-full flex-col">
        <div className="border-b p-4 space-y-2">
          <h1 className="text-lg font-semibold truncate">{chat?.title ?? "Chat"}</h1>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {isLoadingAgents && (
              <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-8 w-28 rounded-full" />
                ))}
              </div>
            )}
            {!isLoadingAgents && agents.length === 0 && (
              <div className="text-xs text-muted-foreground">No agents linked to this chat.</div>
            )}
            {!isLoadingAgents && agents.length > 0 && (
              <div className="flex items-center gap-2">
                {agents.map((a) => {
                  const initials = a.name?.trim()?.slice(0, 2).toUpperCase() || "AI";
                  const accent = a.color || "#64748b"; // slate-500 default
                  return (
                    <Tooltip key={a.id}>
                      <TooltipTrigger asChild>
                        <div
                          className="border hover:bg-accent/60 bg-background text-foreground flex items-center gap-2 rounded-full px-2 py-1 text-xs transition-colors"
                          style={{ borderColor: accent }}
                        >
                          <Avatar className="size-6" style={{ boxShadow: `0 0 0 2px ${accent}` }}>
                            <AvatarImage src={a.avatar || ""} alt={a.name || "Agent"} />
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <span className="max-w-[140px] truncate font-medium">{a.name}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="flex items-center gap-2">
                          <div
                            className="size-3 rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                          <div className="font-medium">{a.name}</div>
                        </div>
                        {a.description && (
                          <div className="mt-1 text-xs text-muted-foreground max-w-[260px]">
                            {a.description}
                          </div>
                        )}
                        {a.model && (
                          <div className="mt-1 text-[11px] text-muted-foreground">Model: {a.model}</div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <Conversation className="h-full">
          <ConversationContent>
            {isLoading && combined.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Loading messages…</div>
            )}
            {combined.map((message) => (
              <div key={message.id}>
                {message.parts.map((part: any, i: number) => {
                  switch (part.type) {
                    case "text":
                      return (
                        <Fragment key={`${message.id}-${i}`}>
                          <Message from={message.role}>
                            <MessageContent>
                              <Response>{part.text}</Response>
                            </MessageContent>
                          </Message>
                        </Fragment>
                      );
                    default:
                      return null;
                  }
                })}
              </div>
            ))}
            {status === "submitted" && <Loader />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <PromptInput onSubmit={handleSubmit} className="mt-4" globalDrop multiple>
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Type a message"
              onChange={(e) => setInput(e.target.value)}
              value={input}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
