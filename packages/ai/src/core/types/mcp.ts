/**
 * Model Context Protocol shapes.
 */

import { Metadata } from '../../types/common';
import { ToolSchema } from './tools';

export interface MCPToolDescription extends ToolSchema {
    inputSchema?: Record<string, unknown>;
}

export interface MCPServerInfo {
    serverId: string;
    name: string;
    version: string;
    capabilities: string[];
    metadata?: Metadata;
}

export interface MCPHandshake {
    protocol: 'mcp';
    version: string;
    client?: string;
    metadata?: Metadata;
}

export interface MCPTransport {
    connect(): Promise<void>;
    send(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
    close(): Promise<void>;
}

export interface MCPClientAdapter {
    readonly server: MCPServerInfo;
    connect(): Promise<void>;
    listTools(): Promise<MCPToolDescription[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    close(): Promise<void>;
}
