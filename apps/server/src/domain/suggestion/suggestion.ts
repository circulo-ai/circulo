import { Entity, Identifier, ValidationError } from "@circulo-ai/core";

export type SuggestionProps = {
  id: Identifier;
  documentId: Identifier;
  userId: string;
  originalText: string;
  suggestedText: string;
  description?: string | null;
  isResolved: boolean;
  createdAt: Date;
};

export class Suggestion extends Entity<SuggestionProps> {
  constructor(protected props: SuggestionProps) {
    super(props);
    this.ensureValid();
  }

  private ensureValid() {
    if (!this.props.originalText.trim()) {
      throw new ValidationError("originalText is required", "originalText");
    }
    if (!this.props.suggestedText.trim()) {
      throw new ValidationError("suggestedText is required", "suggestedText");
    }
  }

  resolve() {
    if (this.props.isResolved) return;
    this.props = { ...this.props, isResolved: true };
    this.touch();
  }

  reopen() {
    if (!this.props.isResolved) return;
    this.props = { ...this.props, isResolved: false };
    this.touch();
  }

  get snapshot(): SuggestionProps {
    return this.props;
  }
}
