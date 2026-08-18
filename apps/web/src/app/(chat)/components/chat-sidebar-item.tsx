import { EnhancedLink } from "@/components/enhanced-link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Ripple } from "@/components/ui-custom/ripple";
import {
  CustomSidebarContextMenu,
  CustomSidebarMenuAvatar,
  CustomSidebarMenuButton,
} from "@/components/ui-custom/sidebar";
import { Badge } from "@/components/ui/badge";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import { useOptimisticSWRMutation } from "@/hooks/use-optimistic-swr-mutation";
import { formatDate } from "@/lib/format-date";
import { getFetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { useChatHistoryStore } from "@/stores/use-chat-history-store";
import type { GetChatHistoryResponse } from "@/types/history";
import { Pin } from "lucide-react";
import { useRouter } from "next/navigation";
import { forwardRef, useCallback, useState } from "react";
import { Arguments, Key, useSWRConfig } from "swr";
import { toast } from "sonner";

const CHAT_AVATAR_GRADIENTS = [
  "from-indigo-500 via-violet-500 to-fuchsia-500",
  "from-cyan-500 via-sky-500 to-blue-600",
  "from-emerald-500 via-teal-500 to-cyan-600",
  "from-amber-400 via-orange-500 to-rose-500",
  "from-pink-500 via-rose-500 to-red-600",
  "from-purple-500 via-fuchsia-500 to-pink-500",
] as const;

function getChatAvatarInitials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "C";

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function getChatAvatarGradient(title: string) {
  let hash = 0;

  for (const character of title) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return CHAT_AVATAR_GRADIENTS[hash % CHAT_AVATAR_GRADIENTS.length];
}

interface ChatSidebarItemProps {
  item: GetChatHistoryResponse["chats"][0];
}

export const ChatSidebarItem = forwardRef<HTMLLIElement, ChatSidebarItemProps>(
  function ChatSidebarItem({ item }, ref) {
    const { currentChatId, setCurrentChatId } = useChatHistoryStore();
    const router = useRouter();
    const { mutate } = useSWRConfig();
    const [isMutating, setIsMutating] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const avatar = item.avatar?.trim();
    const initials = getChatAvatarInitials(item.title);
    const latestMessage = item.lastMessage?.trim() || item.description?.trim();

    const isHistoryKey = useCallback(
      (key?: Arguments) =>
        (Array.isArray(key) && key[0] === "/api/history") ||
        (typeof key === "string" && key.startsWith("/api/history")),
      [],
    );

    const { trigger: handlePinChange } = useOptimisticSWRMutation<
      GetChatHistoryResponse,
      boolean,
      unknown,
      unknown,
      Key,
      {}
    >({
      mutationKey: `/api/chat/${item.id}/pin`,
      mutationFetcher: getFetcher("POST"),
      matchMutateKey: isHistoryKey,
      mapOptimisticToMutationArg: () => ({}),
      deriveOptimisticData: (current, nextIsPinned) => {
        if (!current) return current;

        const target = current.chats.find((chat) => chat.id === item.id);
        if (!target || target.isPinned === nextIsPinned) return current;

        return {
          ...current,
          chats: current.chats.map((chat) =>
            chat.id === item.id
              ? {
                  ...chat,
                  isPinned: nextIsPinned,
                  pinOrder: nextIsPinned ? (chat.pinOrder ?? 0) : undefined,
                }
              : chat,
          ),
        };
      },
    });

    const updateArchive = useCallback(
      async (archived: boolean) => {
        if (isMutating) return;
        setIsMutating(true);
        try {
          const response = await fetch("/api/chat/archive", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id, archived }),
          });
          if (!response.ok) {
            throw new Error("Unable to update archive status");
          }
          await mutate(isHistoryKey);
          toast.success(archived ? "Chat archived" : "Chat restored");
          if (archived && currentChatId === item.id) {
            setCurrentChatId(undefined);
            router.push("/chat");
          }
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Unable to update archive status",
          );
        } finally {
          setIsMutating(false);
        }
      },
      [currentChatId, isHistoryKey, isMutating, item.id, mutate, router, setCurrentChatId],
    );

    const deleteArchivedChat = useCallback(async () => {
      if (!item.isArchived || isMutating) return;
      setIsMutating(true);
      try {
        const response = await fetch(`/api/chat?id=${encodeURIComponent(item.id)}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error("Unable to delete archived chat");
        }
        await mutate(isHistoryKey);
        setDeleteDialogOpen(false);
        toast.success("Archived chat removed");
        if (currentChatId === item.id) {
          setCurrentChatId(undefined);
          router.push("/chat");
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to delete archived chat",
        );
      } finally {
        setIsMutating(false);
      }
    },
    [
      currentChatId,
      isHistoryKey,
      isMutating,
      item.id,
      item.isArchived,
      mutate,
      router,
      setCurrentChatId,
    ],
    );

    return (
      <>
        <SidebarMenuItem ref={ref}>
          <CustomSidebarContextMenu
            isPinned={item.isPinned}
            onPinChange={handlePinChange}
            isArchived={item.isArchived}
            onArchiveChange={updateArchive}
            onDelete={item.isArchived ? () => setDeleteDialogOpen(true) : undefined}
          >
            <CustomSidebarMenuButton
              isActive={currentChatId === item.id}
              asChild
            >
              <Ripple asChild>
                <EnhancedLink
                  enableLinkStatus={false}
                  asButton={false}
                  href={`/chat/${item.id}`}
                  onClick={() => setCurrentChatId(item.id)}
                >
                  <CustomSidebarMenuAvatar
                    className={cn(
                      "flex items-center justify-center overflow-hidden text-xs font-semibold text-white shadow-inner",
                      !avatar &&
                        `bg-linear-to-br ${getChatAvatarGradient(item.title)}`,
                    )}
                  >
                    {avatar ? (
                      <img
                        alt=""
                        className="size-full object-cover"
                        src={avatar}
                      />
                    ) : (
                      <span aria-hidden="true">{initials}</span>
                    )}
                  </CustomSidebarMenuAvatar>
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <div className="flex items-center gap-2">
                      <div className="line-clamp-1 min-w-0 grow font-medium">
                        {item.title}
                      </div>
                      <div className="shrink-0 text-xs opacity-75">
                        {formatDate(new Date(item.updatedAt))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="line-clamp-1 min-w-0 grow text-xs opacity-75">
                        {latestMessage || "No messages yet"}
                      </div>
                      <div className="relative flex h-4.5 min-w-10 shrink-0 items-end justify-end">
                        <Pin
                          className={cn(
                            "size-4 opacity-0 transition-opacity",
                            item.isPinned && "opacity-75",
                          )}
                        />
                        <Badge
                          variant="sidebar-menu-badge"
                          className={cn(
                            "absolute opacity-0",
                            Boolean(0) && "opacity-100",
                          )}
                        >
                          0
                        </Badge>
                      </div>
                    </div>
                  </div>
                </EnhancedLink>
              </Ripple>
            </CustomSidebarMenuButton>
          </CustomSidebarContextMenu>
        </SidebarMenuItem>
        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete archived chat?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the archived chat from normal app views using soft-delete semantics. The record remains retained for recovery.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isMutating}
                onClick={(event) => {
                  event.preventDefault();
                  void deleteArchivedChat();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete chat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);
