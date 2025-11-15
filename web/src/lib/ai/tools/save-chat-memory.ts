import { chatMemories, chatMemoryEmbeddings, db } from "@/db";
import { Session } from "@/lib/auth";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";

type SaveMemoryProps = {
  session: Session;
  chatId: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

export const saveChatMemory = ({
  session,
  dataStream,
  chatId,
}: SaveMemoryProps) =>
  tool({
    description: "Store a new memory item for the chat.",
    inputSchema: z.object({
      type: z
        .string()
        .describe("Type of memory: fact, note, conversation, etc."),
      content: z.string().describe("Memory content text"),
      metadata: z.record(z.string(), z.any()).optional(),
      agentId: z.string().optional(),
      embed: z.boolean().default(true),
    }),
    execute: async ({ type, content, metadata = {}, agentId, embed }) => {
      const ownerId = session.user?.id;
      if (!ownerId) {
        return { error: "User session not found" };
      }

      // TODO: Check if the user is a chat creator or the member of a chat

      const id = generateUUID();

      // notify UI
      dataStream.write({
        type: "data-memory-status",
        data: "saving",
        transient: true,
      });

      // insert memory
      const now = new Date();
      await db.insert(chatMemories).values({
        id,
        chatId,
        ownerId,
        agentId: agentId || null,
        type,
        content,
        metadata,
        createdAt: now,
      });

      // optional embedding
      if (embed) {
        // TODO: Generate embeddings using openai embedding model
        // We also need to send data-usage for embedding for handling costs
        const embedding: number[] = []; // await embedText(content);

        await db.insert(chatMemoryEmbeddings).values({
          memoryId: id,
          embedding,
        });
      }

      const memoryResult = {
        id,
        chatId,
        ownerId,
        agentId: agentId || null,
        type,
        content,
        metadata,
        createdAt: now,
      };

      // --- UI stream: emit the saved memory result (so UI can render it) ---
      dataStream.write({
        type: "data-memory-result",
        data: memoryResult,
        transient: true,
      });

      // --- UI stream: finalize status & finish ---
      dataStream.write({
        type: "data-memory-status",
        data: "saved",
        transient: true,
      });

      dataStream.write({
        type: "data-finish",
        data: null,
        transient: true,
      });

      return {
        id,
        type,
        content,
        message: "Memory saved successfully",
      };
    },
  });
