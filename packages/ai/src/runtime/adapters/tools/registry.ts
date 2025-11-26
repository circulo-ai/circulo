/**
 * Tool registry to keep a central, injectable catalog.
 */

import { ToolAdapter } from '../../../core/abstractions/tool-adapter';

export class ToolRegistry {
    private readonly tools: Map<string, ToolAdapter> = new Map();

    register(tool: ToolAdapter): void {
        this.tools.set(tool.schema.name, tool);
    }

    unregister(name: string): boolean {
        return this.tools.delete(name);
    }

    get(name: string): ToolAdapter | undefined {
        return this.tools.get(name);
    }

    list(): ToolAdapter[] {
        return Array.from(this.tools.values());
    }
}
