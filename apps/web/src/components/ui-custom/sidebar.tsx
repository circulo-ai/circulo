import {
  ContextMenu,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { Archive, ArchiveRestore, Pin, PinOff, Trash2 } from "lucide-react";
import { ComponentProps, forwardRef } from "react";
import {
  Sidebar,
  SidebarGroup,
  SidebarGroupAction,
  SidebarHeader,
  SidebarInset,
  SidebarMenuButton,
  SidebarMenuSkeleton,
  useSidebar,
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
      className={cn(
        "relative min-h-0 flex-1 overflow-visible pb-16",
        className,
      )}
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

export const CustomSidebarGroupAction = forwardRef<
  HTMLButtonElement,
  CustomSidebarGroupActionProps
>(function CustomSidebarGroupAction(
  { className, children, style, ...props },
  ref,
) {
  const { open } = useSidebar();

  return (
    <SidebarGroupAction
      ref={ref}
      className={cn(
        "top-auto bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mt-auto size-11 overflow-visible rounded-full bg-teal-700 p-0 shadow-md shadow-black/20 transition-[background-color,transform] hover:bg-teal-600 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-teal-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar active:scale-95 group-data-[collapsible=icon]:flex data-[state=open]:bg-teal-600",
        className,
      )}
      style={{
        left: "auto",
        right: open ? "0.75rem" : "0.5rem",
        transform: "none",
        ...style,
      }}
      {...props}
    >
      {children}
    </SidebarGroupAction>
  );
});

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
  isArchived?: boolean;
  onArchiveChange?: (isArchived: boolean) => void;
  onDelete?: () => void;
}

export function CustomSidebarContextMenu({
  isPinned,
  onPinChange,
  isArchived = false,
  onArchiveChange,
  onDelete,
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
        {onArchiveChange && (
          <CustomContextMenuItem
            onClick={() => onArchiveChange(!isArchived)}
          >
            {isArchived ? <ArchiveRestore /> : <Archive />}
            {isArchived ? "Restore to chats" : "Archive"}
          </CustomContextMenuItem>
        )}
        {isArchived && onDelete && (
          <>
            <ContextMenuSeparator />
            <CustomContextMenuItem
              onClick={onDelete}
              className="text-destructive focus:bg-destructive/15 focus:text-destructive"
            >
              <Trash2 />
              Delete archived chat
            </CustomContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <CustomContextMenuItem disabled inset>
          More features soon...
        </CustomContextMenuItem>
      </CustomContextMenuContent>
    </ContextMenu>
  );
}
