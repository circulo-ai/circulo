/**
 * Next.js middleware utilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { AISDKClient } from '../client';

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
    sdk?: AISDKClient;
    requireAuth?: boolean;
    allowedAgents?: string[];
}

/**
 * Agent middleware for Next.js API routes
 */
export function agentMiddleware(config: MiddlewareConfig = {}) {
    return async function middleware(request: NextRequest) {
        // Extract agent ID from headers or query params
        const agentId = request.headers.get('x-agent-id') || request.nextUrl.searchParams.get('agentId');

        // Validate agent if required
        if (config.allowedAgents && agentId) {
            if (!config.allowedAgents.includes(agentId)) {
                return NextResponse.json(
                    { error: 'Agent not allowed' },
                    { status: 403 }
                );
            }
        }

        // Attach agent info to request headers
        const requestHeaders = new Headers(request.headers);
        if (agentId) {
            requestHeaders.set('x-agent-id', agentId);
        }

        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    };
}

/**
 * Webhook middleware for handling incoming webhooks
 */
export function webhookMiddleware(config: { secret?: string } = {}) {
    return async function middleware(request: NextRequest) {
        // Verify webhook signature if secret is provided
        if (config.secret) {
            const signature = request.headers.get('x-webhook-signature');

            if (!signature) {
                return NextResponse.json(
                    { error: 'Missing webhook signature' },
                    { status: 401 }
                );
            }

            // In a real implementation, verify the signature
            // const isValid = verifySignature(await request.text(), signature, config.secret);
            // if (!isValid) {
            //   return NextResponse.json(
            //     { error: 'Invalid webhook signature' },
            //     { status: 401 }
            //   );
            // }
        }

        return NextResponse.next();
    };
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(config: { maxRequests?: number; windowMs?: number } = {}) {
    const maxRequests = config.maxRequests || 100;
    const windowMs = config.windowMs || 60000;
    const requests = new Map<string, number[]>();

    return async function middleware(request: NextRequest) {
        const identifier = request.headers.get('x-forwarded-for') || 'unknown';
        const now = Date.now();

        // Get request timestamps for this identifier
        const timestamps = requests.get(identifier) || [];

        // Filter out old timestamps
        const recentTimestamps = timestamps.filter((t) => now - t < windowMs);

        // Check if rate limit exceeded
        if (recentTimestamps.length >= maxRequests) {
            return NextResponse.json(
                { error: 'Rate limit exceeded' },
                { status: 429 }
            );
        }

        // Add current timestamp
        recentTimestamps.push(now);
        requests.set(identifier, recentTimestamps);

        return NextResponse.next();
    };
}

/**
 * Compose multiple middleware functions
 */
export function composeMiddleware(...middlewares: Array<(req: NextRequest) => Promise<NextResponse>>) {
    return async function composedMiddleware(request: NextRequest) {
        for (const middleware of middlewares) {
            const response = await middleware(request);
            if (response.status !== 200 && response.headers.get('x-middleware-next') !== 'true') {
                return response;
            }
        }
        return NextResponse.next();
    };
}
