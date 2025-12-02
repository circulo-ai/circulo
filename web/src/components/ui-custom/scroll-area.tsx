import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";

interface CustomScrollAreaProps extends ComponentProps<typeof ScrollArea> {}

export function CustomScrollArea({
  className,
  ...props
}: CustomScrollAreaProps) {
  return (
    <ScrollArea
      customScrollBar={CustomScrollBar}
      className={cn(className)}
      {...props}
    />
  );
}

interface CustomScrollBarProps extends ComponentProps<typeof ScrollBar> {}

export function CustomScrollBar({ className, ...props }: CustomScrollBarProps) {
  return (
    <ScrollBar className={cn(className, "p-0.5 *:bg-teal-50/10")} {...props} />
  );
}
