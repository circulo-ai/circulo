export abstract class ValueObject<TProps extends object> {
  protected readonly props: TProps;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  equals(other?: ValueObject<TProps>): boolean {
    if (!other) return false;
    if (this.constructor !== other.constructor) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
