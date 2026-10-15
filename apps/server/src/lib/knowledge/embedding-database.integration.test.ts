import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { eq } from "drizzle-orm";

const state = vi.hoisted(() => ({
  baseUrl: "",
  canManage: true,
  member: true,
}));
vi.mock("@/db", async () => {
  const { PGlite } = await import(
    "../../../../../packages/db/node_modules/@electric-sql/pglite/dist/index.js"
  );
  const { vector } = await import(
    "../../../../../packages/db/node_modules/@electric-sql/pglite-pgvector/dist/index.js"
  );
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import(
    "../../../../../packages/db/dist/schema/index.js"
  );
  const client = new PGlite({ extensions: { vector } });
  return { ...schema, db: drizzle(client, { schema }), __client: client };
});
vi.mock("@/lib/ai/provider-registry", () => ({
  getUserProviderCredential: async (_user: string, providerId: string) => ({
    providerId,
    apiKey: "integration-fixture",
    baseUrl: state.baseUrl,
  }),
}));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/create-app", async () => {
  const { Hono } = await import("hono");
  return { createRouter: () => new Hono() };
});
vi.mock("@/lib/permissions", () => ({
  isMemberOf: async () => state.member,
  hasPermissionForUser: async () => state.canManage,
}));
vi.mock("@/middleware/auth", () => ({
  requireAuth: async (c: any, next: () => Promise<void>) => {
    c.set("user", { id: "test-user" });
    c.set("activeOrgId", "test-org");
    await next();
  },
}));
vi.mock("@/middleware/rate-limit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("@/lib/storage/config", () => ({
  storageManager: { download: vi.fn() },
}));

import * as database from "@/db";
import {
  createKnowledgeEmbeddingWithMetadata,
  refreshKnowledgeDocumentEmbedding,
} from "./embeddings";
import {
  knowledgeSemanticDistance,
  relevantKnowledgeContent,
} from "./semantic-distance";
import {
  createMemoryEmbedding,
  retrieveMemories,
  writeMemoryWithEmbedding,
} from "@/lib/memory/retrieval";
import router from "@/routes/embedding-settings";
import memoryRouter from "@/routes/memories";
import { Hono } from "hono";

