import { Guard, Result, type UseCase, type UnitOfWork } from "@circulo-ai/core";
import { Vote } from "@/domain/vote/vote";
import { DrizzleVoteRepository } from "@/infrastructure/drizzle/vote-repository";

export type SetVoteInput = {
  chatId: string;
  messageId: string;
  userId: string;
  isUpvoted: boolean;
};

export type SetVoteOutput = Result<void>;

export class SetVote implements UseCase<SetVoteInput, SetVoteOutput> {
  constructor(
    private readonly votes: DrizzleVoteRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: SetVoteInput): Promise<SetVoteOutput> {
    const chatCheck = Guard.isUuid(input.chatId, "chatId");
    if (!chatCheck.succeeded) return Result.fail(chatCheck.message);
    const messageCheck = Guard.isUuid(input.messageId, "messageId");
    if (!messageCheck.succeeded) return Result.fail(messageCheck.message);
    const userCheck = Guard.againstEmptyString(input.userId, "userId");
    if (!userCheck.succeeded) return Result.fail(userCheck.message);

    return this.uow.transaction(async () => {
      const vote = Vote.create({
        chatId: input.chatId,
        messageId: input.messageId,
        userId: input.userId,
        isUpvoted: input.isUpvoted,
      });
      await this.votes.set(vote);
      return Result.ok();
    });
  }
}
