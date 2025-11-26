/**
 * Plugin registry contracts to keep extensions type-safe.
 */

import { MiddlewareHooks } from './middleware';
import { AgentRuntime } from '../types/agents';
import { ToolAdapter } from './tool-adapter';
import { EventFilter, EventHandler } from '../types/events';

export type PluginKind = 'tool' | 'agent' | 'event' | 'middleware' | 'custom';

export interface PluginMeta {
    name: string;
    version: string;
    author?: string;
    description?: string;
    kind: PluginKind;
    dependsOn?: string[];
}

export interface PluginRegistry {
    registerTool(tool: ToolAdapter): void;
    registerAgent(agent: AgentRuntime): void;
    useMiddleware(middleware: MiddlewareHooks): void;
    onEvent(filter: EventFilter, handler: EventHandler): string;
}

export interface Plugin {
    meta: PluginMeta;
    setup(registry: PluginRegistry): Promise<void> | void;
    teardown?(): Promise<void> | void;
}
