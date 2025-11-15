import { db } from "@/db";
import { Session } from "@/lib/auth";
import type { ChatMessage } from "@/lib/types";
import { tool, type UIMessageStreamWriter } from "ai";
import { sql } from "drizzle-orm";
import { z } from "zod";

type SearchMemoryProps = {
  session: Session;
  chatId: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

export const searchChatMemory = ({
  session,
  dataStream,
  chatId,
}: SearchMemoryProps) =>
  tool({
    description: "Search through user memories by text or semantic meaning.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      limit: z.number().default(5),
    }),
    execute: async ({ query, limit }) => {
      const ownerId = session.user?.id;
      if (!ownerId) return { error: "User session not found" };

      // TODO: Check chatId and if the owner has access to it

      dataStream.write({
        type: "data-memory-search-start",
        data: { query },
        transient: true,
      });

      // TODO: embed the query
      // We also need to send data-usage for embedding for handling costs
      const queryEmbedding: number[] = []; // await embedText(query);

      // semantic search via pgvector
      const rows: any[] = await db.execute(sql`
        SELECT
          m.id,
          m.type,
          m.content,
          m.metadata,
          (me.embedding <-> ${queryEmbedding}::vector) AS distance
        FROM memory_embedding me
        JOIN memory m ON m.id = me.memory_id
        WHERE m.owner_id = ${ownerId}
        AND m.deleted = false
        ORDER BY distance ASC
        LIMIT ${limit};
      `);

      const results = rows.map((row) => ({
        id: row.id,
        type: row.type,
        content: row.content,
        metadata: row.metadata,
        score: 1 - row.distance, // normalize
      }));

      // notify UI
      dataStream.write({
        type: "data-memory-search-results",
        data: results,
        transient: true,
      });

      return {
        query,
        results,
      };
    },
  });
