import { AggregateRoot, Identifier, ValidationError } from "@circulo-ai/core";

export type OrganizationProps = {
  id: Identifier;
  name: string;
  createdAt: Date;
  updatedAt?: Date;
};

export class Organization extends AggregateRoot<OrganizationProps> {
  constructor(protected props: OrganizationProps) {
    super(props);
    this.ensureValid();
  }

  private ensureValid() {
    if (!this.props.name.trim()) {
      throw new ValidationError("Organization name is required", "name");
    }
  }

  rename(name: string) {
    if (!name.trim()) {
      throw new ValidationError("Organization name is required", "name");
    }
    if (name === this.props.name) return;
    this.props = { ...this.props, name };
    this.touch();
  }

  get name(): string {
    return this.props.name;
  }

  get snapshot(): OrganizationProps {
    return this.props;
  }
}
