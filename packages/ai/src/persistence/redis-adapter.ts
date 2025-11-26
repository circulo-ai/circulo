/**
 * Helper to adapt a redis client (node-redis or ioredis-like) to the RedisLike interface.
 */

import { RedisLike } from './stores';

type AnyRedis = {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<unknown>;
    del?: (key: string | string[]) => Promise<unknown>;
    keys?: (pattern: string) => Promise<string[]>;
    scan?: (cursor: string, match: string) => Promise<[string, string[]]> | Promise<[string, string[], number?]>;
};

export function createRedisLike(client: AnyRedis): RedisLike {
    return {
        async get(key: string) {
            return client.get(key);
        },
        async set(key: string, value: string) {
            return client.set(key, value) as any;
        },
        async del(key: string) {
            if (client.del) return client.del(key) as any;
        },
        async keys(pattern: string) {
            if (client.keys) return client.keys(pattern);
            if (client.scan) {
                const results: string[] = [];
                let cursor = '0';
                do {
                    const reply = await client.scan(cursor, pattern);
                    const [next, keys] = reply as any;
                    cursor = next;
                    results.push(...keys);
                } while (cursor !== '0');
                return results;
            }
            return [];
        },
    };
}
