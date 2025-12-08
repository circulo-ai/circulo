import { ValidationError, ValueObject } from "@circulo-ai/core";

export type VoteProps = {
  chatId: string;
  messageId: string;
  userId: string;
  isUpvoted: boolean;
};

export class Vote extends ValueObject<VoteProps> {
  private constructor(props: VoteProps) {
    super(props);
  }

  static create(props: VoteProps): Vote {
    if (!props.chatId)
      throw new ValidationError("chatId is required", "chatId");
    if (!props.messageId)
      throw new ValidationError("messageId is required", "messageId");
    if (!props.userId)
      throw new ValidationError("userId is required", "userId");
    return new Vote(props);
  }

  get chatId(): string {
    return this.props.chatId;
  }

  get messageId(): string {
    return this.props.messageId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get isUpvoted(): boolean {
    return this.props.isUpvoted;
  }
}
