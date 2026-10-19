import { createDrizzleRepositories } from "@/infrastructure/drizzle/repository-factory";
import {
  Guard,
  Identifier,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";
import type { DbInstance } from "@circulo-ai/db";

export type DeleteChatInput = {
  id: string;
  organizationId: string;
  requesterId: string;
  canDeleteAnyChat: boolean;
};
export type DeleteChatOutput = Result<void>;

export class DeleteChat implements UseCase<DeleteChatInput, DeleteChatOutput> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(input: DeleteChatInput): Promise<DeleteChatOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async (scope) => {
      const { chat: chats } = createDrizzleRepositories(scope.client);
      const chat = await chats.findById(input.id);
      if (!chat) return Result.fail("Chat not found");
      if (chat.organizationId !== input.organizationId) {
        return Result.fail("Chat does not belong to this organization");
      }
      if (chat.creatorId !== input.requesterId && !input.canDeleteAnyChat) {
        return Result.fail("You do not have permission to delete this chat");
      }

      const deleted = await chats.softDeleteById(Identifier.from(input.id));
      if (!deleted) return Result.fail("Chat not found");
      return Result.ok();
    });
  }
}
