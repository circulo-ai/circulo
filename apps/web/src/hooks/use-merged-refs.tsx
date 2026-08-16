import { Ref, RefCallback, RefObject, useRef } from "react";

type PossibleRef<T> = Ref<T> | null | undefined;
type MergedRef<T> = RefCallback<T> & RefObject<T | null>;

function assignRef<T>(ref: PossibleRef<T>, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as RefObject<T | null>).current = value;
}

function useMergedRefs<T>(...refs: PossibleRef<T>[]): MergedRef<T> {
  const innerRef = useRef<T>(null);
  const refsRef = useRef<PossibleRef<T>[]>([]);
  refsRef.current = refs;

  const mergedRef = useRef<MergedRef<T>>(null);

  if (!mergedRef.current) {
    const fn = ((node: T | null) => {
      innerRef.current = node;
      fn.current = node;
      refsRef.current.forEach((ref) => assignRef(ref, node));
    }) as MergedRef<T>;

    fn.current = innerRef.current;
    mergedRef.current = fn;
  }

  return mergedRef.current!;
}

export { useMergedRefs };
