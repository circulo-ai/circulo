import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

type ScrollFlag = ScrollBehavior | false;

const SCROLL_KEY = "messages:should-scroll";

export function useScrollToBottom() {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { cache, mutate } = useSWRConfig();

  // Get current scroll behavior from cache
  const scrollBehavior = (cache.get(SCROLL_KEY)?.data as ScrollFlag) || false;

  const setScrollBehavior = useCallback(
    (value: ScrollFlag) => {
      mutate(SCROLL_KEY, value, { revalidate: false });
    },
    [mutate]
  );

  const handleScroll = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setIsAtBottom(scrollTop + clientHeight >= scrollHeight - 100);
  }, []);

  // ... rest of your existing useEffect hooks ...

  useEffect(() => {
    if (scrollBehavior && containerRef.current) {
      const container = containerRef.current;
      const scrollOptions: ScrollToOptions = {
        top: container.scrollHeight,
        behavior: scrollBehavior,
      };
      container.scrollTo(scrollOptions);
      setScrollBehavior(false);
    }
  }, [scrollBehavior, setScrollBehavior]);

  const scrollToBottom = useCallback(
    (currentScrollBehavior: ScrollBehavior = "smooth") => {
      setScrollBehavior(currentScrollBehavior);
    },
    [setScrollBehavior]
  );

  function onViewportEnter() {
    setIsAtBottom(true);
  }

  function onViewportLeave() {
    setIsAtBottom(false);
  }

  return {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    onViewportEnter,
    onViewportLeave,
  };
}