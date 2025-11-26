/**
 * Bridges MCP tools into the generic ToolAdapter interface.
 */

import { BaseToolAdapter } from '../../../core/abstractions/tool-adapter';
import { MCPClientAdapter } from '../../../core/types/mcp';
import { ToolSchema, ToolCallContext } from '../../../core/types/tools';

export class MCPToolAdapter extends BaseToolAdapter<Record<string, unknown>, unknown> {
    readonly schema: ToolSchema;
    private readonly client: MCPClientAdapter;

    constructor(schema: ToolSchema, client: MCPClientAdapter) {
        super();
        this.schema = schema;
        this.client = client;
    }

    async invoke(params: Record<string, unknown>, _ctx: ToolCallContext): Promise<unknown> {
        return this.client.callTool(this.schema.name, params);
    }
}
