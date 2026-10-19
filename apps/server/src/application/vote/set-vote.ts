import { Vote } from "@/domain/vote/vote";
import { createDrizzleRepositories } from "@/infrastructure/drizzle/repository-factory";
import { Guard, Result, type UnitOfWork, type UseCase } from "@circulo-ai/core";
import type { DbInstance } from "@circulo-ai/db";

export type SetVoteInput = {
  chatId: string;
  messageId: string;
  userId: string;
  isUpvoted: boolean;
};

export type SetVoteOutput = Result<void>;

export class SetVote implements UseCase<SetVoteInput, SetVoteOutput> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(input: SetVoteInput): Promise<SetVoteOutput> {
    const chatCheck = Guard.isUuid(input.chatId, "chatId");
    if (!chatCheck.succeeded) return Result.fail(chatCheck.message);
    const messageCheck = Guard.isUuid(input.messageId, "messageId");
    if (!messageCheck.succeeded) return Result.fail(messageCheck.message);
    const userCheck = Guard.againstEmptyString(input.userId, "userId");
    if (!userCheck.succeeded) return Result.fail(userCheck.message);

    return this.uow.transaction(async (scope) => {
      const { vote: votes } = createDrizzleRepositories(scope.client);
      const vote = Vote.create({
        chatId: input.chatId,
        messageId: input.messageId,
        userId: input.userId,
        isUpvoted: input.isUpvoted,
      });
      await votes.set(vote);
      return Result.ok();
    });
  }
}
