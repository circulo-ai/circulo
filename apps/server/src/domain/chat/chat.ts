import {
  AggregateRoot,
  Identifier,
  ValidationError,
  type DomainEvent,
} from "@circulo-ai/core";
import { CHAT_EVENTS } from "./events";

export type ChatProps = {
  id: Identifier;
  title: string;
  organizationId: string;
  creatorId: string;
  visibility: "private" | "public";
  createdAt: Date;
  updatedAt?: Date;
};

export class Chat extends AggregateRoot<ChatProps> {
  constructor(protected props: ChatProps) {
    super(props);
    this.ensureValid();
  }

  private ensureValid() {
    if (!this.props.title.trim()) {
      throw new ValidationError("Chat title is required", "title");
    }
    if (!this.props.organizationId) {
      throw new ValidationError("organizationId is required", "organizationId");
    }
    if (!this.props.creatorId) {
      throw new ValidationError("creatorId is required", "creatorId");
    }
  }

  rename(title: string) {
    if (!title.trim()) {
      throw new ValidationError("Chat title is required", "title");
    }
    if (title === this.props.title) return;
    this.props = { ...this.props, title };
    this.touch();
    this.addDomainEvent(this.buildEvent(CHAT_EVENTS.ChatRenamed, { title }));
  }

  changeVisibility(visibility: "private" | "public") {
    if (visibility === this.props.visibility) return;
    this.props = { ...this.props, visibility };
    this.touch();
    this.addDomainEvent(
      this.buildEvent(CHAT_EVENTS.ChatVisibilityChanged, { visibility }),
    );
  }

  get title(): string {
    return this.props.title;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get creatorId(): string {
    return this.props.creatorId;
  }

  get visibility(): "private" | "public" {
    return this.props.visibility;
  }

  get snapshot(): ChatProps {
    return this.props;
  }

  private buildEvent(
    name: (typeof CHAT_EVENTS)[keyof typeof CHAT_EVENTS],
    payload: Record<string, unknown>,
  ): DomainEvent {
    return {
      name,
      occurredOn: new Date(),
      aggregateId: this.aggregateId.toString(),
      payload,
    };
  }
}
