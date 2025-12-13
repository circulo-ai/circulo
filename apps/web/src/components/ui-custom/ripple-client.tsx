"use client";

import { nanoid } from "nanoid";
import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useIdSlot } from "./IdSlot";

type Cleanup = ReturnType<Parameters<typeof useEffect>[0]>;

interface Ripple {
  id: string;
  size: number;
  initial: {
    x: number;
    y: number;
  };
  final: {
    x: number;
    y: number;
  };
}

export function RippleClient() {
  const id = useIdSlot();

  const withContainer = useCallback(
    (run: (container: HTMLButtonElement) => Cleanup): Cleanup => {
      const container = document.getElementById(id) as HTMLButtonElement | null;
      if (container) return run(container);
      else if (process.env.NODE_ENV !== "production")
        console.warn(
          `[RippleClient] Missing container (#${id}); skipping listener attachment.`,
        );
    },
    [id],
  );

  const [ripples, setRipples] = useState<Ripple[]>([]);

  const lastRippleIdRef = useRef<string | null>(null);

  const enqueueRippleFromPointer = useCallback(
    (event: PointerEvent) => {
      if (event.defaultPrevented) return;
      withContainer((container) => {
        if (container.disabled) return;
        const id = nanoid();
        const containerRect = container.getBoundingClientRect();
        setRipples((ripples) => [
          ...ripples,
          {
            id,
            size: smallestEnclosingCircleDiameter(
              containerRect.width,
              containerRect.height,
            ),
            initial: {
              x: event.clientX - containerRect.x,
              y: event.clientY - containerRect.y,
            },
            final: {
              x: containerRect.width / 2,
              y: containerRect.height / 2,
            },
          },
        ]);
        lastRippleIdRef.current = id;
      });
    },
    [withContainer],
  );

  const fadeLastRipple = useCallback(() => {
    const lastRippleId = lastRippleIdRef.current;
    if (lastRippleId) {
      const lastRipple = document.getElementById(lastRippleId);
      if (lastRipple) lastRipple.style.opacity = "0";
    }
  }, []);

  const visibilityChangeHandler = useCallback(() => {
    if (document.visibilityState === "hidden") fadeLastRipple();
  }, [fadeLastRipple]);

  useEffect(() => {
    return withContainer((container) => {
      container.addEventListener("pointerdown", enqueueRippleFromPointer);
      addEventListener("pointerup", fadeLastRipple);
      addEventListener("pointercancel", fadeLastRipple);
      addEventListener("dragend", fadeLastRipple);
      addEventListener("visibilitychange", visibilityChangeHandler);
      addEventListener("pagehide", fadeLastRipple);
      addEventListener("beforeunload", fadeLastRipple);
      addEventListener("blur", fadeLastRipple);
      return () => {
        container.removeEventListener("pointerdown", enqueueRippleFromPointer);
        removeEventListener("pointerup", fadeLastRipple);
        removeEventListener("pointercancel", fadeLastRipple);
        removeEventListener("dragend", fadeLastRipple);
        removeEventListener("visibilitychange", visibilityChangeHandler);
        removeEventListener("pagehide", fadeLastRipple);
        removeEventListener("beforeunload", fadeLastRipple);
        removeEventListener("blur", fadeLastRipple);
      };
    });
  }, [
    withContainer,
    enqueueRippleFromPointer,
    fadeLastRipple,
    visibilityChangeHandler,
  ]);

  return ripples.map((ripple) => (
    <span
      id={ripple.id}
      key={ripple.id}
      aria-hidden="true"
      onTransitionEnd={(event) => {
        if (event.propertyName === "opacity")
          setRipples((ripples) =>
            ripples.filter(
              (ripple) => ripple.id !== (event.target as HTMLSpanElement).id,
            ),
          );
      }}
      className="ripple ripple-vars pointer-events-none absolute top-0 left-0 animate-ripple rounded-full transition-opacity will-change-[transform,opacity]"
      style={
        {
          width: ripple.size + "px",
          height: ripple.size + "px",
          "--ripple-initial-x": ripple.initial.x + "px",
          "--ripple-initial-y": ripple.initial.y + "px",
          "--ripple-final-x": ripple.final.x + "px",
          "--ripple-final-y": ripple.final.y + "px",
        } as CSSProperties
      }
    />
  ));
}

function smallestEnclosingCircleDiameter(w: number, h: number) {
  if (w === 0) return Math.abs(h);
  if (h === 0) return Math.abs(w);

  w = Math.abs(w);
  h = Math.abs(h);

  return Math.sqrt(w * w + h * h);
}

// TODO make it intractable with keyboard
// TODO check on phone
// TODO pr to shadcn
