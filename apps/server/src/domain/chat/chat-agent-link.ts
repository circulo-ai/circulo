import { Entity, Identifier, ValidationError } from "@circulo-ai/core";

export type ChatAgentLinkProps = {
  id: Identifier;
  chatId: Identifier;
  agentId: Identifier;
  addedBy: string;
  isEnabled: boolean;
  customInstructions?: string | null;
  customTemperature?: number | null;
  createdAt: Date;
};

export class ChatAgentLink extends Entity<ChatAgentLinkProps> {
  constructor(protected props: ChatAgentLinkProps) {
    super(props);
    this.ensureValid();
  }

  private ensureValid() {
    if (!this.props.addedBy) {
      throw new ValidationError("addedBy is required", "addedBy");
    }
  }

  enable() {
    if (this.props.isEnabled) return;
    this.props = { ...this.props, isEnabled: true };
    this.touch();
  }

  disable() {
    if (!this.props.isEnabled) return;
    this.props = { ...this.props, isEnabled: false };
    this.touch();
  }

  updateOverrides(overrides: {
    instructions?: string | null;
    temperature?: number | null;
  }) {
    this.props = {
      ...this.props,
      customInstructions:
        overrides.instructions ?? this.props.customInstructions ?? null,
      customTemperature:
        overrides.temperature ?? this.props.customTemperature ?? null,
    };
    this.touch();
  }

  get snapshot(): ChatAgentLinkProps {
    return this.props;
  }
}
