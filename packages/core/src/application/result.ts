export class Result<T = void> {
  private constructor(
    private readonly success: boolean,
    private readonly value?: T,
    private readonly error?: string,
  ) {}

  static ok<T = void>(value?: T): Result<T> {
    return new Result<T>(true, value);
  }

  static fail<T = void>(message: string): Result<T> {
    return new Result<T>(false, undefined, message);
  }

  get isSuccess(): boolean {
    return this.success;
  }

  get isFailure(): boolean {
    return !this.success;
  }

  getValue(): T {
    if (!this.success) {
      throw new Error("Cannot get the value of a failed result");
    }
    return this.value as T;
  }

  getError(): string | undefined {
    return this.error;
  }

  static combine(results: Result[]): Result {
    for (const result of results) {
      if (result.isFailure) return result;
    }
    return Result.ok();
  }
}
