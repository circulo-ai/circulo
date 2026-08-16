"use client";

import { usePointer } from "@/providers/pointer-provider";

export function FaqBackground() {
  const [
    {
      position: { x, y },
    },
  ] = usePointer();

  return (
    <div className="absolute start-0 end-3/5 -z-10 grid h-full grid-cols-4 grid-rows-8 gap-0.5 overflow-hidden bg-teal-50/10 max-sm:hidden">
      <div
        className="absolute size-128 rounded-full bg-teal-50/10 blur-3xl will-change-transform"
        style={{
          transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`,
        }}
      />

      {Array.from({ length: 4 * 8 }, (_, i) => (
        <div key={i} className="relative bg-background" />
      ))}

      <div className="absolute size-full bg-radial-[at_center_left] from-transparent to-background" />
    </div>
  );
}

// TODO move the static elements to a server component
