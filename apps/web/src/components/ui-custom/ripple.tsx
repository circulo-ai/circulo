import { cn } from "@/lib/utils";
import { BaseRipple } from "@base-ripple/react";
import { Slot } from "@/lib/slot";
import { ComponentProps, ElementType } from "react";

const DEFAULT_ELEMENT_TYPE = "button" as const;

function Ripple<T extends ElementType = typeof DEFAULT_ELEMENT_TYPE>({
  as,
  asChild,
  className,
  ...restProps
}: ComponentProps<typeof BaseRipple<T>> & { as?: T; asChild?: boolean }) {
  return (
    <BaseRipple
      as={asChild ? Slot : DEFAULT_ELEMENT_TYPE}
      className={cn(
        "base-ripple-container [&>.base-ripple]:bg-teal-50/15",
        className,
      )}
      {...restProps}
    />
  );
}

export { Ripple };
