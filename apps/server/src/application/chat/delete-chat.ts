import type { DrizzleChatRepository } from "@/infrastructure/drizzle/chat-repository";
import {
  Guard,
  Identifier,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";

export type DeleteChatInput = {
  id: string;
  organizationId: string;
  requesterId: string;
  canDeleteAnyChat: boolean;
};
export type DeleteChatOutput = Result<void>;

export class DeleteChat implements UseCase<DeleteChatInput, DeleteChatOutput> {
  constructor(
    private readonly chats: DrizzleChatRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: DeleteChatInput): Promise<DeleteChatOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async () => {
      const chat = await this.chats.findById(input.id);
      if (!chat) return Result.fail("Chat not found");
      if (chat.organizationId !== input.organizationId) {
        return Result.fail("Chat does not belong to this organization");
      }
      if (chat.creatorId !== input.requesterId && !input.canDeleteAnyChat) {
        return Result.fail("You do not have permission to delete this chat");
      }

      await this.chats.softDeleteById(Identifier.from(input.id));
      return Result.ok();
    });
  }
}
