import { ValidationError, ValueObject } from "@circulo-ai/core";

export type PermissionProps = {
  resource: string;
  action: string;
  organizationId?: string;
};

export class Permission extends ValueObject<PermissionProps> {
  private constructor(props: PermissionProps) {
    super(props);
  }

  static create(props: PermissionProps): Permission {
    if (!props.resource.trim()) {
      throw new ValidationError("resource is required", "resource");
    }
    if (!props.action.trim()) {
      throw new ValidationError("action is required", "action");
    }
    return new Permission(props);
  }

  get resource(): string {
    return this.props.resource;
  }

  get action(): string {
    return this.props.action;
  }

  get organizationId(): string | undefined {
    return this.props.organizationId;
  }
}
