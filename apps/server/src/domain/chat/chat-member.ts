import { Entity, Identifier, ValidationError } from "@circulo-ai/core";

export type ChatMemberProps = {
  id: Identifier;
  chatId: Identifier;
  userId: string;
  role: string;
  canInvite: boolean;
  canManageAgents: boolean;
  canManageKnowledge: boolean;
  notificationsEnabled: boolean;
  lastReadAt?: Date | null;
  unreadCount: number;
  isPinned: boolean;
  pinnedAt?: Date | null;
  pinOrder?: number | null;
  joinedAt: Date;
  leftAt?: Date | null;
};

export class ChatMember extends Entity<ChatMemberProps> {
  constructor(protected props: ChatMemberProps) {
    super(props);
    this.ensureValid();
  }

  private ensureValid() {
    if (!this.props.userId)
      throw new ValidationError("userId is required", "userId");
    if (!this.props.chatId)
      throw new ValidationError("chatId is required", "chatId");
    if (!this.props.role.trim())
      throw new ValidationError("role is required", "role");
    if (this.props.unreadCount < 0) {
      throw new ValidationError(
        "unreadCount cannot be negative",
        "unreadCount",
      );
    }
  }

  markRead(at: Date) {
    this.props = { ...this.props, lastReadAt: at, unreadCount: 0 };
    this.touch();
  }

  incrementUnread(by = 1) {
    const unreadCount = this.props.unreadCount + by;
    this.props = { ...this.props, unreadCount };
    this.touch();
  }

  pin(order?: number) {
    this.props = {
      ...this.props,
      isPinned: true,
      pinnedAt: new Date(),
      pinOrder: order ?? this.props.pinOrder ?? 0,
    };
    this.touch();
  }

  unpin() {
    this.props = {
      ...this.props,
      isPinned: false,
      pinnedAt: null,
      pinOrder: null,
    };
    this.touch();
  }

  updatePermissions(permissions: {
    canInvite?: boolean;
    canManageAgents?: boolean;
    canManageKnowledge?: boolean;
  }) {
    this.props = {
      ...this.props,
      canInvite: permissions.canInvite ?? this.props.canInvite,
      canManageAgents:
        permissions.canManageAgents ?? this.props.canManageAgents,
      canManageKnowledge:
        permissions.canManageKnowledge ?? this.props.canManageKnowledge,
    };
    this.touch();
  }

  changeRole(role: string) {
    if (!role.trim()) throw new ValidationError("role is required", "role");
    this.props = { ...this.props, role };
    this.touch();
  }

  leave(at: Date) {
    this.props = { ...this.props, leftAt: at };
    this.touch();
  }

  get snapshot(): ChatMemberProps {
    return this.props;
  }
}
