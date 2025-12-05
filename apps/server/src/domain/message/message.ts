import { Entity, Identifier, ValidationError } from "@circulo-ai/core";

export type MessageProps = {
  id: Identifier;
  chatId: Identifier;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
};

export class Message extends Entity<MessageProps> {
  constructor(protected props: MessageProps) {
    super(props);
    this.ensureValid();
  }

  private ensureValid() {
    if (!this.props.content.trim()) {
      throw new ValidationError("Message content is required", "content");
    }
    if (!this.props.chatId) {
      throw new ValidationError("chatId is required", "chatId");
    }
  }

  edit(content: string) {
    if (!content.trim()) {
      throw new ValidationError("Message content is required", "content");
    }
    if (content === this.props.content) return;
    this.props = { ...this.props, content };
    this.touch();
  }

  get chatId(): Identifier {
    return this.props.chatId;
  }

  get authorId(): string {
    return this.props.authorId;
  }

  get content(): string {
    return this.props.content;
  }

  get snapshot(): MessageProps {
    return this.props;
  }
}
