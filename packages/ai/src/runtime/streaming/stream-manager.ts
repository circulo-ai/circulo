/**
 * Streaming helpers for SSE, WebSockets, and progressive results
 */

import { AgentExecutionResult, ChatCompletion } from "../../index.node";

export type StreamEvent<T = unknown> = {
    id?: string;
    event?: string;
    data: T;
    retry?: number;
};

/**
 * Server-Sent Events encoder for streaming responses
 */
export class SSEEncoder {
    private controller?: ReadableStreamDefaultController<Uint8Array>;
    private encoder = new TextEncoder();
    private eventId = 0;

    createStream(): ReadableStream<Uint8Array> {
        return new ReadableStream({
            start: (controller) => {
                this.controller = controller;
            },
            cancel: () => {
                this.controller = undefined;
            },
        });
    }

    send<T>(event: StreamEvent<T>): void {
        if (!this.controller) {
            throw new Error('Stream not initialized');
        }

        const lines: string[] = [];

        if (event.id) {
            lines.push(`id: ${event.id}`);
        } else {
            lines.push(`id: ${++this.eventId}`);
        }

        if (event.event) {
            lines.push(`event: ${event.event}`);
        }

        if (event.retry) {
            lines.push(`retry: ${event.retry}`);
        }

        const dataStr = typeof event.data === 'string'
            ? event.data
            : JSON.stringify(event.data);

        // Handle multi-line data
        dataStr.split('\n').forEach(line => {
            lines.push(`data: ${line}`);
        });

        lines.push(''); // Empty line to separate events
        lines.push(''); // Double newline terminates event

        const message = lines.join('\n');
        this.controller.enqueue(this.encoder.encode(message));
    }

    close(): void {
        if (this.controller) {
            this.controller.close();
            this.controller = undefined;
        }
    }

    error(error: Error): void {
        if (this.controller) {
            this.controller.error(error);
            this.controller = undefined;
        }
    }
}

/**
 * WebSocket manager for bidirectional streaming
 */
export class WebSocketManager {
    private ws?: WebSocket;
    private messageHandlers = new Map<string, Set<(data: any) => void>>();
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 5;

    constructor(
        private url: string,
        private readonly options: {
            reconnect?: boolean;
            reconnectDelayMs?: number;
            onOpen?: () => void;
            onClose?: () => void;
            onError?: (error: Event) => void;
        } = {}
    ) {
        this.options.reconnect ??= true;
        this.options.reconnectDelayMs ??= 3000;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                this.reconnectAttempts = 0;
                this.options.onOpen?.();
                resolve();
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    const handlers = this.messageHandlers.get(message.type) ?? new Set();
                    handlers.forEach(handler => handler(message.data));
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };

            this.ws.onerror = (error) => {
                this.options.onError?.(error);
                reject(error);
            };

            this.ws.onclose = () => {
                this.options.onClose?.();
                if (this.options.reconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    setTimeout(() => {
                        this.connect().catch(console.error);
                    }, this.options.reconnectDelayMs);
                }
            };
        });
    }

    send(type: string, data: any): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }
        this.ws.send(JSON.stringify({ type, data }));
    }

    on(type: string, handler: (data: any) => void): () => void {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, new Set());
        }
        this.messageHandlers.get(type)!.add(handler);

        // Return unsubscribe function
        return () => {
            this.messageHandlers.get(type)?.delete(handler);
        };
    }

    close(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}

/**
 * Progressive stream aggregator for LLM completions
 */
export class CompletionAggregator {
    private accumulated: Partial<ChatCompletion> = { messages: [] };
    private currentMessageIndex = 0;

