import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { SidebarInset } from "../ui/sidebar";

interface CustomSidebarInsetProps extends ComponentProps<typeof SidebarInset> {}

export function CustomSidebarInset({
  className,
  children,
  ...props
}: CustomSidebarInsetProps) {
  return (
    <SidebarInset className={cn("bg-chat", className)} {...props}>
      <div className="pointer-events-none absolute inset-y-0 start-0 w-4 bg-linear-to-r from-background/50 to-transparent" />
      {children}
    </SidebarInset>
  );
}

// TODO make a component out of the shadow
