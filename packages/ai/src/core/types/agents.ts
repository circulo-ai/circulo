/**
 * Agent-facing contracts for inputs, outputs, and definitions.
 */

import { Metadata } from '../../types/common';
import { ChatMessage } from './messages';
import { ExecutionContext } from './context';

export interface AgentCapability {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
    metadata?: Metadata;
}

export interface AgentDefinition {
    id: string;
    name: string;
    description?: string;
    systemPrompt?: string;
    model?: string;
    capabilities?: AgentCapability[];
    toolNames?: string[];
    metadata?: Metadata;
}

export interface AgentInput {
    messages: ChatMessage[];
    goal?: string;
    attachments?: Array<{ id: string; type: string; uri?: string; metadata?: Metadata }>;
    metadata?: Metadata;
}

export interface PlanStep {
    id: string;
    description: string;
    toolName?: string;
    dependsOn?: string[];
    metadata?: Metadata;
}

export interface AgentPlan {
    steps: PlanStep[];
    rationale?: string;
    metadata?: Metadata;
}

export interface AgentActResult {
    completion: string;
    toolCalls?: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>;
    confidence?: number;
    metadata?: Metadata;
}

export interface AgentReflection {
    summary: string;
    followUps?: string[];
    metadata?: Metadata;
}

export interface AgentRuntime {
    readonly definition: AgentDefinition;
    plan?(input: AgentInput, ctx: ExecutionContext): Promise<AgentPlan>;
    act(input: AgentInput, ctx: ExecutionContext): Promise<AgentActResult>;
    reflect?(history: ChatMessage[], ctx: ExecutionContext): Promise<AgentReflection>;
}
