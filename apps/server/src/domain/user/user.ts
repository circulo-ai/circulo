import { AggregateRoot, Identifier, ValidationError } from "@circulo-ai/core";

export type UserProps = {
  id: Identifier;
  email: string;
  displayName: string;
  createdAt: Date;
  updatedAt?: Date;
};

export class User extends AggregateRoot<UserProps> {
  constructor(protected props: UserProps) {
    super(props);
    this.ensureValid();
  }

  private ensureValid() {
    if (!this.props.email.includes("@")) {
      throw new ValidationError("Email must be valid", "email");
    }
    if (!this.props.displayName.trim()) {
      throw new ValidationError("Display name is required", "displayName");
    }
  }

  rename(displayName: string) {
    if (!displayName.trim()) {
      throw new ValidationError("Display name is required", "displayName");
    }
    if (displayName === this.props.displayName) return;
    this.props = { ...this.props, displayName };
    this.touch();
  }

  get email(): string {
    return this.props.email;
  }

  get displayName(): string {
    return this.props.displayName;
  }

  get snapshot(): UserProps {
    return this.props;
  }
}
