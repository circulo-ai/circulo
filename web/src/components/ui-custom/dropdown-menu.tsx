import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { DropdownMenuContent, DropdownMenuItem } from "../ui/dropdown-menu";
import { useSidebar } from "../ui/sidebar";

interface CustomDropdownMenuContentProps
  extends ComponentProps<typeof DropdownMenuContent> {}

export function CustomDropdownMenuContent({
  className,
  ...props
}: CustomDropdownMenuContentProps) {
  const { open } = useSidebar();

  return (
    <DropdownMenuContent
      className={cn(className, "w-48 bg-sidebar/75 backdrop-blur-xl")}
      sideOffset={8}
      alignOffset={open ? 0 : 8}
      align="start"
      {...props}
    />
  );
}

interface CustomDropdownMenuItemProps
  extends ComponentProps<typeof DropdownMenuItem> {}

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
