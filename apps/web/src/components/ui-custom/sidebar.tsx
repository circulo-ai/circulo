import {
  ContextMenu,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { Pin, PinOff } from "lucide-react";
import { ComponentProps } from "react";
import {
  Sidebar,
  SidebarGroup,
  SidebarGroupAction,
  SidebarHeader,
  SidebarInset,
  SidebarMenuButton,
  SidebarMenuSkeleton,
} from "../ui/sidebar";
import {
  CustomContextMenuContent,
  CustomContextMenuItem,
} from "./context-menu";
import { Ripple } from "./ripple";
import { CustomSkeleton } from "./skeleton";

interface CustomSidebarProps extends ComponentProps<typeof Sidebar> {}

export function CustomSidebar({ className, ...props }: CustomSidebarProps) {
  return (
    <Sidebar
      collapsible="icon"
      variant="inset"
      className={cn(className, "static w-full pr-0")}
      {...props}
    />
  );
}

interface CustomSidebarHeaderProps extends ComponentProps<
  typeof SidebarHeader
> {}

export function CustomSidebarHeader({
  className,
  ...props
}: CustomSidebarHeaderProps) {
  return <SidebarHeader className={cn("flex-row", className)} {...props} />;
}

interface CustomSidebarGroupProps extends ComponentProps<typeof SidebarGroup> {}

export function CustomSidebarGroup({
  className,
  ...props
}: CustomSidebarGroupProps) {
  return (
    <SidebarGroup
      className={cn("h-full overflow-hidden", className)}
      {...props}
    />
  );
}

interface CustomSidebarInsetProps extends ComponentProps<typeof SidebarInset> {}

export function CustomSidebarInset({
  className,
  children,
  ...props
}: CustomSidebarInsetProps) {
  return (
    <SidebarInset className={cn("h-full bg-chat", className)} {...props}>
      <div className="pointer-events-none absolute inset-y-0 start-0 w-4 bg-linear-to-r from-background/50 to-transparent" />
      {children}
    </SidebarInset>
  );
}

// TODO make a component out of the shadow

interface CustomSidebarMenuButtonProps extends ComponentProps<
  typeof SidebarMenuButton
> {}

export function CustomSidebarMenuButton({
  className,
  variant = "default",
  ...props
}: CustomSidebarMenuButtonProps) {
  return (
    <SidebarMenuButton
      variant={variant}
      className={cn(
        className,
        "group/sidebar-menu-button h-auto bg-sidebar transition-all group-data-[collapsible=icon]:h-auto! group-data-[state=collapsed]:w-9! group-data-[state=collapsed]:rounded-[1.125rem] group-data-[state=collapsed]:p-0! data-[active=true]:bg-teal-600 data-[active=true]:font-normal",
      )}
      {...props}
    />
  );
}

interface CustomSidebarMenuSkeletonProps extends ComponentProps<
  typeof SidebarMenuSkeleton
> {}

export function CustomSidebarMenuSkeleton({
  className,
  ...props
}: CustomSidebarMenuSkeletonProps) {
  return (
    <SidebarMenuSkeleton
      className={cn(
        "h-16 w-full transition-all group-data-[state=collapsed]:size-9 group-data-[state=collapsed]:rounded-[1.125rem] group-data-[state=collapsed]:p-0",
        "[&_*[data-sidebar=menu-skeleton-icon]]:aspect-square [&_*[data-sidebar=menu-skeleton-icon]]:h-auto [&_*[data-sidebar=menu-skeleton-icon]]:w-12 [&_*[data-sidebar=menu-skeleton-icon]]:min-w-12 [&_*[data-sidebar=menu-skeleton-icon]]:rounded-full [&_*[data-sidebar=menu-skeleton-icon]]:transition-all [&_*[data-sidebar=menu-skeleton-icon]]:group-data-[state=collapsed]:w-9 [&_*[data-sidebar=menu-skeleton-icon]]:group-data-[state=collapsed]:min-w-9",
        className,
      )}
      isWrapperSkeleton
      showIcon
      customSkeleton={CustomSkeleton}
      {...props}
    />
  );
}

interface CustomSidebarGroupActionProps extends ComponentProps<
  typeof SidebarGroupAction
> {}

export function CustomSidebarGroupAction({
  className,
  children,
  ...props
}: CustomSidebarGroupActionProps) {
  return (
    <Ripple asChild>
      <SidebarGroupAction
        className={cn(
          "absolute right-2 bottom-2 mt-auto size-12 rounded-full bg-teal-700 transition-all group-data-[collapsible=icon]:flex hover:bg-teal-600 data-[state=open]:bg-teal-600",
          className,
        )}
        {...props}
      >
        {children}
      </SidebarGroupAction>
    </Ripple>
  );
}

interface CustomSidebarMenuAvatarProps extends ComponentProps<"div"> {}

export function CustomSidebarMenuAvatar({
  className,
  ...props
}: CustomSidebarMenuAvatarProps) {
  return (
    <div
      className={cn(
        "aspect-square w-12 min-w-12 rounded-full bg-foreground shadow-[0_0_0_0_inset] shadow-teal-600 transition-all group-data-[state=collapsed]:w-9 group-data-[state=collapsed]:min-w-9 group-data-[state=collapsed]:group-data-[active=true]/sidebar-menu-button:shadow-[0_0_0_4px_inset]",
        className,
      )}
      {...props}
    />
  );
}

interface CustomSidebarContextMenuProps extends ComponentProps<
  typeof ContextMenu
> {
  isPinned: boolean;
  onPinChange: (isPinned: boolean) => void;
}

export function CustomSidebarContextMenu({
  isPinned,
  onPinChange,
  children,
  ...props
}: CustomSidebarContextMenuProps) {
  return (
    <ContextMenu {...props}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <CustomContextMenuContent>
        <CustomContextMenuItem onClick={() => onPinChange(!isPinned)}>
          {isPinned ? (
            <>
              <PinOff /> Unpin
            </>
          ) : (
            <>
              <Pin /> Pin
            </>
          )}
        </CustomContextMenuItem>
        <ContextMenuSeparator />
        <CustomContextMenuItem disabled inset>
          More features soon...
        </CustomContextMenuItem>
      </CustomContextMenuContent>
    </ContextMenu>
  );
}
