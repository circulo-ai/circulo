import {
  Guard,
  Identifier,
  NotFoundError,
  Result,
  type UseCase,
  type UnitOfWork,
} from "@circulo-ai/core";
import { Message } from "@/domain/message/message";
import type { DrizzleChatRepository } from "@/infrastructure/drizzle/chat-repository";
import type { DrizzleMessageRepository } from "@/infrastructure/drizzle/message-repository";

export type PostMessageInput = {
  id: string;
  chatId: string;
  authorId: string;
  content: string;
};

export type PostMessageOutput = Result<{ messageId: string }>;

export class PostMessage implements UseCase<
  PostMessageInput,
  PostMessageOutput
> {
  constructor(
    private readonly chats: DrizzleChatRepository,
    private readonly messages: DrizzleMessageRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: PostMessageInput): Promise<PostMessageOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    const chatCheck = Guard.isUuid(input.chatId, "chatId");
    if (!chatCheck.succeeded) return Result.fail(chatCheck.message);

    const contentCheck = Guard.againstEmptyString(input.content, "content");
    if (!contentCheck.succeeded) return Result.fail(contentCheck.message);

    return this.uow.transaction(async () => {
      const chat = await this.chats.getById(Identifier.from(input.chatId));
      if (!chat) throw new NotFoundError("Chat", input.chatId);

      const message = new Message({
        id: Identifier.from(input.id),
        chatId: chat.aggregateId,
        authorId: input.authorId,
        content: input.content,
        createdAt: new Date(),
      });

      await this.messages.save(message);

      return Result.ok({ messageId: message.getId().toString() });
    });
  }
}
