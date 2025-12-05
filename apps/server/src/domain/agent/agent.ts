import { AggregateRoot, Identifier, ValidationError } from "@circulo-ai/core";

export type AgentProps = {
  id: Identifier;
  organizationId: string;
  createdBy: string;
  name: string;
  instructions: string;
  description?: string;
  avatarUrl?: string;
  model: string;
  maxTokens?: number | null;
  temperature?: number | null;
  isArchived?: boolean;
  defaultToolIds?: string[];
  defaultKnowledgeBaseIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
};

export class Agent extends AggregateRoot<AgentProps> {
  constructor(protected props: AgentProps) {
    super(props);
    this.ensureValid();
  }

  private ensureValid() {
    if (!this.props.name.trim()) {
      throw new ValidationError("Agent name is required", "name");
    }
    if (!this.props.instructions.trim()) {
      throw new ValidationError("Agent instructions are required", "instructions");
    }
    if (!this.props.organizationId) {
      throw new ValidationError("organizationId is required", "organizationId");
    }
    if (!this.props.createdBy) {
      throw new ValidationError("createdBy is required", "createdBy");
    }
  }

  rename(name: string) {
    if (!name.trim()) {
      throw new ValidationError("Agent name is required", "name");
    }
    if (name === this.props.name) return;
    this.props = { ...this.props, name };
    this.touch();
  }

  updateInstructions(instructions: string) {
    if (!instructions.trim()) {
      throw new ValidationError("Agent instructions are required", "instructions");
    }
    if (instructions === this.props.instructions) return;
    this.props = { ...this.props, instructions };
    this.touch();
  }

  archive() {
    if (this.props.isArchived) return;
    this.props = { ...this.props, isArchived: true };
    this.touch();
  }

  unarchive() {
    if (!this.props.isArchived) return;
    this.props = { ...this.props, isArchived: false };
    this.touch();
  }

  updateModel(config: { model?: string; maxTokens?: number | null; temperature?: number | null }) {
    const next = { ...this.props, ...config };
    this.props = next;
    this.touch();
  }

  updateDefaults(defaults: { toolIds?: string[]; knowledgeBaseIds?: string[] }) {
    this.props = {
      ...this.props,
      defaultToolIds: defaults.toolIds ?? this.props.defaultToolIds ?? [],
      defaultKnowledgeBaseIds:
        defaults.knowledgeBaseIds ?? this.props.defaultKnowledgeBaseIds ?? [],
    };
    this.touch();
  }

  get name(): string {
    return this.props.name;
  }

  get instructions(): string {
    return this.props.instructions;
  }

  get snapshot(): AgentProps {
    return this.props;
  }
}
