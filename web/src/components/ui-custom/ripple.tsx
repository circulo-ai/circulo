import { cn } from "@/lib/utils";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { ComponentProps, JSX, useId } from "react";
import { RippleClient } from "./ripple-client";

interface RippleProps extends ComponentProps<"button"> {
  asChild?: boolean;
}

export function Ripple({
  className,
  children,
  disabled,
  asChild,
  id: explicitId,
  ...otherProps
}: RippleProps) {
  const implicitId = useId();
  const id = explicitId ?? implicitId;

  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      id={id}
      disabled
      className={cn(
        "relative touch-none overflow-hidden select-none [&_.ripple]:bg-teal-50/15",
        className,
      )}
      {...otherProps}
    >
      <Slottable>{children}</Slottable>
      <RippleClient id={id} disabled={disabled} />
    </Comp>
  );
}

interface WithRippleProps<T> extends ComponentProps<typeof Ripple> {
  component: (props: T) => JSX.Element;
  componentProps: T;
}

export function WithRipple<T>({
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
