import { ValueObject, ValidationError } from "@circulo-ai/core";

export type RateLimitPolicyProps = {
  key: string;
  limit: number;
  windowMs: number;
};

export class RateLimitPolicy extends ValueObject<RateLimitPolicyProps> {
  private constructor(props: RateLimitPolicyProps) {
    super(props);
  }

  static create(props: RateLimitPolicyProps): RateLimitPolicy {
    if (!props.key.trim()) {
      throw new ValidationError("key is required", "key");
    }
    if (props.limit <= 0) {
      throw new ValidationError("limit must be positive", "limit");
    }
    if (props.windowMs <= 0) {
      throw new ValidationError("windowMs must be positive", "windowMs");
    }
    return new RateLimitPolicy(props);
  }

  get key(): string {
    return this.props.key;
  }

  get limit(): number {
    return this.props.limit;
  }

  get windowMs(): number {
    return this.props.windowMs;
  }
}
