/**
 * Lightweight registry that wires plugins into adapters, orchestrators, and middleware pipelines.
 */

import { Plugin, PluginRegistry as PluginRegistryContract } from '../core/abstractions/plugin';
import { MiddlewarePipeline } from '../runtime/middleware/pipeline';
import { ToolRegistry } from '../runtime/adapters/tools/registry';
import { AgentRuntime } from '../core/types/agents';
import { ToolAdapter } from '../core/abstractions/tool-adapter';
import { EventFilter, EventHandler } from '../core/types/events';
import { MiddlewareHooks } from '../core/abstractions/middleware';

export class PluginRegistry implements PluginRegistryContract {
    private readonly tools: ToolRegistry;
    private readonly agents: Map<string, AgentRuntime>;
    private readonly middleware: MiddlewarePipeline;
    private readonly events: Array<{ filter: EventFilter; handler: EventHandler }> = [];
    private readonly plugins: Map<string, Plugin> = new Map();

    constructor(dependencies: { tools: ToolRegistry; agents: Map<string, AgentRuntime>; middleware: MiddlewarePipeline }) {
        this.tools = dependencies.tools;
        this.agents = dependencies.agents;
        this.middleware = dependencies.middleware;
    }

    registerTool(tool: ToolAdapter): void {
        this.tools.register(tool);
    }

    registerAgent(agent: AgentRuntime): void {
        this.agents.set(agent.definition.id, agent);
    }

    useMiddleware(middleware: MiddlewareHooks): void {
        this.middleware.use(middleware);
    }

    onEvent(filter: EventFilter, handler: EventHandler): string {
        const id = `${filter.kinds?.join('.') || 'all'}-${this.events.length}`;
        this.events.push({ filter, handler });
        return id;
    }

    async load(plugin: Plugin): Promise<void> {
        const id = `${plugin.meta.name}@${plugin.meta.version}`;
        if (this.plugins.has(id)) return;
        await plugin.setup(this);
        this.plugins.set(id, plugin);
    }

    async unload(name: string): Promise<void> {
        const entry = Array.from(this.plugins.entries()).find(([, plugin]) => plugin.meta.name === name);
        if (!entry) return;
        const [id, plugin] = entry;
        if (plugin.teardown) {
            await plugin.teardown();
        }
        this.plugins.delete(id);
    }
}
