import type { Message } from "@/db/schema";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";

type StreamingMessage = {
  id: string;
  agentId: string;
  role: "assistant";
  content: string;
  uiMessages: UIMessage[];
  toolCalls: Array<{
    id: string;
    name: string;
    args: any;
    result?: any;
  }>;
};

export function useChat(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<
    Map<string, StreamingMessage>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load initial messages
  useEffect(() => {
    const loadMessages = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/v1/chats/${chatId}/messages`);
        const data = await response.json();
        if (data.success) {
          setMessages(data.data);
        }
      } catch (err) {
        console.error("Failed to load messages:", err);
        setError("Failed to load messages");
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [chatId]);

  // Set up SSE connection
  useEffect(() => {
    const eventSource = new EventSource(`/api/v1/chats/${chatId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === "message-start") {
          // Initialize a new streaming message
          setStreamingMessages((prev) => {
            const next = new Map(prev);
            next.set(data.messageId, {
              id: data.messageId,
              agentId: data.agentId,
              role: "assistant",
              content: "",
              uiMessages: [],
              toolCalls: [],
            });
            return next;
          });
        }

        if (data.type === "ui-messages") {
          const messagesBatch: UIMessage[] = Array.isArray(data.messages)
            ? (data.messages as UIMessage[])
            : [];

          setStreamingMessages((prev) => {
            const next = new Map(prev);
            const msg = next.get(data.messageId);
            if (!msg) return prev;

            // Append raw UIMessage batch for UI rendering; no interpretation here
            msg.uiMessages.push(...messagesBatch);

            next.set(data.messageId, msg);
            return next;
          });
        }

        if (data.type === "message-complete") {
          // Remove from streaming and refresh messages from server
          setStreamingMessages((prev) => {
            const next = new Map(prev);
            next.delete(data.messageId);
            return next;
          });

          // Refresh messages list to get the completed message
          fetch(`/api/v1/chats/${chatId}/messages`)
            .then((res) => res.json())
            .then((result) => {
              if (result.success) {
                setMessages(result.data);
              }
            })
            .catch((err) => console.error("Failed to refresh messages:", err));
        }
      } catch (err) {
        console.error("Failed to parse SSE data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
      // Attempt to reconnect on error
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [chatId]);

  const sendMessage = useCallback(
    async (content: string) => {
      try {
        const response = await fetch(`/api/v1/chats/${chatId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content }),
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error("Server returned error");
        }
      } catch (err) {
        console.error("Send message error:", err);
        throw err;
      }
    },
    [chatId],
  );

  // Convert streaming messages to array for rendering
  const streamingMessagesList = Array.from(streamingMessages.values());

  return {
    messages,
    streamingMessages: streamingMessagesList,
    isLoading,
    error,
    sendMessage,
  };
}
