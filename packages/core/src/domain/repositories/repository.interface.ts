import type { Identifier } from "../value-objects/identifier";

export interface Repository<T> {
  getById(id: Identifier): Promise<T | null>;
  save(entity: T): Promise<T>;
  deleteById(id: Identifier): Promise<boolean>;
}
