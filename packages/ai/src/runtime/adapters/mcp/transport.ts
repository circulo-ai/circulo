/**
 * Minimal JSON-RPC style transport placeholder for MCP.
 */

import { MCPTransport } from '../../../core/types/mcp';

type Pending = {
    resolve: (value: Record<string, unknown>) => void;
    reject: (reason?: unknown) => void;
};

export class InMemoryTransport implements MCPTransport {
    private connected = false;
    private idCounter = 0;
    private pending: Map<number, Pending> = new Map();

    async connect(): Promise<void> {
        this.connected = true;
    }

    async send(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
        if (!this.connected) {
            throw new Error('Transport not connected');
        }
        const id = ++this.idCounter;
        return new Promise<Record<string, unknown>>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            // Loop back the payload for now; replace with real transport wiring.
            resolve({ id, result: payload });
            this.pending.delete(id);
        });
    }

    async close(): Promise<void> {
        this.connected = false;
        this.pending.clear();
    }
}
