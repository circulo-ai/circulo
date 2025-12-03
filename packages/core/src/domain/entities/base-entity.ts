import { Identifier } from "../value-objects/identifier";

export type EntityProps = {
  id: Identifier;
  createdAt?: Date;
  updatedAt?: Date;
};

export abstract class Entity<TProps extends EntityProps = EntityProps> {
  protected readonly id: Identifier;
  protected readonly createdAt: Date;
  protected updatedAt?: Date;

  protected constructor(props: TProps) {
    this.id = props.id;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt;
  }

  getId(): Identifier {
    return this.id;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date | undefined {
    return this.updatedAt;
  }

  protected touch(): void {
    this.updatedAt = new Date();
  }

  equals(object?: Entity<TProps>): boolean {
    if (!object) return false;
    if (this === object) return true;
    return this.id.equals(object.id);
  }
}
