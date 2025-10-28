import type { Message } from "@/db/schema";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";

type StreamingMessage = UIMessage & { agentId?: string };

interface UseChatOptions {
  chatId: string;
  onError?: (error: Error) => void;
}

interface UseChatReturn {
  messages: Message[];
  streamingMessages: StreamingMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  isSending: boolean;
}

export function useChat({ chatId, onError }: UseChatOptions): UseChatReturn {
  // State management
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<
    Map<string, StreamingMessage>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Refs for cleanup and tracking
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const optimisticUserIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // Load initial messages
  useEffect(() => {
    let cancelled = false;

    const loadMessages = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/v1/chats/${chatId}/messages`);

        if (!response.ok) {
          throw new Error(`Failed to load messages: ${response.statusText}`);
        }

        const data = await response.json();

        if (cancelled) return;

        if (data.success) {
          setMessages(data.data);
        } else {
          throw new Error(data.error || "Failed to load messages");
        }
      } catch (err) {
        if (cancelled) return;

        const errorMessage =
          err instanceof Error ? err.message : "Failed to load messages";
        console.error("Failed to load messages:", err);
        setError(errorMessage);

        if (onError && err instanceof Error) {
          onError(err);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // Set up SSE connection
  useEffect(() => {
    const eventSource = new EventSource(`/api/v1/chats/${chatId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (e) => {
      if (!mountedRef.current) return;

      try {
        const data = JSON.parse(e.data);

        switch (data.type) {
          case "message-start": {
            const msg = data.message as StreamingMessage;
            setStreamingMessages((prev) => {
              const next = new Map(prev);
              next.set(data.messageId, msg);
              return next;
            });
            break;
          }

          case "message-update": {
            const msg = data.message as StreamingMessage;
            setStreamingMessages((prev) => {
              const next = new Map(prev);
              next.set(data.messageId, msg);
              return next;
            });
            break;
          }

          case "message-complete": {
            setStreamingMessages((prev) => {
              const next = new Map(prev);
              next.delete(data.messageId);
              return next;
            });

            // Refresh messages list to get the completed message
            fetch(`/api/v1/chats/${chatId}/messages`)
              .then((res) => {
                if (!res.ok) {
                  throw new Error(
                    `Failed to refresh messages: ${res.statusText}`,
                  );
                }
                return res.json();
              })
              .then((result) => {
                if (mountedRef.current && result.success) {
                  setMessages(result.data);
                }
              })
              .catch((err) => {
                console.error("Failed to refresh messages:", err);
                if (onError && err instanceof Error) {
                  onError(err);
                }
              });
            break;
          }

          default:
            console.warn("Unknown SSE event type:", data.type);
        }
      } catch (err) {
        console.error("Failed to parse SSE data:", err);
        if (onError && err instanceof Error) {
          onError(err);
        }
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
      eventSource.close();

      if (mountedRef.current && onError) {
        onError(new Error("Stream connection lost"));
      }
    };

    return () => {
      eventSource.close();
    };
  }, [chatId, onError]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      // Abort any ongoing requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Close SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) {
        return;
      }

      // Abort any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        setIsSending(true);
        setError(null);

        // Add optimistic user message
        const optimisticId = `optimistic-user-${Date.now()}`;
        optimisticUserIdRef.current = optimisticId;

        const optimisticMsg: StreamingMessage = {
          id: optimisticId,
          role: "user",
          parts: [
            {
              type: "text",
              text: content,
            },
          ],
        };

        setStreamingMessages((prev) => {
          const next = new Map(prev);
          next.set(optimisticId, optimisticMsg);
          return next;
        });

        const response = await fetch(`/api/v1/chats/${chatId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to send message: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Server returned error");
        }

        // Refresh messages to show the user's message
        try {
          const res = await fetch(`/api/v1/chats/${chatId}/messages`, {
            signal: abortController.signal,
          });

          if (!res.ok) {
            throw new Error(`Failed to refresh messages: ${res.statusText}`);
          }

          const data = await res.json();

          if (mountedRef.current && data.success) {
            setMessages(data.data);
          }
        } catch (err) {
          if (err instanceof Error && err.name !== "AbortError") {
            console.error("Failed to refresh messages after send:", err);
          }
        }

        // Remove optimistic message
        setStreamingMessages((prev) => {
          const next = new Map(prev);
          if (optimisticUserIdRef.current) {
            next.delete(optimisticUserIdRef.current);
          }
          return next;
        });

        optimisticUserIdRef.current = null;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Request was aborted, ignore
          return;
        }

        const errorMessage =
          err instanceof Error ? err.message : "Failed to send message";
        console.error("Send message error:", err);
        setError(errorMessage);

        // Remove optimistic message on error
        setStreamingMessages((prev) => {
          const next = new Map(prev);
          if (optimisticUserIdRef.current) {
            next.delete(optimisticUserIdRef.current);
          }
          return next;
        });

        optimisticUserIdRef.current = null;

        if (onError && err instanceof Error) {
          onError(err);
        }

        throw err;
      } finally {
        if (mountedRef.current) {
          setIsSending(false);
        }

        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [chatId, onError],
  );

  // Convert streaming messages to array for rendering
  const streamingMessagesList = Array.from(streamingMessages.values());

  return {
    messages,
    streamingMessages: streamingMessagesList,
    isLoading,
    error,
    sendMessage,
    isSending,
  };
}
