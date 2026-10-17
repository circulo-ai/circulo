import { Chat } from "@/domain/chat/chat";
import { ChatAgentLink } from "@/domain/chat/chat-agent-link";
import { Message } from "@/domain/message/message";
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

export type CreateChatWithMessageInput = {
  id: string;
  messageId: string;
  organizationId: string;
  creatorId: string;
  title: string;
  visibility: "private" | "public";
  content: string;
  parts?: unknown[];
  attachments?: unknown[];
  agentIds: string[];
};

export type CreateChatWithMessageOutput = Result<{
  chatId: string;
  eventId: string;
}>;

export class CreateChatWithMessage implements UseCase<
  CreateChatWithMessageInput,
  CreateChatWithMessageOutput
> {
  constructor(
    private readonly uow: UnitOfWork<{ client: DbInstance }>,
    private readonly publisher: DomainEventPublisher,
  ) {}

  async execute(
    input: CreateChatWithMessageInput,
  ): Promise<CreateChatWithMessageOutput> {
    for (const [value, name] of [
      [input.id, "id"],
      [input.messageId, "messageId"],
    ] as const) {
      const check = Guard.isUuid(value, name);
      if (!check.succeeded) return Result.fail(check.message);
    }

    for (const [value, name] of [
      [input.organizationId, "organizationId"],
      [input.creatorId, "creatorId"],
      [input.title, "title"],
      [input.content, "content"],
    ] as const) {
      const check = Guard.againstEmptyString(value, name);
      if (!check.succeeded) return Result.fail(check.message);
    }

    return this.uow.transaction(async (scope) => {
      // Repositories used inside the unit of work must share its transaction
      // client. Reusing the request-scoped repositories here bypasses the
      // transaction and deadlocks single-connection databases such as PGlite.
      const repositories = createDrizzleRepositories(scope.client);
      const membership = await repositories.organizationMember.findByUserAndOrg(
        input.creatorId,
        input.organizationId,
      );
      if (!membership) throw new NotFoundError("Organization membership");

      const chat = new Chat({
        id: Identifier.from(input.id),
        organizationId: input.organizationId,
        creatorId: input.creatorId,
        title: input.title,
        visibility: input.visibility,
        createdAt: new Date(),
      });

      await repositories.chat.save(chat);
      await repositories.chatMember.createOwner(
        chat.aggregateId.toString(),
        input.creatorId,
      );
      await repositories.message.save(
        new Message({
          id: Identifier.from(input.messageId),
          chatId: chat.aggregateId,
          authorId: input.creatorId,
          content: input.content,
          parts: input.parts,
          attachments: input.attachments,
          createdAt: new Date(),
        }),
      );

      for (const agentId of input.agentIds) {
        await repositories.chatAgentLink.save(
          new ChatAgentLink({
            id: Identifier.create(),
            chatId: chat.aggregateId,
            agentId: Identifier.from(agentId),
            addedBy: input.creatorId,
            isEnabled: true,
            customInstructions: null,
            customTemperature: null,
            createdAt: new Date(),
          }),
        );
      }

      const [event] = chat.pullDomainEvents();
      if (event) await this.publisher.publish(event);

      return Result.ok({
        chatId: chat.aggregateId.toString(),
        eventId: chat.aggregateId.toString(),
      });
    });
  }
}
