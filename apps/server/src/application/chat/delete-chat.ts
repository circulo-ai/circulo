import {
  Guard,
  Identifier,
  Result,
  type UseCase,
  type UnitOfWork,
} from "@circulo-ai/core";
import type { DrizzleChatRepository } from "@/infrastructure/drizzle/chat-repository";

export type DeleteChatInput = { id: string };
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
      await this.chats.deleteById(Identifier.from(input.id));
      return Result.ok();
    });
  }
}
