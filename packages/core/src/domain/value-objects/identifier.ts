import { randomUUID } from "crypto";

export type IdentifierValue = string;

export class Identifier {
  private readonly value: IdentifierValue;

  private constructor(value: IdentifierValue) {
    if (!value || value.trim().length === 0) {
      throw new Error("Identifier cannot be empty");
    }
    this.value = value;
  }

  static create(value?: IdentifierValue): Identifier {
    return new Identifier(value ?? randomUUID());
  }

  static from(value: IdentifierValue): Identifier {
    return new Identifier(value);
  }

  toString(): string {
    return this.value;
  }

  valueOf(): string {
    return this.value;
  }

  equals(other?: Identifier | null): boolean {
    if (!other) return false;
    if (this === other) return true;
    return this.value === other.value;
  }

  toJSON(): string {
    return this.value;
  }
}
