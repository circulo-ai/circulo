import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres, { type TransactionSql } from "postgres";
import * as schema from "./schema";

export * from "./schema";
export type { PostgresJsDatabase };

type PostgresClient = ReturnType<typeof postgres>;
type PGliteClient = PGlite;
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
  | { driver: "postgres"; client: PostgresClient; db: DbInstance }
  | { driver: "pglite"; client: PGliteClient; db: DbInstance }
  | undefined
>;

const poolConfig = {
  max: 30,
  idle_timeout: 20,
  connect_timeout: 30,
  prepare: false,
} as const;

function usePGlite() {
  return process.env.CIRCULO_DATABASE_DRIVER === "pglite";
}

function pgliteDataDir() {
  const configured = process.env.PGLITE_DATA_DIR?.trim();
  if (configured) return configured;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl?.startsWith("pglite://")) {
    return databaseUrl.slice("pglite://".length);
  }

  return resolve(process.cwd(), ".local-storage/pglite");
}

function pgliteMigrationsPath() {
  const configured = process.env.CIRCULO_MIGRATIONS_PATH?.trim();
  if (configured) return configured;

  return resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");
}

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

function createPGlite(): { client: PGliteClient; db: DbInstance } {
  const client = new PGlite(pgliteDataDir(), {
    extensions: { vector },
  });
  const db = drizzlePglite(client, { schema }) as unknown as DbInstance;
  return { client, db };
}

function getPool() {
  const cached = globalPools[POOL_KEY];
  if (cached) return cached;
  const created = usePGlite()
    ? { driver: "pglite" as const, ...createPGlite() }
    : { driver: "postgres" as const, ...createPool() };
  globalPools[POOL_KEY] = created;
  return created;
}

let readyPromise: Promise<void> | undefined;

/** Initialize the selected database and apply the shared Drizzle migrations. */
export function waitForDb(): Promise<void> {
  readyPromise ??= (async () => {
    const runtime = getPool();
    if (runtime.driver === "pglite") {
      await migratePGliteClient(runtime.client);
    }
  })();
  return readyPromise;
}

async function migratePGliteClient(client: PGliteClient) {
  const migrations = readMigrationFiles({
    migrationsFolder: pgliteMigrationsPath(),
  });
  await client.exec(`
    CREATE SCHEMA IF NOT EXISTS "drizzle";
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      "id" serial PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    );
  `);

  const result = await client.query<{ created_at: number | string }>(
    `SELECT "created_at" FROM "drizzle"."__drizzle_migrations" ORDER BY "created_at" DESC LIMIT 1`,
  );
  const lastCreatedAt = result.rows[0]?.created_at
    ? Number(result.rows[0].created_at)
    : undefined;

  await client.exec("BEGIN");
  try {
    for (const migration of migrations) {
      if (
        lastCreatedAt !== undefined &&
        lastCreatedAt >= migration.folderMillis
      ) {
        continue;
      }
      for (const statement of migration.sql) {
        await client.exec(statement);
      }
      await client.exec(
        `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('${migration.hash}', ${migration.folderMillis})`,
      );
    }
    await client.exec("COMMIT");
  } catch (error) {
    await client.exec("ROLLBACK");
    throw error;
  }
}

export function getDb(): DbInstance {
  return getPool().db;
}

export function getDbClient(): PostgresClient | PGliteClient {
  return getPool().client;
}

export async function beginTransaction(): Promise<{
  tx: PostgresTransaction;
  db: DbInstance;
}> {
  const runtime = getPool();
  if (runtime.driver === "pglite") {
    await runtime.client.exec("BEGIN");
    const tx = {
      commit: () => runtime.client.exec("COMMIT").then(() => undefined),
      rollback: () => runtime.client.exec("ROLLBACK").then(() => undefined),
    } as PostgresTransaction;
    return { tx, db: runtime.db };
  }

  const rawTx = await (
    runtime.client as PostgresClient & {
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
    if ("end" in current.client) {
      await current.client.end({ timeout: 5 });
    } else {
      await current.client.close();
    }
  } finally {
    globalPools[POOL_KEY] = undefined;
  }
}

export const db = getDb();
