import { Entity, Identifier, ValidationError } from "@circulo-ai/core";

export type OrganizationMemberProps = {
  id: Identifier;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
};

export class OrganizationMember extends Entity<OrganizationMemberProps> {
  constructor(protected props: OrganizationMemberProps) {
    super(props);
    this.ensureValid();
  }

  private ensureValid() {
    if (!this.props.organizationId) {
      throw new ValidationError("organizationId is required", "organizationId");
    }
    if (!this.props.userId) {
      throw new ValidationError("userId is required", "userId");
    }
    if (!this.props.role.trim()) {
      throw new ValidationError("role is required", "role");
    }
  }

  changeRole(role: string) {
    if (!role.trim()) throw new ValidationError("role is required", "role");
    this.props = { ...this.props, role };
    this.touch();
  }

  get snapshot(): OrganizationMemberProps {
    return this.props;
  }
}
