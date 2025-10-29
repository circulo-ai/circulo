"use client";

import { useState, useEffect, useCallback } from "react";
import { useRealtimeRunWithStreams } from "@trigger.dev/react-hooks";
import { useTriggerAuth } from "@/providers/trigger-provider";
import type { ChatStreamState, StreamEvent } from "./types";
import type { processChatTask, STREAMS } from "@/trigger/process-chat";

interface UseTriggerStreamOptions {
  chatId: string | null;
  runId?: string;
}

export function useTriggerStream({ chatId, runId }: UseTriggerStreamOptions) {
  const { accessToken } = useTriggerAuth();
  const [state, setState] = useState<ChatStreamState>({
    isConnected: false,
    isProcessing: false,
    events: [],
  });

  // Use Trigger.dev realtime hook to subscribe to run updates and streams
  // Only if we have a runId (which means we're authenticated and have started a process)
  const { run, streams, error: runError } = useRealtimeRunWithStreams<typeof processChatTask, STREAMS>(
    runId || undefined, // Pass undefined if no runId to prevent the hook from trying to connect
    {
      accessToken,
    }
  );

  // Update connection state based on accessToken availability
  useEffect(() => {
    setState(prev => ({
      ...prev,
      isConnected: !!accessToken,
    }));
  }, [accessToken]);

  // Handle stream events from Trigger.dev
  useEffect(() => {
    // If no runId, clear processing state but keep connection status
    if (!runId || !chatId) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        events: [],
        currentAgent: undefined,
        error: undefined,
      }));
      return;
    }

    if (!run) return;

    // Update error state
    setState(prev => ({
      ...prev,
      error: runError ? String(runError) : undefined,
    }));

    // Handle run status changes
    const isProcessing = run.status === "QUEUED" || run.status === "DEQUEUED" || run.status === "WAITING" || run.status === "EXECUTING";
    setState(prev => ({
      ...prev,
      isProcessing,
    }));

    // Handle stream events if available
    if (streams && streams["chat-updates"]) {
      const streamEvents: StreamEvent[] = streams["chat-updates"].map((streamUpdate) => ({
        type: streamUpdate.type,
        agentId: streamUpdate.agentId,
        agentName: streamUpdate.agentName,
        content: streamUpdate.content,
        fullContent: streamUpdate.fullContent,
        messagePart: streamUpdate.messagePart,
        usage: streamUpdate.usage,
        status: streamUpdate.status,
        error: streamUpdate.error,
        timestamp: streamUpdate.timestamp,
      }));

      setState(prev => ({
        ...prev,
        events: streamEvents,
        currentAgent: streamEvents.length > 0 ? {
          id: streamEvents[streamEvents.length - 1].agentId || "",
          name: streamEvents[streamEvents.length - 1].agentName || "Unknown Agent",
          status: streamEvents[streamEvents.length - 1].status || "processing",
        } : undefined,
      }));
    }

  }, [run, streams, chatId, runId, runError]);

  const connect = useCallback(() => {
    // Connection is handled by useRealtimeRunWithStreams
    setState(prev => ({
      ...prev,
      isConnected: true,
    }));
  }, []);

  const disconnect = useCallback(() => {
    setState(prev => ({
      ...prev,
      isConnected: false,
      isProcessing: false,
      currentAgent: undefined,
    }));
  }, []);

  const clearEvents = useCallback(() => {
    setState(prev => ({
      ...prev,
      events: [],
      error: undefined,
    }));
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    clearEvents,
    run,
  };
}