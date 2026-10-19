import { createDrizzleRepositories } from "@/infrastructure/drizzle/repository-factory";
import {
  Guard,
  Identifier,
  NotFoundError,
  Result,
  type DomainEventPublisher,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";
import type { DbInstance } from "@circulo-ai/db";

export type RenameChatInput = {
  id: string;
  requesterId: string;
  title: string;
};

export type RenameChatOutput = Result<void>;

export class RenameChat implements UseCase<RenameChatInput, RenameChatOutput> {
  constructor(
    private readonly uow: UnitOfWork<{ client: DbInstance }>,
    private readonly publisher: DomainEventPublisher,
  ) {}

  async execute(input: RenameChatInput): Promise<RenameChatOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);
    const titleCheck = Guard.againstEmptyString(input.title, "title");
    if (!titleCheck.succeeded) return Result.fail(titleCheck.message);

    return this.uow.transaction(async (scope) => {
      const { chat: chats } = createDrizzleRepositories(scope.client);
      const chat = await chats.getById(Identifier.from(input.id));
      if (!chat) throw new NotFoundError("Chat", input.id);

      chat.rename(input.title);
      await chats.save(chat);
      await Promise.all(
        chat.pullDomainEvents().map((evt) => this.publisher.publish(evt)),
      );
      return Result.ok();
    });
  }
}
