import { AggregateRoot, Identifier, ValidationError } from "@circulo-ai/core";

export type ArtifactProps = {
  id: Identifier;
  chatId?: Identifier | null;
  userId: string;
  title: string;
  content?: string | null;
  kind: "text" | "code" | "image" | "sheet";
  version: number;
  createdAt: Date;
  updatedAt?: Date;
};

export class Artifact extends AggregateRoot<ArtifactProps> {
  constructor(protected props: ArtifactProps) {
    super(props);
    this.ensureValid();
  }

  private ensureValid() {
    if (!this.props.title.trim()) {
      throw new ValidationError("Artifact title is required", "title");
    }
    if (!this.props.userId) {
      throw new ValidationError("userId is required", "userId");
    }
    if (this.props.version <= 0) {
      throw new ValidationError("version must be positive", "version");
    }
  }

  rename(title: string) {
    if (!title.trim())
      throw new ValidationError("Artifact title is required", "title");
    this.props = { ...this.props, title };
    this.touch();
  }

  updateContent(content: string | null) {
    this.props = { ...this.props, content };
    this.touch();
  }

  bumpVersion() {
    this.props = { ...this.props, version: this.props.version + 1 };
    this.touch();
  }

  get snapshot(): ArtifactProps {
    return this.props;
  }
}
