/**
 * Default MCP client that wraps a transport and exposes tools as adapters.
 */

import { MCPClientAdapter, MCPHandshake, MCPServerInfo, MCPToolDescription } from '../../../core/types/mcp';
import { MCPTransport } from '../../../core/types/mcp';

export class DefaultMCPClient implements MCPClientAdapter {
    readonly server: MCPServerInfo;
    private readonly transport: MCPTransport;
    private connected = false;

    constructor(server: MCPServerInfo, transport: MCPTransport) {
        this.server = server;
        this.transport = transport;
    }

    async connect(): Promise<void> {
        if (this.connected) return;
        await this.transport.connect();
        const handshake: MCPHandshake = {
            protocol: 'mcp',
            version: '1.0',
            client: 'circulo-ai-sdk',
        };
        await this.transport.send({ method: 'handshake', params: handshake });
        this.connected = true;
    }

    async listTools(): Promise<MCPToolDescription[]> {
        await this.ensureConnected();
        const response = await this.transport.send({ method: 'tools/list' });
        const tools = (response.result as MCPToolDescription[]) || [];
        return tools;
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        await this.ensureConnected();
        const response = await this.transport.send({ method: 'tool/call', params: { name, args } });
        return response.result;
    }

    async close(): Promise<void> {
        if (!this.connected) return;
        await this.transport.close();
        this.connected = false;
    }

    private async ensureConnected(): Promise<void> {
        if (!this.connected) {
            await this.connect();
        }
    }
}
