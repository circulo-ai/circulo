import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { ScrollBar } from "../ui/scroll-area";

interface CustomScrollBarProps extends ComponentProps<typeof ScrollBar> {}

export function CustomScrollBar({ className, ...props }: CustomScrollBarProps) {
  return <ScrollBar className={cn(className, "z-10")} {...props} />;
}
