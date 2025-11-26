/**
 * Placeholder for MCP server helpers so SDK can expose tools outward if needed.
 */

import { MCPToolDescription } from '../../../core/types/mcp';

export interface MCPServerAdapter {
    serverId: string;
    listTools(): Promise<MCPToolDescription[]>;
    // Future: handle incoming calls.
}
