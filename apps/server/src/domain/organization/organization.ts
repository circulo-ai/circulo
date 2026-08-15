import { AggregateRoot, Identifier, ValidationError } from "@circulo-ai/core";

export type OrganizationProps = {
  id: Identifier;
  name: string;
  slug?: string;
  createdAt: Date;
  updatedAt?: Date;
};

export class Organization extends AggregateRoot<OrganizationProps> {
  constructor(protected props: OrganizationProps) {
    super(props);
    this.props = {
      ...this.props,
      slug: this.props.slug ?? Organization.slugify(this.props.name),
    };
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

  get slug(): string {
    return this.props.slug ?? Organization.slugify(this.props.name);
  }

  get snapshot(): OrganizationProps {
    return this.props;
  }

  private static slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
