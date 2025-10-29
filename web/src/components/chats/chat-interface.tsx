"use client";

import { useState, useEffect, useMemo } from "react";
import { useChat, useChatMessages, useSendMessage } from "@/hooks/chats";
import { useTriggerStream } from "@/hooks/chats/use-trigger-stream";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageAvatar,
} from "@/components/ai-elements/message";
import { Response } from "@/components/ai-elements/response";
import {
  PromptInput,
  PromptInputProvider,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputAttachments,
  PromptInputAttachment,
  PromptInputHeader,
  PromptInputFooter,
  PromptInputTools,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  PromptInputButton,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Branch, BranchMessages, BranchSelector, BranchPrevious, BranchNext, BranchPage } from "@/components/ai-elements/branch";
import { Sources, SourcesTrigger, SourcesContent, Source } from "@/components/ai-elements/sources";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Actions, Action } from "@/components/ai-elements/actions";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { Loader } from "@/components/ai-elements/loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  MessageCircleIcon, 
  AlertCircleIcon, 
  WifiOffIcon,
  Loader2Icon,
  BotIcon,
  UserIcon,
  RefreshCwIcon,
  CopyIcon,
  GlobeIcon,
  MicIcon
} from "lucide-react";
import { toast } from "sonner";
import type { ChatStatus } from "ai";

interface ChatInterfaceProps {
  chatId: string;
  className?: string;
}

// Available AI models
const models = [
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini" },
];

// Predefined suggestions
const suggestions = [
  "Create a D&D character sheet",
  "Generate a random encounter",
  "Help me plan a campaign",
  "Explain spell mechanics",
  "Create a dungeon map",
  "Generate NPC backstories"
];

