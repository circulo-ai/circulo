import { cn } from "@/lib/utils";
import { Slot } from "@/lib/slot";
import { ComponentProps, isValidElement } from "react";
import { Spinner } from "./ui/spinner";

type Props = ComponentProps<"div"> & ComponentProps<typeof Spinner>;

interface EnhancedLinkSpinnerProps extends Props {
  asChild?: boolean;
}

export function EnhancedLinkSpinner({
  className,
  asChild = false,
  ...props
}: EnhancedLinkSpinnerProps) {
  if (asChild) {
    if (!isValidElement(props.children)) return null;

    return (
      <Slot
        className={cn(
          "pointer-events-none opacity-0 transition-opacity group-data-loading/link:pointer-events-auto group-data-loading/link:opacity-100",
          className,
        )}
        {...props}
      >
        {props.children}
      </Slot>
    );
  }

  return (
    <Spinner
      className={cn(
        "pointer-events-none opacity-0 transition-opacity group-data-loading/link:pointer-events-auto group-data-loading/link:opacity-100",
        className,
      )}
      {...props}
    />
  );
}
