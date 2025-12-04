export type GuardResult = { succeeded: true } | { succeeded: false; message: string };

export class Guard {
  static againstNullOrUndefined(value: unknown, argumentName: string): GuardResult {
    if (value === null || value === undefined) {
      return { succeeded: false, message: `${argumentName} is required` };
    }
    return { succeeded: true };
  }

  static againstEmptyString(value: string, argumentName: string): GuardResult {
    if (value.trim().length === 0) {
      return { succeeded: false, message: `${argumentName} cannot be empty` };
    }
    return { succeeded: true };
  }

  static isUuid(value: string, argumentName: string): GuardResult {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      return { succeeded: false, message: `${argumentName} must be a valid UUID` };
    }
    return { succeeded: true };
  }
}
