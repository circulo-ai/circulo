import { useEffect, useState } from "react";

export const useDebounce = <T>(
  state: T,
  delay: number,
): { debouncedState: T; isPending: boolean } => {
  const [debouncedState, setDebouncedState] = useState<T>(state);
  const [isPending, setIsPending] = useState<boolean>(false);

  useEffect(() => {
    setIsPending(true);

    const handler = setTimeout(() => {
      setDebouncedState(state);
      setIsPending(false);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [state, delay]);

  return { debouncedState, isPending };
};
