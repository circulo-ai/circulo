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
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    let completedMessageIds = new Set<string>();

    eventSource.onopen = () => {
      console.log("[SSE] Connected to chat stream:", chatId);
    };

    eventSource.onmessage = (e) => {
      if (!mountedRef.current) return;

      try {
        const data = JSON.parse(e.data);

        switch (data.type) {
          case "message-start": {
            const msg = data.message as StreamingMessage;
            
            setStreamingMessages((prev) => {
              // Deduplicate: check if already exists
              const exists = prev.some((m) => m.id === data.messageId);
              if (exists) {
                return prev;
              }
              return [...prev, msg];
            });
            break;
          }

          case "message-update": {
            const msg = data.message as StreamingMessage;
            
            setStreamingMessages((prev) => {
              const exists = prev.some((m) => m.id === data.messageId);
              
              if (exists) {
                // Update existing message
                return prev.map((m) => (m.id === data.messageId ? msg : m));
              } else {
                // Add if not exists (missed the start event)
                return [...prev, msg];
              }
            });
            break;
          }

          case "message-complete": {
            const messageId = data.messageId;
            const completedUIMessage = data.message as StreamingMessage;

            const finalMessageObject: Message = {
                id: messageId,
                chatId,
                userId: completedUIMessage.role === 'user' ? null : data.agentId, // need to infer/provide
                agentId: data.agentId || null,
                content: completedUIMessage.parts.map((p: any) => p.text || '').join('\n\n'), // Simplified content extraction
                tokenCount: data.usage?.totalTokens || 0,
                cost: data.cost ? String(data.cost) : '0',
                toolCalls: null, // need to retrieve/pass
                quotedMessageId: null, // need to retrieve/pass
                uiMessage: completedUIMessage,
                createdAt: new Date(),
            } as Message;

            // TODO: uncomment the code below
            // if (refreshTimeoutRef.current) {
            //   clearTimeout(refreshTimeoutRef.current);
            // }

            // refreshTimeoutRef.current = setTimeout(() => {
            //   if (!mountedRef.current) return;
              
            //   // Refresh messages once after all completions settle
            //   fetch(`/api/v1/chats/${chatId}/messages`)
            //     .then((res) => {
            //       if (!res.ok) {
            //         throw new Error(`Failed to refresh: ${res.statusText}`);
            //       }
            //       return res.json();
            //     })
            //     .then((result) => {
            //       if (mountedRef.current && result.success) {
            //         // 4. Update main messages
            //         setMessages(result.data);
                    
            //         // 5. Remove *all* streaming messages, since they are now in `messages`.
            //         setStreamingMessages([]); 
            //         // completedMessageIds.clear(); // not needed anymore
            //       }
            //     })
            //     .catch((err) => {
            //       console.error("Failed to refresh messages:", err);
            //     });
            // }, 500); // Wait 500ms for batch completions + allow UI to settle.

            break;
          }

          // case "message-complete": {
          //   const messageId = data.messageId;
            
          //   // Mark as completed
          //   completedMessageIds.add(messageId);
            
          //   // Remove from streaming immediately
          //   setStreamingMessages((prev) =>
          //     prev.filter((m) => m.id !== messageId)
          //   );

          //   // Debounce refresh: wait for multiple completions
          //   if (refreshTimeoutRef.current) {
          //     clearTimeout(refreshTimeoutRef.current);
          //   }

          //   refreshTimeoutRef.current = setTimeout(() => {
          //     if (!mountedRef.current) return;
              
          //     // Refresh messages once after all completions settle
          //     fetch(`/api/v1/chats/${chatId}/messages`)
          //       .then((res) => {
          //         if (!res.ok) {
          //           throw new Error(`Failed to refresh: ${res.statusText}`);
          //         }
          //         return res.json();
          //       })
          //       .then((result) => {
          //         if (mountedRef.current && result.success) {
          //           setMessages(result.data);
          //           completedMessageIds.clear();
          //         }
          //       })
          //       .catch((err) => {
          //         console.error("Failed to refresh messages:", err);
          //       });
          //   }, 500); // Wait 500ms for batch completions
            
          //   break;
          // }

          case "connected": {
            console.log("[SSE] Connection acknowledged");
            break;
          }

          default:
            console.warn("[SSE] Unknown event type:", data.type);
        }
      } catch (err) {
        console.error("[SSE] Failed to parse event data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("[SSE] Connection error:", err, {
        readyState: eventSource.readyState,
      });
      // Don't manually close - EventSource auto-reconnects
    };

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      eventSource.close();
      eventSourceRef.current = null;
      completedMessageIds.clear();
    };
  }, [chatId]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
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

        // User message and agent responses will appear via SSE
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        const errorMessage =
          err instanceof Error ? err.message : "Failed to send message";
        console.error("[Chat] Send message error:", err);
        setError(errorMessage);

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
    [chatId]
  );

  return {
    messages,
    streamingMessages,
    isLoading,
    error,
    sendMessage,
    isSending,
  };
}