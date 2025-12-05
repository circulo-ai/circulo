import { eq, and } from "drizzle-orm";
import { vote as voteTable } from "@/db/schema/chat";
import type { DbInstance } from "@/db";
import { Vote } from "@/domain/vote/vote";

export class DrizzleVoteRepository {
  constructor(private readonly db: DbInstance) {}

  async get(chatId: string, messageId: string, userId: string): Promise<Vote | null> {
    const row = await this.db.query.vote.findFirst({
      where: and(
        eq(voteTable.chatId, chatId),
        eq(voteTable.messageId, messageId),
        eq(voteTable.userId, userId),
      ),
    });
    return row ? Vote.create(row) : null;
  }

  async set(vote: Vote): Promise<Vote> {
    const snap = {
      chatId: vote.chatId,
      messageId: vote.messageId,
      userId: vote.userId,
      isUpvoted: vote.isUpvoted,
    };
    await this.db
      .insert(voteTable)
      .values(snap)
      .onConflictDoUpdate({
        target: [voteTable.chatId, voteTable.messageId, voteTable.userId],
        set: { isUpvoted: snap.isUpvoted },
      });
    return vote;
  }
}
