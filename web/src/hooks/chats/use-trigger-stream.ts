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
      const rawStreamEvents = streams["chat-updates"];
      
      // Process and deduplicate stream events
      const processedEvents: StreamEvent[] = [];
      const seenEvents = new Set<string>();
      
      // Sort raw events by timestamp to ensure proper ordering
      const sortedRawEvents = [...rawStreamEvents].sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      });
      
      sortedRawEvents.forEach((streamUpdate) => {
        // Create a unique key for deduplication based on content and timestamp
        const eventKey = `${streamUpdate.type}-${streamUpdate.agentId}-${streamUpdate.timestamp}-${
          streamUpdate.messagePart ? JSON.stringify(streamUpdate.messagePart) : streamUpdate.content || ''
        }`;
        
        // Skip duplicate events
        if (seenEvents.has(eventKey)) {
          return;
        }
        seenEvents.add(eventKey);
        
        // Validate timestamp format and convert to ISO string if needed
        let validTimestamp = streamUpdate.timestamp;
        try {
          const parsedTime = new Date(streamUpdate.timestamp);
          if (isNaN(parsedTime.getTime())) {
            validTimestamp = new Date().toISOString();
          } else {
            validTimestamp = parsedTime.toISOString();
          }
        } catch {
          validTimestamp = new Date().toISOString();
        }
        
        processedEvents.push({
          type: streamUpdate.type,
          agentId: streamUpdate.agentId,
          agentName: streamUpdate.agentName,
          content: streamUpdate.content,
          fullContent: streamUpdate.fullContent,
          messagePart: streamUpdate.messagePart,
          usage: streamUpdate.usage,
          status: streamUpdate.status,
          error: streamUpdate.error,
          timestamp: validTimestamp,
        });
      });

      // Update state with processed events
      setState(prev => {
        // Merge with existing events and remove duplicates
        const existingEventKeys = new Set(
          prev.events.map(e => `${e.type}-${e.agentId}-${e.timestamp}-${
            e.messagePart ? JSON.stringify(e.messagePart) : e.content || ''
          }`)
        );
        
        const newEvents = processedEvents.filter(e => {
          const eventKey = `${e.type}-${e.agentId}-${e.timestamp}-${
            e.messagePart ? JSON.stringify(e.messagePart) : e.content || ''
          }`;
          return !existingEventKeys.has(eventKey);
        });
        
        const allEvents = [...prev.events, ...newEvents].sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeA - timeB;
        });
        
        // Find the most recent agent status
        const latestAgentEvent = allEvents
          .filter(e => e.agentId && (e.status || e.type === 'ui_message_part'))
          .pop();
        
        return {
          ...prev,
          events: allEvents,
          currentAgent: latestAgentEvent ? {
            id: latestAgentEvent.agentId || "",
            name: latestAgentEvent.agentName || "Unknown Agent",
            status: latestAgentEvent.status || "processing",
          } : prev.currentAgent,
        };
      });
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