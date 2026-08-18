import { useCallback, useEffect, useRef, useState } from "react";

type ScrollFlag = ScrollBehavior | false;
type ScrollSnapshot = {
  top: number;
  atBottom: boolean;
};

type UseScrollToBottomOptions = {
  initialScrollToBottom?: boolean;
  storageKey?: string;
};

export function useScrollToBottom({
  initialScrollToBottom = false,
  storageKey,
}: UseScrollToBottomOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);
  const isRestoringRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Scroll requests belong to one conversation surface. A process-wide SWR
  // key made the main chat and artifact transcript scroll each other.
  const [scrollBehavior, setScrollBehavior] = useState<ScrollFlag>(false);

  const persistScrollPosition = useCallback(
    (container: HTMLDivElement, atBottom: boolean) => {
      if (!storageKey || isRestoringRef.current) return;

      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            top: container.scrollTop,
            atBottom,
          } satisfies ScrollSnapshot),
        );
      } catch {
        // Storage can be unavailable in private browsing; scrolling still works.
      }
    },
    [storageKey],
  );

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (isRestoringRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 100;
    shouldFollowRef.current = atBottom;
    setIsAtBottom(atBottom);
    persistScrollPosition(container, atBottom);
  }, [persistScrollPosition]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let snapshot: ScrollSnapshot | undefined;
    if (storageKey && !initialScrollToBottom) {
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<ScrollSnapshot>;
          if (
            typeof parsed.top === "number" &&
            typeof parsed.atBottom === "boolean"
          ) {
            snapshot = parsed as ScrollSnapshot;
            shouldFollowRef.current = snapshot.atBottom;
            setIsAtBottom(snapshot.atBottom);
          }
        }
      } catch {
        // Ignore malformed or unavailable storage and use the default position.
      }
    }

    isRestoringRef.current = Boolean(snapshot) || initialScrollToBottom;

    const restoreScrollPosition = () => {
      if (initialScrollToBottom) {
        container.scrollTop = container.scrollHeight;
      } else if (snapshot) {
        const maxScrollTop = Math.max(
          0,
          container.scrollHeight - container.clientHeight,
        );
        container.scrollTop = snapshot.atBottom
          ? container.scrollHeight
          : Math.min(snapshot.top, maxScrollTop);
      }

      isRestoringRef.current = false;
      handleScroll();
    };

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (shouldFollowRef.current) {
          container.scrollTop = container.scrollHeight;
        }
        handleScroll();
      });
    });

    const mutationObserver = new MutationObserver(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (shouldFollowRef.current) {
            container.scrollTop = container.scrollHeight;
          }
          handleScroll();
        });
      });
    });

    resizeObserver.observe(container);
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "data-state"],
    });

    handleScroll();

    const restoreFrame = requestAnimationFrame(() => {
      requestAnimationFrame(restoreScrollPosition);
    });

    return () => {
      cancelAnimationFrame(restoreFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [handleScroll, initialScrollToBottom, storageKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.addEventListener("scroll", handleScroll);
    handleScroll(); // Check initial state

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

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
    [setScrollBehavior],
  );

  function onViewportEnter() {
    shouldFollowRef.current = true;
    setIsAtBottom(true);
  }

  function onViewportLeave() {
    shouldFollowRef.current = false;
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
