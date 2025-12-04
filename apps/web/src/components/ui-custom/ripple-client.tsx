"use client";

import Position from "@/types";
import { CSSProperties, useCallback, useEffect, useState } from "react";

interface Ripple {
  id: string;
  position: Position;
}

interface RippleClientProps {
  id: string;
  disabled?: boolean;
}

export function RippleClient({ id, disabled }: RippleClientProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.getElementById(id));
  }, [id]);

  const [ripples, setRipples] = useState<Ripple[]>([]);

  const addRipple = useCallback(
    (e: PointerEvent) => {
      const containersRect = container?.getBoundingClientRect();
      if (containersRect)
        setRipples((ripples) => [
          ...ripples,
          {
            id: Math.random().toString(),
            position: {
              x: e.pageX - containersRect.x,
              y: e.pageY - containersRect.y,
            },
          },
        ]);
    },
    [container],
  );

  const pointerUpHandler = useCallback(() => {
    const newestRipplesID = ripples[ripples.length - 1]?.id;
    if (newestRipplesID) {
      const newestRipple = document.getElementById(newestRipplesID);
      if (newestRipple) newestRipple.style.opacity = "0";
    }
  }, [ripples]);

  useEffect(() => {
    if (!disabled) container?.removeAttribute("disabled");

    container?.addEventListener("pointerdown", addRipple);
    addEventListener("pointerup", pointerUpHandler);
    return () => {
      container?.removeEventListener("pointerdown", addRipple);
      removeEventListener("pointerup", pointerUpHandler);
    };
  }, [addRipple, container, disabled, pointerUpHandler]);

  useEffect(() => {
    if (container) {
      const config = { childList: true };
      const observer = new MutationObserver((mutationList) => {
        for (const mutation of mutationList)
          if (mutation.type === "childList")
            mutation.addedNodes.forEach((node) => {
              // TODO check if the node has a ripple class name
              function transitionEndHandler(e: Event) {
                if ((e as TransitionEvent).propertyName === "opacity")
                  setRipples((ripples) =>
                    ripples.filter(
                      (ripple) => ripple.id !== (node as Element).id,
                    ),
                  );

                (node as Element).removeEventListener(
                  "transitionend",
                  transitionEndHandler,
                );
              }

              (node as Element).addEventListener(
                "transitionend",
                transitionEndHandler,
              );
            });
      });

      observer.observe(container, config);

      return () => {
        observer.takeRecords();
        observer.disconnect();
      };
    }
  }, [container]);

  return ripples.map((ripple) => (
    <div
      id={ripple.id}
      key={ripple.id}
      className="ripple pointer-events-none absolute aspect-square -translate-x-1/2 -translate-y-1/2 animate-ripple rounded-full duration-1000"
      style={
        {
          "--initial-top": ripple.position.y.toString() + "px",
          "--initial-left": ripple.position.x.toString() + "px",
        } as CSSProperties
      }
    />
  ));
}

// TODO add a proper timing function to the ripple animation
// TODO rethink the logic
// TODO when the mouse click is released outside the button, the ripple incorrectly remains visible
