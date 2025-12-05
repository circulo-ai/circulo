import {
  Guard,
  Identifier,
  Result,
  ValidationError,
  type UseCase,
  type UnitOfWork,
} from "@circulo-ai/core";
import { randomUUID } from "crypto";
import { ChatInvitation } from "@/domain/chat/chat-invitation";
import type { DrizzleChatInvitationRepository } from "@/infrastructure/drizzle/chat-invitation-repository";
import type { DrizzleChatRepository } from "@/infrastructure/drizzle/chat-repository";
import type { DrizzleOrganizationMemberRepository } from "@/infrastructure/drizzle/organization-member-repository";

export type InviteToChatInput = {
  chatId: string;
  inviterId: string;
  email: string;
  role: string;
  expiresAt: Date;
  message?: string;
};

export type InviteToChatOutput = Result<{ invitationId: string; token: string }>;

export class InviteToChat
  implements UseCase<InviteToChatInput, InviteToChatOutput>
{
  constructor(
    private readonly chats: DrizzleChatRepository,
    private readonly invitations: DrizzleChatInvitationRepository,
    private readonly members: DrizzleOrganizationMemberRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: InviteToChatInput): Promise<InviteToChatOutput> {
    const chatCheck = Guard.isUuid(input.chatId, "chatId");
    if (!chatCheck.succeeded) return Result.fail(chatCheck.message);

    if (!input.email.includes("@")) {
      return Result.fail("Email is invalid");
    }
    if (input.expiresAt.getTime() <= Date.now()) {
      return Result.fail("Invitation expiry must be in the future");
    }

    return this.uow.transaction(async () => {
      const chat = await this.chats.getById(Identifier.from(input.chatId));
      if (!chat) return Result.fail("Chat not found");

      const membership = await this.members.findByUserAndOrg(
        input.inviterId,
        chat.organizationId,
      );
      if (!membership) {
        return Result.fail("Inviter is not a member of the organization");
      }

      const existing = await this.invitations.findPendingByEmail(
        input.email,
        Identifier.from(input.chatId),
      );
      if (existing) {
        return Result.ok({ invitationId: existing.getId().toString(), token: existing.snapshot.token });
      }

      const invitation = new ChatInvitation({
        id: Identifier.create(),
        chatId: chat.aggregateId,
        inviterId: input.inviterId,
        email: input.email,
        inviteeId: null,
        role: input.role || "member",
        status: "pending",
        token: randomUUID(),
        message: input.message ?? null,
        expiresAt: input.expiresAt,
        createdAt: new Date(),
      });

      await this.invitations.save(invitation);
      return Result.ok({
        invitationId: invitation.getId().toString(),
        token: invitation.snapshot.token,
      });
    });
  }
}
