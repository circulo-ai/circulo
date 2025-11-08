"use client";

import { AnimatePresence, motion } from "motion/react";
import { ReactNode, useRef, useState } from "react";

/**
 * AnimatedList
 * - Adds/removes items with height-based animation.
 * - Siblings are pushed/pulled smoothly via layout animations.
 * - Pass an ordered array of ids and a render function.
 */
export function AnimatedList<T extends string | number>(props: {
  ids: T[];
  renderItem: (id: T, index: number) => ReactNode;
  className?: string;
  itemClassName?: string;
  /**
   * Spring tuning for layout shifts of siblings.
   */
  layoutTransition?: Partial<Parameters<typeof motion.div>[0]["transition"]>;
}) {
  const {
    ids,
    renderItem,
    className,
    itemClassName,
    layoutTransition = {
      duration: 0.15,
      ease: [0.4, 0, 0.2, 1],
    },
  } = props;

  return (
    <motion.ul
      layout
      className={className}
      style={{ position: "relative" }}
      initial={false}
    >
      <AnimatePresence mode="popLayout">
        {ids.map((id, index) => (
          <motion.li
            key={id}
            layout
            transition={layoutTransition}
            className={itemClassName}
          >
            {/* Inner wrapper handles height reveal/collapse */}
            <motion.div
              layout
              style={{ overflow: "hidden" }}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            >
              {renderItem(id, index)}
            </motion.div>
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}

/**
 * Demo component
 * - Click add/remove to see animated insertion and removal.
 */
export default function Demo() {
  const [ids, setIds] = useState<number[]>(() => [1, 2, 3, 4]);
  const nextId = useRef(5);

  const addAt = (index: number) => {
    const id = nextId.current++;
    setIds((prev) => {
      const copy = prev.slice();
      copy.splice(index, 0, id);
      return copy;
    });
  };

  const removeId = (id: number) =>
    setIds((prev) => prev.filter((x) => x !== id));

  return (
    <div className="min-h-screen w-full bg-neutral-900 p-6 text-neutral-100">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => addAt(0)}
            className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
          >
            Add at top
          </button>
          <button
            onClick={() =>
              addAt(
                Math.max(0, Math.min(ids.length, Math.floor(ids.length / 2))),
              )
            }
            className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
          >
            Add in middle
          </button>
          <button
            onClick={() => addAt(ids.length)}
            className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
          >
            Add at bottom
          </button>
        </div>

        <AnimatedList
          ids={ids}
          className="space-y-2"
          itemClassName=""
          renderItem={(id) => (
            <div className="rounded-lg bg-neutral-800 p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Item #{id}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => addAt(ids.indexOf(id) + 1)}
                    className="rounded-md bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600"
                  >
                    Add below
                  </button>
                  <button
                    onClick={() => removeId(id)}
                    className="rounded-md bg-red-700 px-2 py-1 text-xs hover:bg-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {/* Variable height example content */}
              <p className="mt-2 text-sm opacity-80">
                This row height is intrinsic. Pushing/pulling uses the
                inserted/removed height.
              </p>
              {id % 2 === 0 && (
                <div className="mt-2 rounded-md bg-neutral-700/60 p-3 text-xs">
                  Extra block to change height for even items.
                </div>
              )}
            </div>
          )}
        />
      </div>
    </div>
  );
}
