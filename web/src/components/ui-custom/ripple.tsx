import { cn } from "@/lib/utils";
import { ComponentProps, useId } from "react";
import { Button } from "../ui/button";
import { RippleClient } from "./ripple-client";

interface RippleProps extends ComponentProps<typeof Button> {}

export function Ripple({
  className,
  children,
  disabled,
  id: explicitId,
  ...otherProps
}: RippleProps) {
  const implicitId = useId();
  const id = explicitId ?? implicitId;

  return (
    <Button
      id={id}
      disabled
      className={cn(
        "relative touch-none overflow-hidden select-none",
        className,
      )}
      {...otherProps}
    >
      {children}
      <RippleClient id={id} disabled={disabled} />
    </Button>
  );
}
