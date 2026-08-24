import {
  CheckCircleFillIcon,
  GlobeIcon,
  LockIcon,
  MoreHorizontalIcon,
  ShareIcon,
  TrashIcon,
} from "@/components/icons/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useChatVisibility } from "@/hooks/api/chats/use-chat-visibility";
import type { Chat } from "@circulo-ai/db/schema";
import { Archive, Trash2 } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";

const PureChatItem = ({
  chat,
  isActive,
  onDelete,
  onArchive,
  setOpenMobile,
}: {
  chat: Chat;
  isActive: boolean;
  onDelete: (chatId: string) => void;
  onArchive: (chatId: string, archived: boolean) => void;
  setOpenMobile: (open: boolean) => void;
}) => {
  const { visibilityType, setVisibilityType } = useChatVisibility({
    chatId: chat.id,
    initialVisibilityType: chat.visibility,
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isActive}>
            <Link
              href={`/chat/${chat.id}`}
              onClick={() => setOpenMobile(false)}
            >
              <span>{chat.title}</span>
            </Link>
          </SidebarMenuButton>

          <DropdownMenu modal={true}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction
                className="mr-0.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                showOnHover={!isActive}
              >
                <MoreHorizontalIcon />
                <span className="sr-only">More</span>
              </SidebarMenuAction>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" side="bottom">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer">
                  <ShareIcon />
                  <span>Share</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      className="cursor-pointer flex-row justify-between"
                      onClick={() => {
                        setVisibilityType("private");
                      }}
                    >
                      <div className="flex flex-row items-center gap-2">
                        <LockIcon size={12} />
                        <span>Private</span>
                      </div>
                      {visibilityType === "private" ? (
                        <CheckCircleFillIcon />
                      ) : null}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer flex-row justify-between"
                      onClick={() => {
                        setVisibilityType("public");
                      }}
                    >
                      <div className="flex flex-row items-center gap-2">
                        <GlobeIcon />
                        <span>Public</span>
                      </div>
                      {visibilityType === "public" ? (
                        <CheckCircleFillIcon />
                      ) : null}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => onArchive(chat.id, Boolean(chat.isArchived))}
              >
                <span>{chat.isArchived ? "Restore to chats" : "Archive"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
                onSelect={() => onDelete(chat.id)}
              >
                <TrashIcon />
                <span>Remove</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        <ContextMenuItem
          onSelect={() => onArchive(chat.id, Boolean(chat.isArchived))}
        >
          <Archive className="size-4" />
          <span>{chat.isArchived ? "Restore to chats" : "Archive"}</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
          onSelect={() => onDelete(chat.id)}
          variant="destructive"
        >
          <Trash2 className="size-4" />
          <span>Remove</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const ChatItem = memo(PureChatItem, (prevProps, nextProps) => {
  if (prevProps.isActive !== nextProps.isActive) {
    return false;
  }
  return true;
});
