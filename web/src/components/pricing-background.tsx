"use client";

import { createBorderNode, Step } from "@/lib/border-walk";
import { usePointer } from "@/providers/pointer-provider";
import { useCallback, useEffect, useId } from "react";

// TODO convert to BorderWalk
export function PricingBackground({ paths }: { paths: Step[][] }) {
  const [
    {
      position: { x, y },
    },
  ] = usePointer(); // TODO this should be in its own component

  const idPrefix = useId();

  const generateGridId = useCallback(
    (x: number, y: number) => `${idPrefix}-${x}-${y}`,
    [idPrefix],
  );

  useEffect(() => {
    if (paths.length === 0) return;

    const indexByPath = new Map<number, number>();
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      paths.forEach((path, pathIndex) => {
        const index = indexByPath.get(pathIndex) ?? 0;
        const step = path[index];
        if (step === undefined) {
          indexByPath.set(pathIndex, 0);
          return;
        }

        const grid = document.getElementById(generateGridId(step.x, step.y));
        // TODO cache cell element references in a 2D array/map at mount
        if (grid === null) {
          indexByPath.set(pathIndex, 0);
          return;
        }

        const border = createBorderNode(step);
        grid.appendChild(border);
        indexByPath.set(pathIndex, index + 1);
      });
    };

    const start = () => {
      if (interval !== null) return;
      interval = setInterval(tick, 500);
    };

    const stop = () => {
      if (interval === null) return;
      clearInterval(interval);
      interval = null;
    };

    start();

    const handleVisibilityChange = () => {
      const container = document.getElementById(
        idPrefix,
      ) as HTMLDivElement | null;
      const hidden = document.visibilityState === "hidden";
      container?.style.setProperty(
        "--bw-animation-play-state",
        hidden ? "paused" : "running",
      );
      if (hidden) stop();
      else start();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stop();
    };
  }, [paths, idPrefix, generateGridId]);

  // TODO make the grid size dynamic
  return (
    <div
      id={idPrefix}
      className="absolute inset-0 grid grid-cols-12 grid-rows-8 gap-0.5 overflow-hidden bg-teal-50/10 [--bw-animation-play-state:running]"
    >
      <div
        className="absolute size-128 rounded-full bg-teal-50/10 blur-3xl will-change-transform"
        style={{
          transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`,
        }}
      />

      {Array.from({ length: 8 }).map((_, row) =>
        Array.from({ length: 12 }).map((_, col) => (
          <div
            id={generateGridId(row, col)}
            key={`${row}-${col}`}
            className="relative flex items-center justify-center bg-background"
          />
        )),
      )}

      <div className="absolute size-full bg-radial from-transparent to-background" />
    </div>
  );
}

// TODO disable animations when their related section is not showing
// TODO issue: imperative dom children can be removed by react
// TODO raf scheduler + elapsed time accumulator
// TODO batch dom writes inside a requestAnimationFrame
// TODO use raf for pointer
// TODO a simple for-loop + pre-sized arrays for caching nodes is a bit faster than forEach
