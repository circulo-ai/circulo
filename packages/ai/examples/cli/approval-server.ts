/**
 * HTTP server for human-in-the-loop approvals
 * Place in: examples/cli/approval-server.ts
 */

import * as http from 'http';
import { HumanApprovalManager } from '../../src';
import { StorageManager } from './storage';

export class ApprovalServer {
    private server?: http.Server;
    private approvalManager: HumanApprovalManager;

    constructor(
        private storage: StorageManager,
        private port: number = 3001
    ) {
        this.approvalManager = new HumanApprovalManager(
            undefined, // Use default policy
            this.storage.getApprovalStore()
        );
    }

    getApprovalManager(): HumanApprovalManager {
        return this.approvalManager;
    }

    async start(): Promise<void> {
        return new Promise((resolve) => {
            this.server = http.createServer(async (req, res) => {
                // CORS headers
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                const url = new URL(req.url || '/', `http://localhost:${this.port}`);

                try {
                    if (url.pathname === '/approvals' && req.method === 'GET') {
                        await this.handleListApprovals(req, res);
                    } else if (url.pathname.startsWith('/approvals/') && req.method === 'POST') {
                        await this.handleApprovalAction(req, res, url);
                    } else if (url.pathname === '/' && req.method === 'GET') {
                        await this.handleIndex(req, res);
                    } else {
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: 'Not found' }));
                    }
                } catch (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({
                        error: error instanceof Error ? error.message : 'Internal error'
                    }));
                }
            });

            this.server.listen(this.port, () => {
                resolve();
            });
        });
    }

    private async handleListApprovals(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): Promise<void> {
        // In a real implementation, list all pending approvals from store
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            approvals: [],
            message: 'No pending approvals'
        }));
    }

    private async handleApprovalAction(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        url: URL
    ): Promise<void> {
        const parts = url.pathname.split('/');
        const requestId = parts[2];
        const action = parts[3]; // 'approve' or 'reject'

        if (!requestId || !action) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid request' }));
            return;
        }

        let body = '';
        for await (const chunk of req) {
            body += chunk;
        }

        const data = body ? JSON.parse(body) : {};

        if (action === 'approve') {
            const result = await this.approvalManager.approve(requestId, data.approverId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } else if (action === 'reject') {
            const result = await this.approvalManager.reject(
                requestId,
                data.approverId,
                data.reason
            );
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } else {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid action' }));
        }
    }

    private async handleIndex(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): Promise<void> {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>AI CLI Approval Dashboard</title>
    <style>
        body { font-family: system-ui; max-width: 1200px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
        .approval { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .pending { border-left: 4px solid #f59e0b; }
        .approved { border-left: 4px solid #10b981; }
        .rejected { border-left: 4px solid #ef4444; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; border: none; border-radius: 4px; }
        .approve-btn { background: #10b981; color: white; }
        .reject-btn { background: #ef4444; color: white; }
        .info { color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <h1>🔐 AI CLI Approval Dashboard</h1>
    <p class="info">Approvals will appear here when tasks require human review.</p>
    <div id="approvals">
        <p>No pending approvals</p>
    </div>
    <script>
        async function loadApprovals() {
            const res = await fetch('/approvals');
            const data = await res.json();
            const container = document.getElementById('approvals');

            if (data.approvals.length === 0) {
                container.innerHTML = '<p>No pending approvals</p>';
                return;
            }

            container.innerHTML = data.approvals.map(approval => \`
                <div class="approval \${approval.status}">
                    <h3>Task: \${approval.taskId}</h3>
                    <p><strong>Reason:</strong> \${approval.reason || 'N/A'}</p>
                    <p><strong>Status:</strong> \${approval.status}</p>
                    <p><strong>Created:</strong> \${new Date(approval.createdAt).toLocaleString()}</p>
                    \${approval.status === 'pending' ? \`
                        <button class="approve-btn" onclick="approve('\${approval.id}')">✓ Approve</button>
                        <button class="reject-btn" onclick="reject('\${approval.id}')">✗ Reject</button>
                    \` : ''}
                </div>
            \`).join('');
        }

        async function approve(id) {
            await fetch(\`/approvals/\${id}/approve\`, { method: 'POST' });
            loadApprovals();
        }

        async function reject(id) {
            const reason = prompt('Rejection reason:');
            await fetch(\`/approvals/\${id}/reject\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            loadApprovals();
        }

        loadApprovals();
        setInterval(loadApprovals, 5000);
    </script>
</body>
</html>
        `;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => resolve());
            } else {
                resolve();
            }
        });
    }
}
