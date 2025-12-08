import { DomainError } from "./domain-error";

export class ValidationError extends DomainError {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}
