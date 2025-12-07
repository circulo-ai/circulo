import {
  Guard,
  Identifier,
  NotFoundError,
  Result,
  type DomainEventPublisher,
  type UseCase,
  type UnitOfWork,
} from "@circulo-ai/core";
import { Chat } from "@/domain/chat/chat";
import type { DrizzleChatRepository } from "@/infrastructure/drizzle/chat-repository";
import type { DrizzleOrganizationMemberRepository } from "@/infrastructure/drizzle/organization-member-repository";

export type CreateChatInput = {
  id: string;
  organizationId: string;
  creatorId: string;
  title: string;
  visibility: "private" | "public";
};

export type CreateChatOutput = Result<{ chatId: string }>;

export class CreateChat implements UseCase<CreateChatInput, CreateChatOutput> {
  constructor(
    private readonly chats: DrizzleChatRepository,
    private readonly members: DrizzleOrganizationMemberRepository,
    private readonly uow: UnitOfWork,
    private readonly publisher: DomainEventPublisher,
  ) {}

  async execute(input: CreateChatInput): Promise<CreateChatOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    const orgCheck = Guard.againstEmptyString(
      input.organizationId,
      "organizationId",
    );
    if (!orgCheck.succeeded) return Result.fail(orgCheck.message);

    const titleCheck = Guard.againstEmptyString(input.title, "title");
    if (!titleCheck.succeeded) return Result.fail(titleCheck.message);

    return this.uow.transaction(async () => {
      const membership = await this.members.findByUserAndOrg(
        input.creatorId,
        input.organizationId,
      );
      if (!membership) {
        throw new NotFoundError("Organization membership");
      }

      const chat = new Chat({
        id: Identifier.from(input.id),
        organizationId: input.organizationId,
        creatorId: input.creatorId,
        title: input.title,
        visibility: input.visibility,
        createdAt: new Date(),
      });

      await this.chats.save(chat);
      await Promise.all(
        chat.pullDomainEvents().map((evt) => this.publisher.publish(evt)),
      );

      return Result.ok({ chatId: chat.aggregateId.toString() });
    });
  }
}
