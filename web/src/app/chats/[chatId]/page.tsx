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
import { AgentManager } from "@/components/ai-elements/agent-manager";

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
  const { isLoading: isLoadingAgents } = useChatAgents();
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
        <div className="border-b p-4 space-y-4">
          <h1 className="text-lg font-semibold truncate">{chat?.title ?? "Chat"}</h1>
          <AgentManager />
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
