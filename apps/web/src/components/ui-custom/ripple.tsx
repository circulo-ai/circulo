import { IdSlot } from "@/components/ui-custom/IdSlot";
import { cn } from "@/lib/utils";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { ComponentProps, forwardRef, JSX, useId } from "react";
import { Button } from "../ui/button";
import { RippleClient } from "./ripple-client";

const Ripple = forwardRef<
  HTMLElement,
  ComponentProps<typeof Button> & { asChild?: boolean }
>(function Ripple({ children, className, asChild, ...restProps }, ref) {
  const Comp = asChild ? Slot : Button;

  return (
    <IdSlot
      className={cn(
        "relative isolate touch-manipulation overflow-hidden [&_.ripple]:bg-teal-50/15",
        className,
      )}
      {...restProps}
      ref={ref}
    >
      <Comp variant="none" size="text" rounded="none">
        <Slottable>{children}</Slottable>
        <RippleClient />
      </Comp>
    </IdSlot>
  );
});

interface WithRippleProps<T> extends ComponentProps<typeof Ripple> {
  component: (props: T) => JSX.Element;
  componentProps: T;
}

// TODO remove
function WithRipple<T>({
  id: explicitId,
  children,
  component: Component,
  componentProps,
  ...props
}: WithRippleProps<T>) {
  const implicitId = useId();
  const id = explicitId ?? implicitId;

  return (
    <Ripple id={id} asChild {...props}>
      <Component id={id} {...componentProps}>
        {children}
      </Component>
    </Ripple>
  );
}

export { Ripple, WithRipple };
