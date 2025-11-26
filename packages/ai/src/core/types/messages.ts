/**
 * Shared message and chat completion types used across adapters.
 */

import { Metadata } from '../../types/common';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type MediaType = 'text' | 'image' | 'audio' | 'video' | 'file';

export interface ChatContentPart {
    type: MediaType;
    text?: string;
    url?: string;
    mimeType?: string;
    data?: ArrayBuffer;
    metadata?: Metadata;
}

export interface ChatMessage {
    role: ChatRole;
    content: string | ChatContentPart[];
    toolCallId?: string;
    name?: string;
    parentMessageId?: string;
    threadId?: string;
    metadata?: Metadata;
}

export interface ChatToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    metadata?: Metadata;
}

export interface ChatCompletionUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    metadata?: Metadata;
}

export interface ChatCompletion {
    messages: ChatMessage[];
    toolCalls?: ChatToolCall[];
    finishReason: 'stop' | 'length' | 'tool_calls';
    usage?: ChatCompletionUsage;
    metadata?: Metadata;
}

export interface ChatOptions {
    model: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    stop?: string[] | string;
    metadata?: Metadata;
}
