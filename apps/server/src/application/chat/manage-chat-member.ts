import { ChatMember } from "@/domain/chat/chat-member";
import { createDrizzleRepositories } from "@/infrastructure/drizzle/repository-factory";
import {
  Guard,
  Identifier,
  NotFoundError,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";
import type { DbInstance } from "@circulo-ai/db";

export type AddChatMemberInput = {
  chatId: string;
  userId: string;
  role: string;
  permissions?: {
    canInvite?: boolean;
    canManageAgents?: boolean;
    canManageKnowledge?: boolean;
  };
};

export type RemoveChatMemberInput = {
  memberId: string;
};

export type UpdateChatMemberPermissionsInput = {
  memberId: string;
  permissions: {
    canInvite?: boolean;
    canManageAgents?: boolean;
    canManageKnowledge?: boolean;
  };
};

export type AddChatMemberOutput = Result<{ memberId: string }>;
export type RemoveChatMemberOutput = Result<void>;
export type UpdateChatMemberPermissionsOutput = Result<void>;

export class AddChatMember implements UseCase<
  AddChatMemberInput,
  AddChatMemberOutput
> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(input: AddChatMemberInput): Promise<AddChatMemberOutput> {
    const chatCheck = Guard.isUuid(input.chatId, "chatId");
    if (!chatCheck.succeeded) return Result.fail(chatCheck.message);
    const userCheck = Guard.againstEmptyString(input.userId, "userId");
    if (!userCheck.succeeded) return Result.fail(userCheck.message);

    return this.uow.transaction(async (scope) => {
      const { chatMember: members } = createDrizzleRepositories(scope.client);
      const member = new ChatMember({
        id: Identifier.create(),
        chatId: Identifier.from(input.chatId),
        userId: input.userId,
        role: input.role || "member",
        canInvite: input.permissions?.canInvite ?? false,
        canManageAgents: input.permissions?.canManageAgents ?? false,
        canManageKnowledge: input.permissions?.canManageKnowledge ?? false,
        notificationsEnabled: true,
        lastReadAt: null,
        unreadCount: 0,
        isPinned: false,
        pinnedAt: null,
        pinOrder: null,
        joinedAt: new Date(),
        leftAt: null,
      });
      await members.save(member);
      return Result.ok({ memberId: member.getId().toString() });
    });
  }
}

export class RemoveChatMember implements UseCase<
  RemoveChatMemberInput,
  RemoveChatMemberOutput
> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(input: RemoveChatMemberInput): Promise<RemoveChatMemberOutput> {
    const idCheck = Guard.isUuid(input.memberId, "memberId");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async (scope) => {
      const { chatMember: members } = createDrizzleRepositories(scope.client);
      await members.deleteById(Identifier.from(input.memberId));
      return Result.ok();
    });
  }
}

export class UpdateChatMemberPermissions implements UseCase<
  UpdateChatMemberPermissionsInput,
  UpdateChatMemberPermissionsOutput
> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(
    input: UpdateChatMemberPermissionsInput,
  ): Promise<UpdateChatMemberPermissionsOutput> {
    const idCheck = Guard.isUuid(input.memberId, "memberId");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async (scope) => {
      const { chatMember: members } = createDrizzleRepositories(scope.client);
      const member = await members.getById(Identifier.from(input.memberId));
      if (!member) throw new NotFoundError("Chat member", input.memberId);
      member.updatePermissions(input.permissions);
      await members.save(member);
      return Result.ok();
    });
  }
}
