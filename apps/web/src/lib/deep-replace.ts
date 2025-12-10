// ---------- Type-level utilities ----------

// Build a tuple of length L (used for numeric decrement)
type BuildTuple<
  L extends number,
  T extends unknown[] = [],
> = T["length"] extends L ? T : BuildTuple<L, [...T, unknown]>;

// Decrement a numeric literal type
type Dec<N extends number> =
  BuildTuple<N> extends [unknown, ...infer R] ? R["length"] : never;

/**
 * DeepReplace:
 * Recursively replaces type `From` with type `To` in `T`,
 * up to `Depth` levels deep.
 *
 * Depth defaults to 50 to approximate "until the end" at the type level,
 * because TypeScript can't represent truly infinite recursion.
 */
export type DeepReplace<T, From, To, Depth extends number = 50> = T extends From // Replace if exactly matches From (distributes over unions)
  ? To
  : Depth extends 0
    ? T
    : // Arrays / tuples
      T extends readonly (infer U)[]
      ? { [K in keyof T]: DeepReplace<T[K], From, To, Dec<Depth>> }
      : T extends (infer U)[]
        ? DeepReplace<U, From, To, Dec<Depth>>[]
        : T extends object
          ? { [K in keyof T]: DeepReplace<T[K], From, To, Dec<Depth>> }
          : T;

// ---------- Runtime implementation ----------

export interface DeepReplaceOptions {
  /**
   * How many levels deep to traverse.
   * 0 means "do not traverse children".
   * If omitted, traversal continues to leaf nodes.
   */
  depthLimit?: number;
}

/**
 * Recursively replaces all values strictly equal (`Object.is`) to `from`
 * with `to`, walking objects and arrays up to `depthLimit`.
 *
 * - Does NOT mutate input.
 * - Handles arrays/tuples and plain objects.
 * - Leaves Dates, Maps, Sets, functions, class instances, etc. as-is
 *   (unless they are exactly `from`).
 */
export function deepReplace<
  T,
  From,
  To,
  Depth extends number | undefined = undefined,
>(
  input: T,
  from: From,
  to: To,
  options?: { depthLimit?: Depth },
): DeepReplace<T, From, To, Depth extends number ? Depth : 50> {
  const limit = options?.depthLimit;

  const isPlainObject = (v: unknown): v is Record<string, unknown> => {
    if (v === null || typeof v !== "object") return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  };

  const visit = (value: unknown, depth: number): unknown => {
    // Replace at current node
    if (Object.is(value, from)) return to;

    // Stop if depth limit reached
    if (limit !== undefined && depth >= limit) return value;

    // Arrays (including tuples)
    if (Array.isArray(value)) {
      return value.map((v) => visit(v, depth + 1));
    }

    // Plain objects only — avoid messing with class instances, Dates, etc.
    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(value)) {
        out[k] = visit(value[k], depth + 1);
      }
      return out;
    }

    // Everything else stays unchanged
    return value;
  };

  return visit(input, 0) as any;
}