    add(chunk: ChatCompletion): ChatCompletion {
        // Merge messages
        if (chunk.messages && chunk.messages.length > 0) {
            const lastChunkMsg = chunk.messages[chunk.messages.length - 1];

            if (!this.accumulated.messages) {
                this.accumulated.messages = [];
            }

            // If we have messages and the last one matches role, append content
            if (this.accumulated.messages.length > 0) {
                const lastAccMsg = this.accumulated.messages[this.accumulated.messages.length - 1];

                if (lastAccMsg.role === lastChunkMsg.role) {
                    // Append content
                    if (typeof lastAccMsg.content === 'string' && typeof lastChunkMsg.content === 'string') {
                        lastAccMsg.content += lastChunkMsg.content;
                    } else {
                        // For complex content, just replace
                        lastAccMsg.content = lastChunkMsg.content;
                    }
                } else {
                    // Different role, add as new message
                    this.accumulated.messages.push({ ...lastChunkMsg });
                }
            } else {
                // First message
                this.accumulated.messages.push({ ...lastChunkMsg });
            }
        }

        // Merge tool calls
        if (chunk.toolCalls) {
            this.accumulated.toolCalls = [
                ...(this.accumulated.toolCalls ?? []),
                ...chunk.toolCalls,
            ];
        }

        // Update finish reason (last wins)
        if (chunk.finishReason) {
            this.accumulated.finishReason = chunk.finishReason;
        }

        // Accumulate usage
        if (chunk.usage) {
            if (!this.accumulated.usage) {
                this.accumulated.usage = { ...chunk.usage };
            } else {
                this.accumulated.usage.promptTokens += chunk.usage.promptTokens ?? 0;
                this.accumulated.usage.completionTokens += chunk.usage.completionTokens ?? 0;
                this.accumulated.usage.totalTokens += chunk.usage.totalTokens ?? 0;
            }
        }

        // Merge metadata
        if (chunk.metadata) {
            this.accumulated.metadata = {
                ...this.accumulated.metadata,
                ...chunk.metadata,
            };
        }

        return this.accumulated as ChatCompletion;
    }

    getAccumulated(): ChatCompletion {
        return this.accumulated as ChatCompletion;
    }

    reset(): void {
        this.accumulated = { messages: [] };
        this.currentMessageIndex = 0;
    }
}

/**
 * Stream orchestration results progressively
 */
export async function* streamOrchestration(
    execute: () => Promise<AgentExecutionResult[]>,
    onProgress?: (result: AgentExecutionResult) => void
): AsyncIterable<AgentExecutionResult> {
    const results = await execute();

    for (const result of results) {
        onProgress?.(result);
        yield result;

        // Small delay to allow UI updates
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

/**
 * Merge multiple async iterables into one
 */
export async function* mergeStreams<T>(
    ...streams: AsyncIterable<T>[]
): AsyncIterable<T> {
    const iterators = streams.map(stream => stream[Symbol.asyncIterator]());
    const pending = new Map<number, Promise<IteratorResult<T>>>();

    // Start all iterators
    iterators.forEach((iter, index) => {
        pending.set(index, iter.next());
    });

    while (pending.size > 0) {
        // Race all pending promises
        const entries = Array.from(pending.entries());
        const { index, result } = await Promise.race(
            entries.map(async ([index, promise]) => ({
                index,
                result: await promise,
            }))
        );

        if (result.done) {
            pending.delete(index);
        } else {
            yield result.value;
            // Queue next value from this iterator
            pending.set(index, iterators[index].next());
        }
    }
}

/**
 * Buffer stream events and flush periodically
 */
export class StreamBuffer<T> {
    private buffer: T[] = [];
    private flushTimer?: NodeJS.Timeout;

    constructor(
        private readonly onFlush: (items: T[]) => void | Promise<void>,
        private readonly options: {
            maxSize?: number;
            flushIntervalMs?: number;
        } = {}
    ) {
        this.options.maxSize ??= 10;
        this.options.flushIntervalMs ??= 100;

        if (this.options.flushIntervalMs > 0) {
            this.startTimer();
        }
    }

    add(item: T): void {
        this.buffer.push(item);

        if (this.buffer.length >= this.options.maxSize!) {
            this.flush();
        }
    }

    private startTimer(): void {
        this.flushTimer = setInterval(() => {
            if (this.buffer.length > 0) {
                this.flush();
            }
        }, this.options.flushIntervalMs);
    }

    async flush(): Promise<void> {
        if (this.buffer.length === 0) return;

        const items = this.buffer.splice(0);
        await this.onFlush(items);
    }

    async close(): Promise<void> {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        await this.flush();
    }
}
