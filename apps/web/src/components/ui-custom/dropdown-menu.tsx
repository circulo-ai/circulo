import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { DropdownMenuContent, DropdownMenuItem } from "../ui/dropdown-menu";

interface CustomDropdownMenuContentProps extends ComponentProps<
  typeof DropdownMenuContent
> {}

export function CustomDropdownMenuContent({
  className,
  ...props
}: CustomDropdownMenuContentProps) {
  return (
    <DropdownMenuContent
      className={cn(className, "w-48 bg-sidebar/75 backdrop-blur-xl")}
      {...props}
    />
  );
}

interface CustomDropdownMenuItemProps extends ComponentProps<
  typeof DropdownMenuItem
> {}

export function CustomDropdownMenuItem({
  className,
  ...props
}: CustomDropdownMenuItemProps) {
  return (
    <DropdownMenuItem
      className={cn(
        className,
        "focus:bg-teal-50/5 [&_svg:not([class*='size-'])]:size-5",
      )}
      {...props}
    />
  );
}
