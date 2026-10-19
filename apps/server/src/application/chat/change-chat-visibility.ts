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
    private readonly uow: UnitOfWork<{ client: DbInstance }>,
    private readonly publisher: DomainEventPublisher,
  ) {}

  async execute(
    input: ChangeChatVisibilityInput,
  ): Promise<ChangeChatVisibilityOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async (scope) => {
      const { chat: chats } = createDrizzleRepositories(scope.client);
      const chat = await chats.getById(Identifier.from(input.id));
      if (!chat) throw new NotFoundError("Chat", input.id);
      chat.changeVisibility(input.visibility);
      await chats.save(chat);
      await Promise.all(
        chat.pullDomainEvents().map((evt) => this.publisher.publish(evt)),
      );
      return Result.ok();
    });
  }
}
