import { useEffect, useRef, useState } from "react";

type ActivePayload<T extends Element = HTMLElement> = {
  element: T | null;
  index: number; // -1 when none
};

type UseActiveByClassOptions = {
  rootMargin?: string;
  /** default true. call on mount if an element is already active */
  fireInitially?: boolean;
};

export function useActiveByClass<T extends Element = HTMLElement>(
  className: string,
  onActiveChange: (p: ActivePayload<T>) => void,
  opts: UseActiveByClassOptions = {},
) {
  const { rootMargin = "0px", fireInitially = true } = opts;
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [activeElement, setActiveElement] = useState<T | null>(null);
  const elementsRef = useRef<T[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const els = Array.from(document.getElementsByClassName(className)) as T[];
    elementsRef.current = els;

    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (els.length === 0) {
      // reset if none found
      if (activeIndex !== -1) {
        setActiveIndex(-1);
        setActiveElement(null);
        onActiveChange({ element: null, index: -1 });
      }
      return;
    }

    const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
    const io = new IntersectionObserver(
      (entries) => {
        // schedule a single calc per frame
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const halfViewport = window.innerHeight / 2;

          // pick the entry with the largest intersecting height that meets the rule
          let best: { idx: number; el: T; h: number } | null = null;

          for (const entry of entries) {
            const idx = els.indexOf(entry.target as T);
            if (idx === -1) continue;

            const h = entry.intersectionRect.height;
            const qualifies = h >= halfViewport;

            if (!qualifies) continue;

            if (!best || h > best.h) {
              best = { idx, el: entry.target as T, h };
            }
          }

          // If none in this batch, we still need to scan all observed to cover scroll without threshold crossing.
          if (!best) {
            for (let i = 0; i < els.length; i++) {
              const r = els[i].getBoundingClientRect();
              const h = Math.max(
                0,
                Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0),
              );
              if (h >= halfViewport) {
                if (!best || h > best.h) best = { idx: i, el: els[i], h };
              }
            }
          }

          const newIdx = best ? best.idx : -1;
          const newEl = best ? best.el : null;

          if (newIdx !== activeIndex) {
            setActiveIndex(newIdx);
            setActiveElement(newEl);
            onActiveChange({ element: newEl, index: newIdx });
          }
        });
      },
      { root: null, rootMargin, threshold: thresholds },
    );

    els.forEach((el) => io.observe(el));
    observerRef.current = io;

    // initial fire
    if (fireInitially) {
      const halfViewport = window.innerHeight / 2;
      let bestIdx = -1;
      let bestEl: T | null = null;
      let bestH = -1;

      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const h = Math.max(
          0,
          Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0),
        );
        if (h >= halfViewport && h > bestH) {
          bestH = h;
          bestIdx = i;
          bestEl = el;
        }
      });

      setActiveIndex(bestIdx);
      setActiveElement(bestEl);
      onActiveChange({ element: bestEl, index: bestIdx });
    }

    const onResize = () => {
      // force recompute on viewport changes
      io.takeRecords(); // no-op hint
      const halfViewport = window.innerHeight / 2;
      let bestIdx = -1;
      let bestEl: T | null = null;
      let bestH = -1;

      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const h = Math.max(
          0,
          Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0),
        );
        if (h >= halfViewport && h > bestH) {
          bestH = h;
          bestIdx = i;
          bestEl = el;
        }
      });

      if (bestIdx !== activeIndex) {
        setActiveIndex(bestIdx);
        setActiveElement(bestEl);
        onActiveChange({ element: bestEl, index: bestIdx });
      }
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, rootMargin, fireInitially]);

  return { activeIndex, activeElement };
}
