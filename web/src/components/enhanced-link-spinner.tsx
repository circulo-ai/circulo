import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { ComponentProps } from "react";
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
  const Comp = asChild ? Slot : Spinner;

  return (
    <Comp
      className={cn("hidden group-data-loading/link:block", className)}
      {...props}
    />
  );
}
