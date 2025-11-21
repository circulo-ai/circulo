import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import {
  SidebarInset,
  SidebarMenuButton,
  SidebarMenuSkeleton,
} from "../ui/sidebar";
import { CustomSkeleton } from "./skeleton";

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

interface CustomSidebarMenuButtonProps
  extends ComponentProps<typeof SidebarMenuButton> {}

export function CustomSidebarMenuButton({
  className,
  ...props
}: CustomSidebarMenuButtonProps) {
  return (
    <SidebarMenuButton
      className={cn(
        className,
        "h-auto transition-all hover:bg-teal-50/5 active:bg-teal-50/10 data-[active=true]:bg-teal-600",
      )}
      {...props}
    />
  );
}

interface CustomSidebarMenuSkeletonProps
  extends ComponentProps<typeof SidebarMenuSkeleton> {}

export function CustomSidebarMenuSkeleton(
  props: CustomSidebarMenuSkeletonProps,
) {
  return (
    <SidebarMenuSkeleton showIcon customSkeleton={CustomSkeleton} {...props} />
  );
}
