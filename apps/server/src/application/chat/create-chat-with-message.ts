import { Chat } from "@/domain/chat/chat";
import { ChatAgentLink } from "@/domain/chat/chat-agent-link";
import { Message } from "@/domain/message/message";
import type { DrizzleChatAgentLinkRepository } from "@/infrastructure/drizzle/chat-agent-link-repository";
import type { DrizzleChatMemberRepository } from "@/infrastructure/drizzle/chat-member-repository";
import type { DrizzleChatRepository } from "@/infrastructure/drizzle/chat-repository";
import type { DrizzleMessageRepository } from "@/infrastructure/drizzle/message-repository";
import type { DrizzleOrganizationMemberRepository } from "@/infrastructure/drizzle/organization-member-repository";
import {
  Guard,
  Identifier,
  NotFoundError,
  Result,
  type DomainEventPublisher,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";

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
    private readonly chats: DrizzleChatRepository,
    private readonly chatMembers: DrizzleChatMemberRepository,
    private readonly messages: DrizzleMessageRepository,
    private readonly links: DrizzleChatAgentLinkRepository,
    private readonly members: DrizzleOrganizationMemberRepository,
    private readonly uow: UnitOfWork,
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

    return this.uow.transaction(async () => {
      const membership = await this.members.findByUserAndOrg(
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

      await this.chats.save(chat);
      await this.chatMembers.createOwner(
        chat.aggregateId.toString(),
        input.creatorId,
      );
      await this.messages.save(
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
        await this.links.save(
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
