import { Message } from "@/domain/message/message";
import { createDrizzleRepositories } from "@/infrastructure/drizzle";
import {
  Guard,
  Identifier,
  NotFoundError,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";
import type { DbInstance } from "@circulo-ai/db";

export type PostMessageInput = {
  id: string;
  chatId: string;
  authorId: string;
  content: string;
  parts?: unknown[];
  attachments?: unknown[];
};

export type PostMessageOutput = Result<{ messageId: string }>;

export class PostMessage implements UseCase<
  PostMessageInput,
  PostMessageOutput
> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(input: PostMessageInput): Promise<PostMessageOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    const chatCheck = Guard.isUuid(input.chatId, "chatId");
    if (!chatCheck.succeeded) return Result.fail(chatCheck.message);

    const contentCheck = Guard.againstEmptyString(input.content, "content");
    if (!contentCheck.succeeded) return Result.fail(contentCheck.message);

    return this.uow.transaction(async (scope) => {
      const repositories = createDrizzleRepositories(scope.client);
      const chat = await repositories.chat.getById(
        Identifier.from(input.chatId),
      );
      if (!chat) throw new NotFoundError("Chat", input.chatId);

      const message = new Message({
        id: Identifier.from(input.id),
        chatId: chat.aggregateId,
        authorId: input.authorId,
        content: input.content,
        parts: input.parts,
        attachments: input.attachments,
        createdAt: new Date(),
      });

      await repositories.message.save(message);

      return Result.ok({ messageId: message.getId().toString() });
    });
  }
}