let provider: Server;
let documentId: string;
let memoryId: string;
const app = new Hono().route("/api", router).route("/api", memoryRouter);
app.onError((error: any, c) =>
  c.json({ message: error.message }, error.statusCode ?? error.status ?? 500),
);
const client = (database as any).__client;
beforeAll(async () => {
  provider = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body).input as string[];
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        data: input
          .map((text, index) => {
            const embedding = Array.from({ length: 1536 }, () => 0);
            embedding[text.includes("beacon") ? 0 : 1] = 1;
            return { index, embedding };
          })
          .reverse(),
      }),
    );
  });
  await new Promise<void>((resolve) =>
    provider.listen(0, "127.0.0.1", resolve),
  );
  state.baseUrl = `http://127.0.0.1:${(provider.address() as { port: number }).port}/v1`;
  for (const migration of readMigrationFiles({
    migrationsFolder: fileURLToPath(
      new URL("../../../../../packages/db/migrations", import.meta.url),
    ),
  }))
    for (const statement of migration.sql) await client.exec(statement);
  await database.db.insert(database.user).values({
    id: "test-user",
    name: "Test",
    email: "test@example.test",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await database.db.insert(database.organization).values({
    id: "test-org",
    name: "Test",
    slug: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [base] = await database.db
    .insert(database.knowledgeBase)
    .values({
      organizationId: "test-org",
      createdBy: "test-user",
      name: "Test",
    })
    .returning();
  const [document] = await database.db
    .insert(database.knowledgeDocument)
    .values({
      knowledgeBaseId: base!.id,
      organizationId: "test-org",
      createdBy: "test-user",
      title: "Long document",
      content: `${"generic ".repeat(600)}beacon code is marigold-42. ${"generic ".repeat(600)}`,
    })
    .returning();
  documentId = document!.id;
  const [memory] = await database.db
    .insert(database.memory)
    .values({
      organizationId: "test-org",
      createdBy: "test-user",
      scope: "user",
      userId: "test-user",
      key: "beacon",
      content: "beacon code is marigold-42",
    })
    .returning();
  memoryId = memory!.id;
}, 30000);
afterAll(async () => {
  if (provider)
    await new Promise<void>((resolve) => provider.close(() => resolve()));
  await client.close();
});

describe("workspace embeddings with real HTTP and PGlite", () => {
  it("applies migrations, indexes passages, and retrieves the relevant passage", async () => {
    const document = await database.db.query.knowledgeDocument.findFirst({
      where: eq(database.knowledgeDocument.id, documentId),
    });
    expect(
      await refreshKnowledgeDocumentEmbedding({
        documentId,
        title: document!.title,
        content: document!.content,
        userId: "test-user",
      }),
    ).toBe(true);
    const chunks = await database.db.query.embeddingChunk.findMany({
      where: eq(database.embeddingChunk.documentId, documentId),
    });
    expect(chunks.length).toBeGreaterThan(1);
    const query = await createKnowledgeEmbeddingWithMetadata("beacon", "", {
      userId: "test-user",
      organizationId: "test-org",
    });
    const ranked = await database.db
      .select({ distance: knowledgeSemanticDistance(query) })
      .from(database.knowledgeDocument)
      .where(eq(database.knowledgeDocument.id, documentId));
    expect(Number(ranked[0]?.distance)).toBeCloseTo(0);
    expect(await relevantKnowledgeContent(document!, query)).toContain(
      "marigold-42",
    );
  });
  it("persists memory chunks and retrieves only the authorized scope", async () => {
    const result = await createMemoryEmbedding({
      key: "beacon",
      content: "beacon code is marigold-42",
      userId: "test-user",
      organizationId: "test-org",
    });
    await database.db
      .update(database.memory)
      .set({ embedding: result!.embedding, embeddingModel: result!.model })
      .where(eq(database.memory.id, memoryId));
    const saved = await writeMemoryWithEmbedding(
      "test-org",
      result,
      async (tx, fields) => {
        const [row] = await tx
          .update(database.memory)
          .set(fields)
          .where(eq(database.memory.id, memoryId))
          .returning();
        return row;
      },
    );
    expect(saved.indexed).toBe(true);
    expect(
      await retrieveMemories({
        organizationId: "test-org",
        userId: "test-user",
        scopes: [eq(database.memory.userId, "test-user")],
        query: "beacon",
        limit: 5,
      }),
    ).toHaveLength(1);
    expect(
      await retrieveMemories({
        organizationId: "test-org",
        userId: "test-user",
        scopes: [eq(database.memory.userId, "another-user")],
        query: "beacon",
        limit: 5,
      }),
    ).toHaveLength(0);
  });
  it("tests the provider, saves settings, and invalidates vectors without changing sources", async () => {
    const settings = (await (
      await app.request("/api/embedding-settings")
    ).json()) as { config: import("@circulo-ai/types").EmbeddingPreferences };
    const next = { ...settings.config, chunkSize: 2000, overlap: 200 };
    expect(
      (
        await app.request("/api/embedding-settings/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        })
      ).status,
    ).toBe(200);
    const saved = await app.request("/api/embedding-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    expect(saved.status).toBe(200);
    expect(
      ((await saved.json()) as { reindexRequired: boolean }).reindexRequired,
    ).toBe(true);
    expect(await database.db.query.embeddingChunk.findMany()).toHaveLength(0);
    expect(
      (
        await database.db.query.knowledgeDocument.findFirst({
          where: eq(database.knowledgeDocument.id, documentId),
        })
      )?.content,
    ).toContain("marigold-42");
    expect(
      (
        await database.db.query.memory.findFirst({
          where: eq(database.memory.id, memoryId),
        })
      )?.embedding,
    ).toBeNull();
    const rebuilt = await app.request("/api/embedding-settings/reindex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "knowledge", limit: 1 }),
    });
    expect(rebuilt.status).toBe(200);
    expect(((await rebuilt.json()) as { indexed: number }).indexed).toBe(1);
  });
  it("rejects unauthorized preference mutations and invalid overlap", async () => {
    const config = (
      (await (await app.request("/api/embedding-settings")).json()) as {
        config: import("@circulo-ai/types").EmbeddingPreferences;
      }
    ).config;
    state.canManage = false;
    expect(
      (
        await app.request("/api/embedding-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        })
      ).status,
    ).toBe(403);
    state.canManage = true;
    expect(
      (
        await app.request("/api/embedding-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...config, overlap: config.chunkSize }),
        })
      ).status,
    ).toBe(400);
    state.member = false;
    expect((await app.request("/api/embedding-settings")).status).toBe(403);
    state.member = true;
  });
  it("upserts concurrent memory requests once, with atomic history and vectors", async () => {
    const responses = await Promise.all(
      [1, 2].map((version) =>
        app.request("/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: "user",
            key: "concurrent-memory",
            content: `Saved version ${version}`,
          }),
        }),
      ),
    );
    expect(responses.every((response) => response.ok)).toBe(true);
    const rows = await database.db.query.memory.findMany({
      where: eq(database.memory.key, "concurrent-memory"),
    });
    expect(rows).toHaveLength(1);
    const chunks = await database.db.query.embeddingChunk.findMany({
      where: eq(database.embeddingChunk.memoryId, rows[0]!.id),
    });
    expect(chunks[0]?.content).toContain(rows[0]!.content);
    expect(
      await database.db.query.memoryHistory.findMany({
        where: eq(database.memoryHistory.memoryId, rows[0]!.id),
      }),
    ).toHaveLength(1);
  });
  it("excludes embeddings from a different model", async () => {
    const query = await createKnowledgeEmbeddingWithMetadata("beacon", "", {
      userId: "test-user",
      organizationId: "test-org",
    });
    const wrong = { embedding: query!.embedding, model: "different-model" };
    const ranked = await database.db
      .select({ distance: knowledgeSemanticDistance(wrong) })
      .from(database.knowledgeDocument)
      .where(eq(database.knowledgeDocument.id, documentId));
    expect(ranked[0]?.distance).toBeNull();
  });
});
