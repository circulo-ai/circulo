import { ChatInvitation } from "@/domain/chat/chat-invitation";
import { createDrizzleRepositories } from "@/infrastructure/drizzle/repository-factory";
import {
  Guard,
  Identifier,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";
import type { DbInstance } from "@circulo-ai/db";
import { randomUUID } from "node:crypto";

export type InviteToChatInput = {
  chatId: string;
  inviterId: string;
  email: string;
  role: string;
  expiresAt: Date;
  message?: string;
};

export type InviteToChatOutput = Result<{
  invitationId: string;
  token: string;
}>;

export class InviteToChat implements UseCase<
  InviteToChatInput,
  InviteToChatOutput
> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(input: InviteToChatInput): Promise<InviteToChatOutput> {
    const chatCheck = Guard.isUuid(input.chatId, "chatId");
    if (!chatCheck.succeeded) return Result.fail(chatCheck.message);

    if (!input.email.includes("@")) {
      return Result.fail("Email is invalid");
    }
    if (input.expiresAt.getTime() <= Date.now()) {
      return Result.fail("Invitation expiry must be in the future");
    }

    return this.uow.transaction(async (scope) => {
      const repositories = createDrizzleRepositories(scope.client);
      const chat = await repositories.chat.getById(
        Identifier.from(input.chatId),
      );
      if (!chat) return Result.fail("Chat not found");

      const membership = await repositories.organizationMember.findByUserAndOrg(
        input.inviterId,
        chat.organizationId,
      );
      if (!membership) {
        return Result.fail("Inviter is not a member of the organization");
      }

      const existing = await repositories.chatInvitation.findPendingByEmail(
        input.email,
        Identifier.from(input.chatId),
      );
      if (existing) {
        return Result.ok({
          invitationId: existing.getId().toString(),
          token: existing.snapshot.token,
        });
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

      await repositories.chatInvitation.save(invitation);
      return Result.ok({
        invitationId: invitation.getId().toString(),
        token: invitation.snapshot.token,
      });
    });
  }
}
