import * as React from "react";

import { cn } from "@/lib/utils";

type SlotProps = React.HTMLAttributes<HTMLElement> & {
  children: React.ReactElement;
};

/** A small render-as-child primitive for app-owned components. */
export const Slot = React.forwardRef<HTMLElement, SlotProps>(
  ({ children, className, ...props }, ref) => {
    const childProps = children.props as React.HTMLAttributes<HTMLElement>;

    return React.cloneElement(children, {
      ...props,
      ...childProps,
      className: cn(className, childProps.className),
      ref,
    } as Partial<React.HTMLAttributes<HTMLElement>> & {
      ref?: React.Ref<HTMLElement>;
    });
  },
);

Slot.displayName = "Slot";
