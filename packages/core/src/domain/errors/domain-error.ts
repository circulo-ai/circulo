export abstract class DomainError extends Error {
  readonly timestamp: Date;

  protected constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
  }
}
