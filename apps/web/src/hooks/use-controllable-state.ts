import * as React from "react";

type UseControllableStateOptions<T> = {
  prop?: T;
  defaultProp: T;
  onChange?: (value: T) => void;
};

export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: UseControllableStateOptions<T>) {
  const [internalValue, setInternalValue] = React.useState(defaultProp);
  const value = prop ?? internalValue;

  const setValue = React.useCallback(
    (nextValue: React.SetStateAction<T>) => {
      const resolvedValue =
        typeof nextValue === "function"
          ? (nextValue as (previous: T) => T)(value)
          : nextValue;

      if (prop === undefined) {
        setInternalValue(resolvedValue);
      }
      onChange?.(resolvedValue);
    },
    [onChange, prop, value],
  );

  return [value, setValue] as const;
}
