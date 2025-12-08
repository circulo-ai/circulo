import type { DrizzleChatRepository } from "@/infrastructure/drizzle/chat-repository";
import {
  Guard,
  Identifier,
  NotFoundError,
  Result,
  type DomainEventPublisher,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";

export type ChangeChatVisibilityInput = {
  id: string;
  visibility: "private" | "public";
};

export type ChangeChatVisibilityOutput = Result<void>;

export class ChangeChatVisibility implements UseCase<
  ChangeChatVisibilityInput,
  ChangeChatVisibilityOutput
> {
  constructor(
    private readonly chats: DrizzleChatRepository,
    private readonly uow: UnitOfWork,
    private readonly publisher: DomainEventPublisher,
  ) {}

  async execute(
    input: ChangeChatVisibilityInput,
  ): Promise<ChangeChatVisibilityOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async () => {
      const chat = await this.chats.getById(Identifier.from(input.id));
      if (!chat) throw new NotFoundError("Chat", input.id);
      chat.changeVisibility(input.visibility);
      await this.chats.save(chat);
      await Promise.all(
        chat.pullDomainEvents().map((evt) => this.publisher.publish(evt)),
      );
      return Result.ok();
    });
  }
}
