/**
 * Tool schemas and invocation context.
 */

import { Metadata } from '../../types/common';
import { ExecutionContext } from './context';

export interface ToolSchema {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema or Zod-compatible
    returns?: Record<string, unknown>;
    examples?: Array<Record<string, unknown>>;
    metadata?: Metadata;
}

export interface ToolCallContext extends ExecutionContext {
    toolName: string;
    toolCallId: string;
}

export interface ToolInvocationResult<TResult = unknown> {
    success: boolean;
    result?: TResult;
    error?: string;
    executionTimeMs?: number;
    metadata?: Metadata;
}
