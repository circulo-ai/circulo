import {
  Guard,
  Identifier,
  NotFoundError,
  Result,
  type DomainEventPublisher,
  type UseCase,
  type UnitOfWork,
} from "@circulo-ai/core";
import type { DrizzleChatRepository } from "@/infrastructure/drizzle/chat-repository";

export type RenameChatInput = {
  id: string;
  requesterId: string;
  title: string;
};

export type RenameChatOutput = Result<void>;

export class RenameChat implements UseCase<RenameChatInput, RenameChatOutput> {
  constructor(
    private readonly chats: DrizzleChatRepository,
    private readonly uow: UnitOfWork,
    private readonly publisher: DomainEventPublisher,
  ) {}

  async execute(input: RenameChatInput): Promise<RenameChatOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);
    const titleCheck = Guard.againstEmptyString(input.title, "title");
    if (!titleCheck.succeeded) return Result.fail(titleCheck.message);

    return this.uow.transaction(async () => {
      const chat = await this.chats.getById(Identifier.from(input.id));
      if (!chat) throw new NotFoundError("Chat", input.id);

      chat.rename(input.title);
      await this.chats.save(chat);
      await Promise.all(
        chat.pullDomainEvents().map((evt) => this.publisher.publish(evt)),
      );
      return Result.ok();
    });
  }
}
