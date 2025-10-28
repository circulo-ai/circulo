import type { Message } from "@/db/schema";
import type { UIMessage, UIMessageChunk } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";

type StreamingSessionMessage = UIMessage & {
  agentId?: string;
};

export function useChat(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<
    Map<string, StreamingSessionMessage[]>
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
            next.set(data.messageId, [
              {
                id: data.messageId,
                role: "assistant",
                parts: [],
                // attach agent id for UI display convenience
                agentId: data.agentId,
              },
            ]);
            return next;
          });
        }

        if (data.type === "ui-message-chunk") {
          const chunk = data.chunk as UIMessageChunk;

          // Update streaming message with new chunk
          setStreamingMessages((prev) => {
            const next = new Map(prev);
            const messages = next.get(data.messageId);
            if (!messages || messages.length === 0) return prev;

            const assistantMsg = messages[0];
            const parts = Array.isArray(assistantMsg.parts)
              ? assistantMsg.parts
              : [];

            switch (chunk.type) {
              case "text-start": {
                // begin a new text part if last is not text
                const last = parts[parts.length - 1];
                if (!last || last.type !== "text") {
                  parts.push({ type: "text", text: "" });
                }
                break;
              }
              case "text-delta": {
                const last = parts[parts.length - 1];
                if (!last || last.type !== "text") {
                  parts.push({ type: "text", text: chunk.delta });
                } else {
                  last.text += chunk.delta;
                }
                break;
              }
              case "tool-input-available": {
                parts.push({
                  type: "dynamic-tool",
                  toolName: (chunk as any).toolName,
                  state: "input-available",
                  input: (chunk as any).input,
                  toolCallId: (chunk as any).toolCallId,
                } as any);
                break;
              }
              case "tool-output-available": {
                // Try to find matching tool input by toolCallId and update it
                const callId = (chunk as any).toolCallId;
                let updated = false;
                for (let i = parts.length - 1; i >= 0; i--) {
                  const p = parts[i] as any;
                  if (
                    p &&
                    p.type === "dynamic-tool" &&
                    p.toolCallId === callId
                  ) {
                    p.state = "output-available";
                    p.output = (chunk as any).output;
                    p.errorText = undefined;
                    updated = true;
                    break;
                  }
                }

                if (!updated) {
                  // Fallback: append a new output part without toolName
                  parts.push({
                    type: "dynamic-tool",
                    state: "output-available",
                    output: (chunk as any).output,
                    errorText: undefined,
                    toolCallId: callId,
                  } as any);
                }
                break;
              }
              default: {
                // ignore other chunk types for now
                break;
              }
            }

            assistantMsg.parts = parts;
            messages[0] = assistantMsg;
            next.set(data.messageId, messages);
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

        // Immediately refresh messages so the user's message appears
        try {
          const res = await fetch(`/api/v1/chats/${chatId}/messages`);
          const data = await res.json();
          if (data.success) {
            setMessages(data.data);
          }
        } catch (err) {
          console.error("Failed to refresh messages after send:", err);
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
