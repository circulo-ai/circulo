import { EnhancedLink } from "@/components/enhanced-link";
import { Ripple } from "@/components/ui-custom/ripple";
import {
  CustomSidebarContextMenu,
  CustomSidebarMenuAvatar,
  CustomSidebarMenuButton,
} from "@/components/ui-custom/sidebar";
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
import { Badge } from "@/components/ui/badge";
import { SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useOptimisticSWRMutation } from "@/hooks/use-optimistic-swr-mutation";
import { writeTextToClipboard } from "@/lib/clipboard";
import { formatDate } from "@/lib/format-date";
import { getFetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { useChatHistoryStore } from "@/stores/use-chat-history-store";
import type { GetChatHistoryResponse } from "@/types/history";
import { Pin } from "lucide-react";
import { useRouter } from "next/navigation";
import { forwardRef, useCallback, useState } from "react";
import { toast } from "sonner";
import { type Arguments, type Key, useSWRConfig } from "swr";

function getChatAvatarInitials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "C";

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

const CHAT_AVATAR_GRADIENTS = [
  "from-amber-800 to-orange-700",
  "from-emerald-800 to-green-700",
  "from-slate-800 to-slate-600",
  "from-rose-900 to-red-700",
  "from-stone-800 to-yellow-800",
  "from-teal-900 to-emerald-700",
] as const;

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
    const { setOpenMobile } = useSidebar();
    const router = useRouter();
    const { mutate } = useSWRConfig();
    const [isMutating, setIsMutating] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const avatar = item.avatar?.trim();
    const initials = getChatAvatarInitials(item.title);
    const avatarGradient = getChatAvatarGradient(item.title);
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
      [
        currentChatId,
        isHistoryKey,
        isMutating,
        item.id,
        mutate,
        router,
        setCurrentChatId,
      ],
    );

    const deleteArchivedChat = useCallback(async () => {
      if (!item.isArchived || isMutating) return;
      setIsMutating(true);
      try {
        const response = await fetch(
          `/api/chat?id=${encodeURIComponent(item.id)}`,
          {
            method: "DELETE",
          },
        );
        if (!response.ok) {
          throw new Error("Unable to delete archived chat");
        }
        await mutate(
          isHistoryKey,
          (current: GetChatHistoryResponse | undefined) =>
            current
              ? {
                  ...current,
                  chats: current.chats.filter((chat) => chat.id !== item.id),
                }
              : current,
          { revalidate: false },
        );
        setDeleteDialogOpen(false);
        toast.success("Archived chat removed");
        void mutate(isHistoryKey).catch(() => undefined);
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
    }, [
      currentChatId,
      isHistoryKey,
      isMutating,
      item.id,
      item.isArchived,
      mutate,
      router,
      setCurrentChatId,
    ]);

    return (
      <>
        <SidebarMenuItem ref={ref}>
          <CustomSidebarContextMenu
            onCopyId={() => {
              void writeTextToClipboard(item.id).then(
                () => toast.success("Chat ID copied"),
                () => toast.error("Could not copy the chat ID. Try again."),
              );
            }}
            isPinned={item.isPinned}
            onPinChange={handlePinChange}
            isArchived={item.isArchived}
            onArchiveChange={updateArchive}
            onDelete={
              item.isArchived ? () => setDeleteDialogOpen(true) : undefined
            }
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
                  onClick={() => {
                    setCurrentChatId(item.id);
                    setOpenMobile(false);
                  }}
                >
                  <CustomSidebarMenuAvatar
                    className={cn(
                      "flex items-center justify-center overflow-hidden bg-linear-to-br text-xs font-semibold text-white",
                      avatarGradient,
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
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete archived chat?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the archived chat from normal app views using
                soft-delete semantics. The record remains retained for recovery.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isMutating}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isMutating}
                onClick={(event) => {
                  event.preventDefault();
                  void deleteArchivedChat();
                }}
                className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
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
