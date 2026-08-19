import { db } from "@/db";
import { chatMemberRepo } from "@/db/repositories";
import {
  agent as agentTable,
  artifact as artifactTable,
  message as messageTable,
  user as userTable,
} from "@/db/schema";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";
import { NotFoundError } from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

const router = createRouter();

const paramsSchema = z.object({ chatId: z.uuid() });

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getResourceType(
  mediaType: string,
): "audio" | "image" | "video" | "file" {
  if (mediaType.startsWith("audio/")) return "audio";
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  return "file";
}

function toSender(row: {
  authorType: string;
  authorId: string;
  userName: string | null;
  userImage: string | null;
  agentName: string | null;
  agentAvatarUrl: string | null;
}) {
  if (row.authorType === "agent") {
    return {
      id: row.authorId,
      type: "agent" as const,
      name: row.agentName ?? "Agent",
      image: row.agentAvatarUrl,
    };
  }

  if (row.authorType === "system") {
    return {
      id: row.authorId,
      type: "system" as const,
      name: "Circulo",
      image: null,
    };
  }

  return {
    id: row.authorId,
    type: "user" as const,
    name: row.userName ?? "Chat member",
    image: row.userImage,
  };
}

router.get(
  "/chat/:chatId/resources",
  requireAuth,
  zValidator("param", paramsSchema),
  async (c) => {
    const { chatId } = c.req.valid("param");
    const userId = c.var.user!.id;

    const chat = await db.query.chat.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.id, chatId), eq(table.isDeleted, false)),
      columns: { id: true },
    });

    if (!chat || !(await chatMemberRepo.isMember(userId, chatId))) {
      throw new NotFoundError("Chat");
    }

    const messages = await db
      .select({
        id: messageTable.id,
        authorType: messageTable.authorType,
        authorId: messageTable.authorId,
        parts: messageTable.parts,
        attachments: messageTable.attachments,
        createdAt: messageTable.createdAt,
        userName: userTable.name,
        userImage: userTable.image,
        agentName: agentTable.name,
        agentAvatarUrl: agentTable.avatarUrl,
      })
      .from(messageTable)
      .leftJoin(
        userTable,
        and(
          eq(messageTable.authorType, "user"),
          eq(messageTable.authorId, userTable.id),
        ),
      )
      .leftJoin(
        agentTable,
        and(
          eq(messageTable.authorType, "agent"),
          // Message author IDs are stored as text while agent IDs are UUIDs.
          // Cast the UUID side to text so user/system author IDs are never
          // forced through a UUID cast by PostgreSQL.
          sql`${agentTable.id}::text = ${messageTable.authorId}`,
        ),
      )
      .where(
        and(eq(messageTable.chatId, chatId), eq(messageTable.isDeleted, false)),
      )
      .orderBy(desc(messageTable.createdAt));
    const artifacts = await db
      .select({
        id: artifactTable.id,
        title: artifactTable.title,
        kind: artifactTable.kind,
        userId: artifactTable.userId,
        createdAt: artifactTable.createdAt,
        updatedAt: artifactTable.updatedAt,
        userName: userTable.name,
        userImage: userTable.image,
      })
      .from(artifactTable)
      .leftJoin(userTable, eq(artifactTable.userId, userTable.id))
      .where(eq(artifactTable.chatId, chatId))
      .orderBy(desc(artifactTable.updatedAt));

    const artifactMessageMap = new Map<string, (typeof messages)[number]>();

    for (const message of messages) {
      const parts = [
        ...(Array.isArray(message.parts) ? message.parts : []),
        ...(Array.isArray(message.attachments) ? message.attachments : []),
      ];

      for (const part of parts) {
        if (!isRecord(part)) continue;
        const id =
          stringValue(part.data) ??
          stringValue(part.documentId) ??
          stringValue(part.artifactId);
        if (part.type === "data-id" && id && !artifactMessageMap.has(id)) {
          artifactMessageMap.set(id, message);
        }
      }
    }

    const resources = artifacts.map((artifact) => {
      const sourceMessage = artifactMessageMap.get(artifact.id);
      const sender = sourceMessage
        ? toSender(sourceMessage)
        : {
            id: artifact.userId,
            type: "user" as const,
            name: artifact.userName ?? "Chat member",
            image: artifact.userImage,
          };

      return {
        id: artifact.id,
        type: "artifact" as const,
        name: artifact.title || "Untitled artifact",
        artifactKind: artifact.kind,
        url: null,
        mediaType: null,
        size: null,
        sender,
        messageId: sourceMessage?.id ?? null,
        createdAt: artifact.createdAt.toISOString(),
        updatedAt:
          artifact.updatedAt?.toISOString() ?? artifact.createdAt.toISOString(),
      };
    });

    const fileResources = messages.flatMap((message) => {
      const parts = [
        ...(Array.isArray(message.parts) ? message.parts : []),
        ...(Array.isArray(message.attachments) ? message.attachments : []),
      ];
      const seen = new Set<string>();
      const sender = toSender(message);

      return parts.flatMap((part, index) => {
        if (!isRecord(part) || (part.type !== "file" && !part.url)) return [];

        const url = stringValue(part.url);
        const name = stringValue(part.name) ?? `Shared file ${index + 1}`;
        const mediaType =
          stringValue(part.mediaType) ??
          stringValue(part.contentType) ??
          "application/octet-stream";
        const key = `${url ?? name}:${mediaType}`;
        if (seen.has(key)) return [];
        seen.add(key);

        return [
          {
            id: `${message.id}:${index}`,
            type: getResourceType(mediaType),
            name,
            artifactKind: null,
            url: url ?? null,
            mediaType,
            size: numberValue(part.size) ?? null,
            sender,
            messageId: message.id,
            createdAt: message.createdAt.toISOString(),
            updatedAt: message.createdAt.toISOString(),
          },
        ];
      });
    });

    return c.json({ resources: [...resources, ...fileResources] }, 200);
  },
);

export default router;
