"use client";

import { CollapsedConversationItem } from "@/components/sidebar/telegram/collapsed-conversation-item";
import { ConversationItem } from "@/components/sidebar/telegram/conversation-item";
import { SidebarHeader as TelegramSidebarHeader } from "@/components/sidebar/telegram/sidebar-header";
import { Conversation } from "@/components/sidebar/telegram/types";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { fetcher } from "@/lib/swr";
import useSWR from "swr";
import { User } from "@/providers/session-provider";
import { UserButton } from "@daveyplate/better-auth-ui";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import useSWRInfinite, { unstable_serialize } from "swr/infinite";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { SubscriptionUsageIndicator } from "./usage-indicator";

export function AppSidebar({ user }: { user: User }) {
  const router = useRouter();
  const { state, setOpenMobile } = useSidebar();
  const { mutate } = useSWRConfig();
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

  const PAGE_SIZE = 20;

  type ConversationPage = {
    conversations: Conversation[];
    hasMore: boolean;
  };

  const getConversationsPaginationKey = (
    pageIndex: number,
    previousPageData: ConversationPage | undefined,
  ) => {
    if (previousPageData && previousPageData.hasMore === false) {
      return null;
    }
    if (pageIndex === 0) {
      return `/api/conversations?limit=${PAGE_SIZE}`;
    }
    const last = previousPageData?.conversations.at(-1);
    if (!last) return null;
    return `/api/conversations?ending_before=${last.id}&limit=${PAGE_SIZE}`;
  };

  const {
    data: paginatedConversations,
    setSize,
    isValidating,
    isLoading,
    mutate: mutateConversations,
  } = useSWRInfinite<ConversationPage>(getConversationsPaginationKey, fetcher, {
    fallbackData: [],
  });

  const hasReachedEnd = paginatedConversations
    ? paginatedConversations.some((p) => p.hasMore === false)
    : false;

  const loaderRef = useState<HTMLDivElement | null>(null)[0];

  const formatTimestamp = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }).format(d)
      : new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
        }).format(d);
  };

  const { id } = useParams();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  const collapsed = state === "collapsed";
  const itemHeight = collapsed ? 48 : 56;

  const sentinelRef = (node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !isValidating && !hasReachedEnd) {
          setSize((s) => s + 1);
        }
      },
      { root: null, rootMargin: "0px", threshold: 0.1 },
    );
    observer.observe(node);
  };

  const handleDeleteAll = () => {
    const deletePromise = fetch("/api/history", {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting all chats...",
      success: () => {
        mutate(unstable_serialize(getConversationsPaginationKey));
        router.push("/");
        setShowDeleteAllDialog(false);
        return "All chats deleted successfully";
      },
      error: "Failed to delete all chats",
    });
  };

  return (
    <>
      <Sidebar collapsible="icon" className="group-data-[side=left]:border-r-0">
        <SidebarHeader>
          <TelegramSidebarHeader
            collapsed={state === "collapsed"}
            onNewChat={() => {
              setOpenMobile(false);
              router.push("/");
              router.refresh();
            }}
            onDeleteAll={() => setShowDeleteAllDialog(true)}
          />
        </SidebarHeader>
        <SidebarContent>
          {user &&
            (() => {
              if (isLoading) {
                return (
                  <div className="flex flex-col gap-2 p-2">
                    {[44, 32, 28, 64, 52].map((w, i) => (
                      <div
                        key={i}
                        className="bg-sidebar-accent-foreground/10 h-8 rounded-md"
                      />
                    ))}
                  </div>
                );
              }
              const conversations = (
                paginatedConversations?.flatMap((p) => p.conversations) ?? []
              ).map((c) => ({
                ...c,
                timestamp: formatTimestamp(c.timestamp),
              }));
              const viewport = scrollRef.current?.clientHeight ?? 0;
              const total = conversations.length;
              const startIndex = Math.max(
                Math.floor(scrollTop / itemHeight) - 5,
                0,
              );
              const visibleCount = Math.ceil(viewport / itemHeight) + 10;
              const endIndex = Math.min(startIndex + visibleCount, total);
              const visibleConversations = conversations.slice(
                startIndex,
                endIndex,
              );
              const topSpacer = startIndex * itemHeight;
              const bottomSpacer = (total - endIndex) * itemHeight;
              return (
                <SidebarGroup>
                  <SidebarGroupContent>
                    <div
                      ref={scrollRef}
                      className="min-h-0 flex-1 overflow-y-auto"
                      style={{
                        scrollbarGutter: "stable",
                        overscrollBehavior: "contain",
                      }}
                    >
                      <SidebarMenu>
                        <div style={{ height: topSpacer }} />
                        {visibleConversations.map((conversation) =>
                          collapsed ? (
                            <SidebarMenuItem key={conversation.id}>
                              <CollapsedConversationItem
                                conversation={conversation}
                                onClick={() => {
                                  setOpenMobile(false);
                                  router.push(`/chat/${conversation.id}`);
                                }}
                              />
                            </SidebarMenuItem>
                          ) : (
                            <SidebarMenuItem key={conversation.id}>
                              <ConversationItem
                                conversation={conversation}
                                isActive={conversation.id === id}
                                onClick={() => {
                                  setOpenMobile(false);
                                  router.push(`/chat/${conversation.id}`);
                                }}
                                onDelete={async (id) => {
                                  const deletePromise = fetch(
                                    `/api/chat?id=${id}`,
                                    { method: "DELETE" },
                                  );
                                  toast.promise(deletePromise, {
                                    loading: "Deleting chat...",
                                    success: () => {
                                      mutateConversations((pages) => {
                                        if (!pages) return pages;
                                        return pages.map((p) => ({
                                          ...p,
                                          conversations: p.conversations.filter(
                                            (c) => c.id !== id,
                                          ),
                                        }));
                                      });
                                      return "Chat deleted successfully";
                                    },
                                    error: "Failed to delete chat",
                                  });
                                }}
                              />
                            </SidebarMenuItem>
                          ),
                        )}
                        <div style={{ height: bottomSpacer }} />
                      </SidebarMenu>
                      <div className="py-2" ref={sentinelRef} />
                    </div>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })()}
        </SidebarContent>
        <SidebarFooter>
          {user && <SubscriptionUsageIndicator />}
          {user && (
            <UserButton
              className="mb-1"
              classNames={{
                trigger: {
                  base: "mx-auto",
                },
              }}
              size={state == "collapsed" ? "icon" : "default"}
              variant={"ghost"}
            />
          )}
        </SidebarFooter>
      </Sidebar>

      <AlertDialog
        onOpenChange={setShowDeleteAllDialog}
        open={showDeleteAllDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all
              your chats and remove them from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