export function ChatInterface({ chatId, className }: ChatInterfaceProps) {
  const { chat, isLoading: chatLoading, error: chatError, mutate: mutateChat } = useChat(chatId);
  const { messages, isLoading: messagesLoading, mutate: mutateMessages } = useChatMessages(chatId);
  const { sendMessage, isSending, currentRunId, clearRunId } = useSendMessage(chatId);
  const streamState = useTriggerStream({ chatId, runId: currentRunId || undefined });

  const [chatStatus, setChatStatus] = useState<ChatStatus | undefined>(undefined);
  const [selectedModel, setSelectedModel] = useState(models[0].id);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Process streaming parts to build coherent content from AI SDK streaming protocol
  const processStreamingParts = (parts: any[]) => {
    const processedParts: any[] = [];
    const textBlocks = new Map<string, { text: string; isComplete: boolean }>();
    let hasStreamingActivity = false;
    let isStreamingFinished = false;

    // Process parts in order to handle streaming protocol
    parts.forEach((part) => {
      switch (part.type) {
        case "start":
          hasStreamingActivity = true;
          break;
          
        case "start-step":
          hasStreamingActivity = true;
          break;
          
        case "text-start":
          if (part.id) {
            textBlocks.set(part.id, { text: "", isComplete: false });
          }
          hasStreamingActivity = true;
          break;
          
        case "text-delta":
          if (part.id && part.delta) {
            const existing = textBlocks.get(part.id) || { text: "", isComplete: false };
            existing.text += part.delta;
            textBlocks.set(part.id, existing);
          }
          hasStreamingActivity = true;
          break;
          
        case "text-end":
          if (part.id) {
            const existing = textBlocks.get(part.id);
            if (existing) {
              existing.isComplete = true;
              textBlocks.set(part.id, existing);
            }
          }
          break;
          
        case "finish-step":
          break;
          
        case "finish":
          isStreamingFinished = true;
          break;
          
        // Handle regular content parts
        case "text":
        case "reasoning":
        case "sources":
        case "tool-call":
          processedParts.push(part);
          break;
          
        default:
          // Pass through other parts as-is
          processedParts.push(part);
          break;
      }
    });

    // Convert accumulated text blocks to text parts
    textBlocks.forEach((block, id) => {
      if (block.text.trim()) {
        processedParts.push({
          type: "text",
          text: block.text,
          id: id,
          isComplete: block.isComplete
        });
      }
    });

    // Add streaming indicator if there's streaming activity but not finished
    if (hasStreamingActivity && !isStreamingFinished && textBlocks.size === 0) {
      processedParts.push({
        type: "streaming",
        isFinished: isStreamingFinished
      });
    }

    return processedParts;
  };

  // Update chat status based on stream state
  useEffect(() => {
    if (isSending) {
      setChatStatus("submitted");
    } else if (streamState.isProcessing) {
      setChatStatus("streaming");
    } else {
      setChatStatus(undefined);
    }
  }, [isSending, streamState.isProcessing]);

  // Refresh messages when processing completes
  useEffect(() => {
    const lastEvent = streamState.events[streamState.events.length - 1];
    if (lastEvent?.type === "processing_complete") {
      mutateMessages();
      mutateChat();
      clearRunId(); // Clear the run ID when processing is complete
    }
  }, [streamState.events, mutateMessages, mutateChat, clearRunId]);

  // Enhanced message handling
  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text?.trim()) return;
    
    setShowSuggestions(false);

    try {
      await sendMessage({
        content: message.text,
        files: message.files
      });
      
      // Optimistically update messages
      mutateMessages();
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setShowSuggestions(false);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard");
  };

  const handleRetry = () => {
    mutateChat();
    mutateMessages();
    clearRunId();
  };

  const renderMessageContent = (message: any) => {
    // Handle UI message from database (stored as uiMessage.parts)
    if (message.uiMessage?.parts && Array.isArray(message.uiMessage.parts)) {
      // Group and process streaming parts to build coherent content
      const processedParts = processStreamingParts(message.uiMessage.parts);
      
      return (
        <div className="space-y-4">
          {processedParts.map((part: any, partIndex: number) => {
            switch (part.type) {
              case "text":
                return (
                  <Response key={partIndex}>
                    {part.text}
                  </Response>
                );
                
              case "reasoning":
                return (
                  <Reasoning key={partIndex}>
                    <ReasoningTrigger>
                      <div className="flex items-center gap-2">
                        <span>Reasoning</span>
                        {part.duration && (
                          <Badge variant="secondary" className="text-xs">
                            {part.duration}ms
                          </Badge>
                        )}
                      </div>
                    </ReasoningTrigger>
                    <ReasoningContent>
                      {part.text}
                    </ReasoningContent>
                  </Reasoning>
                );
                
              case "sources":
                return (
                  <Sources key={partIndex}>
                    <SourcesTrigger count={part.sources?.length || 0}>
                      Sources ({part.sources?.length || 0})
                    </SourcesTrigger>
                    <SourcesContent>
                      {part.sources?.map((source: any, sourceIndex: number) => (
                        <Source key={sourceIndex} href={source.url} title={source.title}>
                          <div className="space-y-2">
                            <div className="font-medium">{source.title}</div>
                            <div className="text-sm text-muted-foreground">{source.description}</div>
                            <div className="text-xs text-muted-foreground">{source.url}</div>
                          </div>
                        </Source>
                      ))}
                    </SourcesContent>
                  </Sources>
                );
                
              case "tool-call":
                return (
                  <div key={partIndex} className="border rounded-lg p-4 bg-muted/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">{part.toolName}</Badge>
                      {part.result && (
                        <Badge variant="default">Completed</Badge>
                      )}
                    </div>
                    {part.args && (
                      <div className="text-sm mb-2">
                        <strong>Input:</strong>
                        <pre className="mt-1 text-xs bg-background p-2 rounded border overflow-x-auto">
                          {JSON.stringify(part.args, null, 2)}
                        </pre>
                      </div>
                    )}
                    {part.result && (
                      <div className="text-sm">
                        <strong>Output:</strong>
                        <pre className="mt-1 text-xs bg-background p-2 rounded border overflow-x-auto">
                          {typeof part.result === 'string' ? part.result : JSON.stringify(part.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
                
              case "streaming":
                return (
                  <div key={partIndex} className="flex items-center gap-2">
                    <Loader className="h-4 w-4" />
                    <span className="text-sm text-muted-foreground">
                      {part.isFinished ? "Processing complete" : "Processing..."}
                    </span>
                  </div>
                );
                
              // Skip rendering streaming control parts - they're handled by processStreamingParts
              case "start":
              case "start-step":
              case "text-start":
              case "text-delta":
              case "text-end":
              case "finish-step":
              case "finish":
                return null;
                
              default:
                // Only show unknown for truly unknown types, not streaming control types
                if (!["start", "start-step", "text-start", "text-delta", "text-end", "finish-step", "finish"].includes(part.type)) {
                  return (
                    <div key={partIndex} className="text-sm text-muted-foreground">
                      Unknown part type: {part.type}
                    </div>
                  );
                }
                return null;
            }
          })}
        </div>
      );
    }
    
    // Fallback to regular content
    return (
      <Response>
        {message.content}
      </Response>
    );
  };
  const displayMessages = useMemo(() => {
    const dbMessages = messages || [];
    const streamingMessages: any[] = [];

    // Build UI messages from streaming parts
    const uiMessageParts = new Map<string, any[]>();
    
    streamState.events.forEach(event => {
      if (event.type === "ui_message_part" && event.messagePart && event.agentId) {
        const messageKey = `streaming-${event.agentId}`;
        if (!uiMessageParts.has(messageKey)) {
          uiMessageParts.set(messageKey, []);
        }
        uiMessageParts.get(messageKey)!.push(event.messagePart);
      }
    });

    // Convert UI message parts to display messages
    uiMessageParts.forEach((parts, messageKey) => {
      const agentId = messageKey.replace('streaming-', '');
      const lastEvent = streamState.events
        .filter(e => e.agentId === agentId)
        .pop();

      if (lastEvent) {
        // Check if this message is already in the database
        const existsInDb = dbMessages.some(msg => 
          msg.agentId === agentId && 
          msg.uiMessage && 
          JSON.stringify(msg.uiMessage.parts) === JSON.stringify(parts)
        );

        if (!existsInDb) {
          streamingMessages.push({
            id: messageKey,
            agentId: agentId,
            uiMessage: { parts }, // Use modern uiMessage structure
            createdAt: lastEvent.timestamp,
            isStreaming: true,
          });
        }
      }
    });

    return [...dbMessages, ...streamingMessages].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [messages, streamState.events]);

  if (chatError) {
    return (
      <Card className={cn("flex flex-col h-full", className)}>
        <CardContent className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <AlertCircleIcon className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <h3 className="text-lg font-semibold">Failed to load chat</h3>
              <p className="text-muted-foreground">
                {chatError instanceof Error ? chatError.message : "An error occurred"}
              </p>
            </div>
            <Button onClick={handleRetry} variant="outline">
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chatLoading) {
    return (
      <Card className={cn("flex flex-col h-full", className)}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="flex-1 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!chat) {
    return (
      <Card className={cn("flex flex-col h-full", className)}>
        <CardContent className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <MessageCircleIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Chat not found</h3>
            <p className="text-muted-foreground">
              The chat you're looking for doesn't exist or you don't have access to it.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {chat.title}
              <Badge variant="secondary" className="text-xs">
                {chat.style}
              </Badge>
            </CardTitle>
            {chat.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {chat.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {streamState.isConnected ? (
              <Badge variant="outline" className="text-xs">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                <WifiOffIcon className="w-3 h-3 mr-1" />
                Disconnected
              </Badge>
            )}
            {streamState.currentAgent && (
              <Badge variant="secondary" className="text-xs">
                <BotIcon className="w-3 h-3 mr-1" />
                {streamState.currentAgent.name}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        {/* Stream Status */}
        {streamState.error && (
          <Alert className="m-4 mb-0">
            <AlertCircleIcon className="h-4 w-4" />
            <AlertDescription>{streamState.error}</AlertDescription>
          </Alert>
        )}

        {streamState.isProcessing && streamState.currentAgent && (
          <Alert className="m-4 mb-0">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            <AlertDescription>
              {streamState.currentAgent.name} is {streamState.currentAgent.status}...
            </AlertDescription>
          </Alert>
        )}

        {/* Messages */}
        <Conversation className="flex-1">
          <ConversationContent>
            {displayMessages.length === 0 ? (
              <ConversationEmptyState
                title="Start the conversation"
                description="Send a message to begin chatting with the agents"
                icon={<MessageCircleIcon className="h-8 w-8" />}
              />
            ) : (
              <div className="space-y-4">
                {displayMessages.map((msg, index) => {
                  const isUser = msg.userId;
                  const isAssistant = !msg.userId;
                  
                  return (
                    <Message
                      key={msg.id}
                      from={isUser ? "user" : "assistant"}
                      className="group"
                    >
                      <MessageAvatar
                        src={isUser ? "/default-user-avatar.png" : "/default-bot-avatar.png"}
                        name={isUser ? "You" : "Assistant"}
                      />
                      
                      <MessageContent variant="flat">
                        {/* Branch support for multiple versions */}
                        {msg.branches && msg.branches.length > 1 && (
                          <Branch>
                            <BranchSelector from={isUser ? "user" : "assistant"}>
                              <BranchPrevious />
                              <BranchPage>{msg.currentBranch || 1} of {msg.branches.length}</BranchPage>
                              <BranchNext />
                            </BranchSelector>
                            <BranchMessages>
                              {msg.branches.map((branch: any, branchIndex: number) => (
                                <div key={branchIndex} className={branchIndex === (msg.currentBranch || 0) ? "block" : "hidden"}>
                                  {renderMessageContent(branch)}
                                </div>
                              ))}
                            </BranchMessages>
                          </Branch>
                        )}
                        
                        {/* Single message content */}
                        {!msg.branches && renderMessageContent(msg)}
                        
                        {/* Streaming indicator */}
                        {msg.isStreaming && (
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <Loader2Icon className="h-3 w-3 animate-spin" />
                            Streaming...
                          </div>
                        )}
                        
                        {/* Message actions */}
                        {isAssistant && (
                          <Actions className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Action onClick={() => handleCopy(msg.content || '')}>
                              <CopyIcon className="h-4 w-4" />
                              Copy
                            </Action>
                            <Action onClick={() => handleRetry()}>
                              <RefreshCwIcon className="h-4 w-4" />
                              Retry
                            </Action>
                          </Actions>
                        )}
                      </MessageContent>
                    </Message>
                  );
                })}
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Input */}
        <div className="border-t p-4">
          <PromptInputProvider>
            <PromptInput
              onSubmit={handleSubmit}
              className="w-full"
            >
              <PromptInputHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="text-sm border rounded px-2 py-1"
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                    
                    <Button
                      variant={webSearchEnabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                    >
                      <GlobeIcon className="h-4 w-4" />
                      Web Search
                    </Button>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSuggestions(!showSuggestions)}
                  >
                    Suggestions
                  </Button>
                </div>
              </PromptInputHeader>

              <PromptInputBody>
                <PromptInputAttachments>
                  {(attachment) => (
                    <PromptInputAttachment
                      key={attachment.id}
                      data={attachment}
                    />
                  )}
                </PromptInputAttachments>
                <PromptInputTextarea
                  placeholder={
                    streamState.isProcessing
                      ? "Agents are processing..."
                      : "Ask about D&D rules, create characters, plan campaigns..."
                  }
                  disabled={streamState.isProcessing}
                />
              </PromptInputBody>

              <PromptInputFooter>
                <div className="flex items-center justify-between">
                  <PromptInputTools>
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>
                    
                    <PromptInputButton variant="outline" size="sm">
                      <MicIcon className="h-4 w-4" />
                    </PromptInputButton>
                  </PromptInputTools>
                  
                  <PromptInputSubmit status={chatStatus} />
                </div>
              </PromptInputFooter>
            </PromptInput>
            
            {/* Suggestions */}
            {showSuggestions && (
              <Suggestions className="mt-2">
                {suggestions.map((suggestion, index) => (
                  <Suggestion
                    key={index}
                    suggestion={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </Suggestion>
                ))}
              </Suggestions>
            )}
          </PromptInputProvider>
        </div>
      </CardContent>
    </Card>
  );
}