import { Entity, Identifier, ValidationError } from "@circulo-ai/core";

export type InvitationStatus = "pending" | "accepted" | "declined" | "expired";

export type ChatInvitationProps = {
  id: Identifier;
  chatId: Identifier;
  inviterId: string;
  email: string;
  inviteeId?: string | null;
  role: string;
  status: InvitationStatus;
  token: string;
  message?: string | null;
  expiresAt: Date;
  acceptedAt?: Date | null;
  createdAt: Date;
};

export class ChatInvitation extends Entity<ChatInvitationProps> {
  constructor(protected props: ChatInvitationProps) {
    super(props);
    this.ensureValid();
  }

  private ensureValid() {
    if (!this.props.email.includes("@")) {
      throw new ValidationError("email must be valid", "email");
    }
    if (!this.props.role.trim()) {
      throw new ValidationError("role is required", "role");
    }
    if (!this.props.token.trim()) {
      throw new ValidationError("token is required", "token");
    }
    if (this.props.expiresAt.getTime() <= Date.now()) {
      throw new ValidationError("expiresAt must be in the future", "expiresAt");
    }
  }

  accept(inviteeId: string, at: Date = new Date()) {
    this.props = {
      ...this.props,
      status: "accepted",
      inviteeId,
      acceptedAt: at,
    };
    this.touch();
  }

  decline() {
    this.props = { ...this.props, status: "declined" };
    this.touch();
  }

  expire() {
    this.props = { ...this.props, status: "expired" };
    this.touch();
  }

  get snapshot(): ChatInvitationProps {
    return this.props;
  }
}
