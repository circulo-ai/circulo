import { DomainError } from "./domain-error";

export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string) {
    super(id ? `${entity} with id ${id} not found` : `${entity} not found`);
  }
}
