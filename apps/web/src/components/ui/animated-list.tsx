"use client";

import { Slot } from "@/lib/slot";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, Transition } from "motion/react";
import { ComponentProps, forwardRef, ReactNode } from "react";

const TRANSITION = {
  duration: 0.3,
  ease: [0.4, 0, 0.2, 1],
} satisfies Transition;

const MotionListSlot = motion.create(Slot);

export const AnimatedList = forwardRef<
  HTMLUListElement,
  ComponentProps<typeof motion.ul> & {
    children?: ReactNode;
    asChild?: boolean;
  }
>(({ className, children, asChild, ...restProps }, ref) => {
  // TODO replace Comp with Component in the project
  const Component = asChild ? MotionListSlot : motion.ul;

  return (
    <Component className={cn("relative", className)} {...restProps} ref={ref}>
      <AnimatePresence mode="popLayout" initial={false}>
        {children}
      </AnimatePresence>
    </Component>
  );
});
// TODO apply this pattern anywhere needed:
AnimatedList.displayName = "AnimatedList";

const MotionItemSlot = motion.create(Slot);

export const AnimatedItem = forwardRef<
  HTMLLIElement,
  ComponentProps<typeof motion.li> & { asChild?: boolean }
>(({ children, className, transition, asChild, ...props }, ref) => {
  const Component = asChild ? MotionItemSlot : motion.li;

  return (
    <Component
      layout
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={transition ?? TRANSITION}
      className={cn("overflow-hidden", className)}
      {...props}
      ref={ref}
    >
      {children}
    </Component>
  );
});
AnimatedItem.displayName = "AnimatedItem";

// TODO pr to shadcn
