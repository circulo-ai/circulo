import { ChatMember } from "@/domain/chat/chat-member";
import { createDrizzleRepositories } from "@/infrastructure/drizzle/repository-factory";
import {
  Identifier,
  NotFoundError,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";
import type { DbInstance } from "@circulo-ai/db";

export type AcceptChatInvitationInput = {
  token: string;
  userId: string;
};

export type AcceptChatInvitationOutput = Result<{
  chatId: string;
  memberId: string;
}>;

export class AcceptChatInvitation implements UseCase<
  AcceptChatInvitationInput,
  AcceptChatInvitationOutput
> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(
    input: AcceptChatInvitationInput,
  ): Promise<AcceptChatInvitationOutput> {
    return this.uow.transaction(async (scope) => {
      const repositories = createDrizzleRepositories(scope.client);
      const invitation = await repositories.chatInvitation.findByToken(
        input.token,
      );
      if (!invitation) throw new NotFoundError("Chat invitation");
      const snap = invitation.snapshot;
      invitation.accept(input.userId, new Date());
      await repositories.chatInvitation.save(invitation);

      const member = new ChatMember({
        id: Identifier.create(),
        chatId: snap.chatId,
        userId: input.userId,
        role: snap.role,
        canInvite: false,
        canManageAgents: false,
        canManageKnowledge: false,
        notificationsEnabled: true,
        lastReadAt: null,
        unreadCount: 0,
        isPinned: false,
        pinnedAt: null,
        pinOrder: null,
        joinedAt: new Date(),
        leftAt: null,
      });
      await repositories.chatMember.save(member);

      return Result.ok({
        chatId: snap.chatId.toString(),
        memberId: member.getId().toString(),
      });
    });
  }
}
