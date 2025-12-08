import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type TransactionSql } from "postgres";
import * as schema from "./schema";

export * from "./schema";
export type { PostgresJsDatabase };

type PostgresClient = ReturnType<typeof postgres>;
type PostgresTransaction = TransactionSql & {
  commit(): Promise<void>;
  rollback(): Promise<void>;
};
export type { PostgresTransaction };
export type DbInstance = PostgresJsDatabase<typeof schema>;

// Share a single pool even if the module is loaded through different paths
const POOL_KEY = Symbol.for("circulo.db.pool");
const globalPools = globalThis as unknown as Record<
  symbol | string,
  | {
      client: PostgresClient;
      db: DbInstance;
    }
  | undefined
>;

const poolConfig = {
  max: 30,
  idle_timeout: 20,
  connect_timeout: 30,
  prepare: false,
} as const;

function createPool(): { client: PostgresClient; db: DbInstance } {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL environment variable");
  }

  console.log(
    "[DB Pool Init]",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      action: "CREATING_CONNECTION_POOL",
      poolConfig,
      pid: process.pid,
      moduleId: import.meta.url,
      isProduction: process.env.NODE_ENV === "production",
    }),
  );

  const client = postgres(connectionString, {
    ...poolConfig,
    onnotice: () => {},
  });

  return { client, db: drizzle(client, { schema }) as DbInstance };
}

function getPool() {
  const cached = globalPools[POOL_KEY];
  if (cached) return cached;
  const created = createPool();
  globalPools[POOL_KEY] = created;
  return created;
}

export function getDb(): DbInstance {
  return getPool().db;
}

export function getDbClient(): PostgresClient {
  return getPool().client;
}

export async function beginTransaction(): Promise<{
  tx: PostgresTransaction;
  db: DbInstance;
}> {
  const rawTx = await (
    getDbClient() as unknown as {
      begin(): Promise<unknown>;
    }
  ).begin();
  const tx = rawTx as PostgresTransaction;
  const db = drizzle(tx, { schema }) as DbInstance;
  return { tx, db };
}

export async function closeDbPool(): Promise<void> {
  const current = globalPools[POOL_KEY];
  if (!current) return;

  try {
    await current.client.end({ timeout: 5 });
  } finally {
    globalPools[POOL_KEY] = undefined;
  }
}

export const db = getDb();
