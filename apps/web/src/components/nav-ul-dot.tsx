"use client";

import { navItems } from "@/consts/nav";
import { useActiveByClass } from "@/hooks/use-active-by-class";
import { setAnchorSilently } from "@/lib/set-anchor-silently";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface NavUlDotProps {
  ulId: string;
}

export function NavUlDot({ ulId }: NavUlDotProps) {
  const [x, setX] = useState<number | undefined>(undefined);
  const [currentIndex, setCurrentIndex] = useState<number | undefined>(
    undefined,
  );

  useEffect(() => {
    if (currentIndex === undefined) return;
    const finalCurrentIndex = currentIndex === 3 ? 4 : currentIndex;

    const navUlItems = document.querySelectorAll(`#${ulId} li a`);
    navUlItems.forEach((ulItem) => ulItem.removeAttribute("data-active"));
    navUlItems[finalCurrentIndex].setAttribute("data-active", "true");

    setX((navUlItems[finalCurrentIndex] as HTMLElement).offsetLeft);

    setAnchorSilently(navItems[currentIndex].href);
  }, [currentIndex]);

  useActiveByClass("main-section", ({ index }) => {
    if (currentIndex !== index) setCurrentIndex(index);
  });

  return (
    <div
      className={cn(
        "pointer-events-none absolute size-1 rounded-full bg-foreground shadow-[0_0_0_0] shadow-teal-900 transition-all duration-300",
        x === undefined && "opacity-0",
        currentIndex === 3 &&
          "size-7 -translate-x-px bg-teal-900 shadow-[0_0_0_1px]",
        currentIndex !== 3 && "-translate-x-1",
      )}
      style={{ left: x }}
    />
  );
}
