/**
 * Plugin architecture and extension system
 */

import { ID } from '../types/common';
import { Agent } from '../core/agent';
import { Tool } from '../core/tool';
import { Integration } from '../core/integration';
import { EventBus, EventHandler, EventFilter } from '../core/event';

/**
 * Plugin type
 */
export enum PluginType {
    TOOL = 'tool',
    INTEGRATION = 'integration',
    AGENT_EXTENSION = 'agent_extension',
    EVENT_HANDLER = 'event_handler',
    MIDDLEWARE = 'middleware',
    CUSTOM = 'custom',
}

/**
 * Plugin metadata
 */
export interface PluginMetadata {
    name: string;
    version: string;
    description?: string;
    author?: string;
    type: PluginType;
    dependencies?: string[];
}

/**
 * Plugin interface
 */
export interface Plugin {
    metadata: PluginMetadata;

    /**
     * Initialize the plugin
     */
    initialize(context: PluginContext): Promise<void> | void;

    /**
     * Cleanup when plugin is unloaded
     */
    cleanup?(): Promise<void> | void;
}

/**
 * Plugin context provided to plugins
 */
export interface PluginContext {
    eventBus: EventBus;
    registerTool: (tool: Tool) => void;
    registerIntegration: (integration: Integration) => void;
    registerAgent: (agent: Agent) => void;
    subscribeToEvents: (filter: EventFilter, handler: EventHandler) => ID;
    getConfig: <T = any>(key: string) => T | undefined;
    setConfig: (key: string, value: any) => void;
}

/**
 * Plugin manager
 */
export class PluginManager {
    private plugins: Map<string, Plugin> = new Map();
    private context: PluginContext;
    private config: Map<string, any> = new Map();

    constructor(context: Omit<PluginContext, 'getConfig' | 'setConfig'>) {
        this.context = {
            ...context,
            getConfig: this.getConfig.bind(this),
            setConfig: this.setConfig.bind(this),
        };
    }

    /**
     * Register a plugin
     */
    async register(plugin: Plugin): Promise<void> {
        const { name, version } = plugin.metadata;
        const pluginId = `${name}@${version}`;

        if (this.plugins.has(pluginId)) {
            throw new Error(`Plugin ${pluginId} is already registered`);
        }

        // Check dependencies
        if (plugin.metadata.dependencies) {
            for (const dep of plugin.metadata.dependencies) {
                if (!this.isPluginLoaded(dep)) {
                    throw new Error(`Plugin ${pluginId} requires dependency ${dep} which is not loaded`);
                }
            }
        }

        await plugin.initialize(this.context);
        this.plugins.set(pluginId, plugin);
    }

    /**
     * Unregister a plugin
     */
    async unregister(name: string, version?: string): Promise<boolean> {
        const pluginId = version ? `${name}@${version}` : this.findPluginId(name);

        if (!pluginId) {
            return false;
        }

        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            return false;
        }

        if (plugin.cleanup) {
            await plugin.cleanup();
        }

        return this.plugins.delete(pluginId);
    }

    /**
     * Get a plugin
     */
    getPlugin(name: string, version?: string): Plugin | undefined {
        const pluginId = version ? `${name}@${version}` : this.findPluginId(name);
        return pluginId ? this.plugins.get(pluginId) : undefined;
    }

    /**
     * List all plugins
     */
    listPlugins(): PluginMetadata[] {
        return Array.from(this.plugins.values()).map((p) => p.metadata);
    }

    /**
     * Check if plugin is loaded
     */
    isPluginLoaded(nameOrId: string): boolean {
        if (this.plugins.has(nameOrId)) {
            return true;
        }
        return this.findPluginId(nameOrId) !== null;
    }

    /**
     * Get config value
     */
    private getConfig<T = any>(key: string): T | undefined {
        return this.config.get(key);
    }

    /**
     * Set config value
     */
    private setConfig(key: string, value: any): void {
        this.config.set(key, value);
    }

    /**
     * Find plugin ID by name
     */
    private findPluginId(name: string): string | null {
        for (const [id, plugin] of this.plugins.entries()) {
            if (plugin.metadata.name === name) {
                return id;
            }
        }
        return null;
    }
}

/**
 * Base plugin class for convenience
 */
export abstract class BasePlugin implements Plugin {
    abstract metadata: PluginMetadata;

    async initialize(context: PluginContext): Promise<void> {
        // Override in subclass
    }

    async cleanup(): Promise<void> {
        // Override in subclass
    }
}

/**
 * Tool plugin helper
 */
export class ToolPlugin extends BasePlugin {
    metadata: PluginMetadata;
    private tool: Tool;

    constructor(tool: Tool, metadata?: Partial<PluginMetadata>) {
        super();
        this.tool = tool;
        this.metadata = {
            name: tool.name,
            version: tool.version,
            description: tool.description,
            type: PluginType.TOOL,
            ...metadata,
        };
    }

    async initialize(context: PluginContext): Promise<void> {
        context.registerTool(this.tool);
    }
}

/**
 * Event handler plugin helper
 */
export class EventHandlerPlugin extends BasePlugin {
    metadata: PluginMetadata;
    private filter: EventFilter;
    private handler: EventHandler;
    private subscriptionId?: ID;

    constructor(
        name: string,
        filter: EventFilter,
        handler: EventHandler,
        metadata?: Partial<PluginMetadata>
    ) {
        super();
        this.filter = filter;
        this.handler = handler;
        this.metadata = {
            name,
            version: '1.0.0',
            type: PluginType.EVENT_HANDLER,
            ...metadata,
        };
    }

    async initialize(context: PluginContext): Promise<void> {
        this.subscriptionId = context.subscribeToEvents(this.filter, this.handler);
    }

    async cleanup(): Promise<void> {
        // Subscription cleanup would be handled by the event bus
    }
}
