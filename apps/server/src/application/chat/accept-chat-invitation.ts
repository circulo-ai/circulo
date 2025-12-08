import { ChatMember } from "@/domain/chat/chat-member";
import type { DrizzleChatInvitationRepository } from "@/infrastructure/drizzle/chat-invitation-repository";
import type { DrizzleChatMemberRepository } from "@/infrastructure/drizzle/chat-member-repository";
import {
  Identifier,
  NotFoundError,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";

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
  constructor(
    private readonly invitations: DrizzleChatInvitationRepository,
    private readonly members: DrizzleChatMemberRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(
    input: AcceptChatInvitationInput,
  ): Promise<AcceptChatInvitationOutput> {
    return this.uow.transaction(async () => {
      const invitation = await this.invitations.findByToken(input.token);
      if (!invitation) throw new NotFoundError("Chat invitation");
      const snap = invitation.snapshot;
      invitation.accept(input.userId, new Date());
      await this.invitations.save(invitation);

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
      await this.members.save(member);

      return Result.ok({
        chatId: snap.chatId.toString(),
        memberId: member.getId().toString(),
      });
    });
  }
}
