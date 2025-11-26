/**
 * Execution context that threads through adapters, middleware, and orchestrators.
 */

import { Metadata } from '../../types/common';

export type RuntimeEnvironment = 'edge' | 'node';

export interface ExecutionContext {
    requestId: string;
    conversationId?: string;
    taskId?: string;
    userId?: string;
    correlationId?: string;
    metadata?: Metadata;
    runtime: RuntimeEnvironment;
    trigger?: {
        type: string;
        id?: string;
        source?: string;
        payload?: Record<string, unknown>;
    };
}
