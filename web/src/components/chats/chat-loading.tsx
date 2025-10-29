"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ChatLoadingProps {
  className?: string;
}

export function ChatLoading({ className }: ChatLoadingProps) {
  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        {/* Messages Loading */}
        <div className="flex-1 p-4 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MessageSkeleton key={i} isUser={i % 2 === 0} />
          ))}
        </div>

        {/* Input Loading */}
        <div className="border-t p-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface MessageSkeletonProps {
  isUser?: boolean;
}

function MessageSkeleton({ isUser = false }: MessageSkeletonProps) {
  return (
    <div
      className={cn(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          {Math.random() > 0.5 && <Skeleton className="h-4 w-1/2" />}
        </div>
      </div>
    </div>
  );
}

export function ChatListLoading({ className }: { className?: string }) {
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0">
        <div className="p-2 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <ChatItemSkeleton key={i} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ChatItemSkeleton() {
  return (
    <div className="p-3 rounded-lg border space-y-2">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}