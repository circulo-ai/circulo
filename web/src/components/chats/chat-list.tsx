"use client";

import { useState } from "react";
import { useChats, useCreateChat, useDeleteChat } from "@/hooks/chats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  MessageCircleIcon,
  PlusIcon,
  MoreVerticalIcon,
  TrashIcon,
  ExternalLinkIcon,
  AlertCircleIcon,
  RefreshCwIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { Chat } from "@/db/schema";

interface ChatListProps {
  className?: string;
  onChatSelect?: (chatId: string) => void;
  selectedChatId?: string;
}

export function ChatList({ className, onChatSelect, selectedChatId }: ChatListProps) {
  const { chats, isLoading, error, mutate } = useChats();
  const { createChat, isCreating } = useCreateChat();
  const { deleteChat, isDeleting } = useDeleteChat();
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);

  const handleCreateChat = async () => {
    try {
      const newChat = await createChat({
        title: "New Chat",
        description: "A new conversation",
        style: "brainstorm",
      });
      
      // Refresh the list
      mutate();
      
      // Select the new chat
      if (onChatSelect) {
        onChatSelect(newChat.id);
      }
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    setDeletingChatId(chatId);
    try {
      await deleteChat(chatId);
      mutate(); // Refresh the list
      
      // If this was the selected chat, clear selection
      if (selectedChatId === chatId && onChatSelect) {
        onChatSelect("");
      }
    } catch (error) {
      // Error handling is done in the hook
    } finally {
      setDeletingChatId(null);
    }
  };

  const handleRetry = () => {
    mutate();
  };

  if (error) {
    return (
      <Card className={cn("h-full", className)}>
        <CardContent className="flex flex-col items-center justify-center h-full p-8">
          <AlertCircleIcon className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to load chats</h3>
          <p className="text-muted-foreground text-center mb-4">
            {error instanceof Error ? error.message : "An error occurred"}
          </p>
          <Button onClick={handleRetry} variant="outline">
            <RefreshCwIcon className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageCircleIcon className="h-5 w-5" />
            Chats
          </CardTitle>
          <Button
            onClick={handleCreateChat}
            disabled={isCreating}
            size="sm"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <MessageCircleIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No chats yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first chat to get started
            </p>
            <Button onClick={handleCreateChat} disabled={isCreating}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Chat
            </Button>
          </div>
        ) : (
          <div className="overflow-y-auto h-full">
            <div className="p-2 space-y-2">
              {chats.map((chat) => (
                <ChatListItem
                  key={chat.id}
                  chat={chat}
                  isSelected={selectedChatId === chat.id}
                  onSelect={() => onChatSelect?.(chat.id)}
                  onDelete={() => handleDeleteChat(chat.id)}
                  isDeleting={deletingChatId === chat.id}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ChatListItemProps {
  chat: Chat;
  isSelected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

function ChatListItem({ 
  chat, 
  isSelected, 
  onSelect, 
  onDelete, 
  isDeleting 
}: ChatListItemProps) {
  return (
    <div
      className={cn(
        "group relative p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent",
        isSelected && "bg-accent border-primary"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate">{chat.title}</h4>
          {chat.description && (
            <p className="text-sm text-muted-foreground truncate mt-1">
              {chat.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs">
              {chat.style}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {chat.messageCount} messages
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(chat.updatedAt), { addSuffix: true })}
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVerticalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/chats/${chat.id}`}>
                <ExternalLinkIcon className="h-4 w-4 mr-2" />
                Open in new tab
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              disabled={isDeleting}
              className="text-destructive focus:text-destructive"
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isDeleting && (
        <div className="absolute inset-0 bg-background/80 rounded-lg flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Deleting...</div>
        </div>
      )}
    </div>
  );
}