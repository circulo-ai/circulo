import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { ContextMenuContent, ContextMenuItem } from "../ui/context-menu";

interface CustomContextMenuContentProps extends ComponentProps<
  typeof ContextMenuContent
> {}

export function CustomContextMenuContent({
  className,
  ...props
}: CustomContextMenuContentProps) {
  return (
    <ContextMenuContent
      className={cn("w-48 bg-sidebar/75 backdrop-blur-xl", className)}
      {...props}
    />
  );
}

interface CustomContextMenuItemProps extends ComponentProps<
  typeof ContextMenuItem
> {}

export function CustomContextMenuItem({
  className,
  ...props
}: CustomContextMenuItemProps) {
  return (
    <ContextMenuItem
      className={cn(
        "focus:bg-teal-50/5 [&_svg:not([class*='size-'])]:size-5",
        className,
      )}
      {...props}
    />
  );
}
