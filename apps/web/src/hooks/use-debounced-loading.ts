import { useEffect, useRef, useState } from "react";

export function useDebouncedLoading(
  isLoading: boolean,
  delay: number = 300,
): boolean {
  const [showLoading, setShowLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Whenever isLoading changes, clear any existing timer
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isLoading) {
      // Start a timer; if still loading after `delay`, show the indicator
      timerRef.current = window.setTimeout(() => {
        setShowLoading(true);
        timerRef.current = null;
      }, delay);
    } else {
      // If loading finished, hide immediately
      setShowLoading(false);
    }

    return () => {
      // Clean up on unmount
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [isLoading, delay]);

  return showLoading;
}
