"use client";

import type { ArtifactKind } from "@/components/artifacts/artifact";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArtifact } from "@/hooks/api/chats/use-artifact";
import { getFetcher } from "@/lib/swr";
import { getSafeNavigationUrl } from "@/lib/urls/safe";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowUpRight,
  FileText,
  Image as ImageIcon,
  Music2,
  Paperclip,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "./ui/button";

type ResourceType = "artifact" | "audio" | "image" | "video" | "file";

type ChatResource = {
  id: string;
  type: ResourceType;
  name: string;
  artifactKind: ArtifactKind | null;
  url: string | null;
  mediaType: string | null;
  size: number | null;
  sender: {
    id: string;
    type: "user" | "agent" | "system";
    name: string;
    image: string | null;
  };
  messageId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ResourceFilter = "all" | "artifact" | "file" | "audio";

const typeLabels: Record<ResourceType, string> = {
  artifact: "Artifact",
  audio: "Voice & audio",
  image: "Image",
  video: "Video",
  file: "File",
};

function resourceIcon(type: ResourceType) {
  if (type === "artifact") return FileText;
  if (type === "audio") return Music2;
  if (type === "image") return ImageIcon;
  if (type === "video") return Video;
  return Paperclip;
}

function formatSize(size: number | null) {
  if (!size || size < 1) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function ChatResourceLibrary({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ResourceFilter>("all");
  const { setArtifact } = useArtifact();
  const { data, error, isLoading } = useSWR<{ resources: ChatResource[] }>(
    open ? `/api/chat/${chatId}/resources` : null,
    getFetcher(),
  );

  const resources = data?.resources ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredResources = useMemo(
    () =>
      resources.filter((resource) => {
        const matchesFilter =
          filter === "all" ||
          resource.type === filter ||
          (filter === "file" &&
            (resource.type === "image" || resource.type === "video"));
        if (!matchesFilter) return false;
        if (!normalizedSearch) return true;
        return [
          resource.name,
          resource.sender.name,
          resource.mediaType ?? "",
          resource.artifactKind ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      }),
    [filter, normalizedSearch, resources],
  );

  const groupedResources = useMemo(() => {
    const groups = new Map<string, ChatResource[]>();
    for (const resource of filteredResources) {
      const group =
        resource.type === "artifact"
          ? "Artifacts & documents"
          : resource.type === "audio"
            ? "Voice & audio"
            : "Shared files";
      groups.set(group, [...(groups.get(group) ?? []), resource]);
    }
    return [...groups.entries()];
  }, [filteredResources]);

  const openArtifact = (resource: ChatResource) => {
    if (resource.type !== "artifact" || !resource.artifactKind) return;
    setArtifact((currentArtifact) => ({
      ...currentArtifact,
      documentId: resource.id,
      title: resource.name,
      kind: resource.artifactKind!,
      content: "",
      status: "idle",
      error: undefined,
      isVisible: true,
    }));
    setOpen(false);
  };

  return (
    <>
      <Button
        aria-label="Open chat library"
        className="absolute top-3 right-12 z-20"
        onClick={() => setOpen(true)}
        size="icon"
        title="Chat library"
        variant="ghost"
      >
        <Paperclip />
      </Button>

      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-xl" side="right">
          <SheetHeader className="border-b px-5 py-5 pr-14 sm:px-6">
            <SheetTitle className="flex items-center gap-2 text-lg">
              Chat library
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                {resources.length}
              </span>
            </SheetTitle>
            <SheetDescription>
              Documents, artifacts, voice notes, and files shared in this chat.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-4 border-b px-5 py-4 sm:px-6">
              <div className="relative">
                <HugeiconsIcon
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  icon={Search01Icon}
                  strokeWidth={2}
                />
                <Input
                  aria-label="Search chat library"
                  className="pl-9"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search files, artifacts, or people"
                  value={search}
                />
              </div>
              <Tabs
                onValueChange={(value) => setFilter(value as ResourceFilter)}
                value={filter}
              >
                <TabsList className="w-full" variant="line">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="artifact">Artifacts</TabsTrigger>
                  <TabsTrigger value="file">Files</TabsTrigger>
                  <TabsTrigger value="audio">Audio</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {isLoading ? (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3, 4].map((item) => (
                    <div
                      className="flex items-center gap-3 rounded-2xl border p-3"
                      key={item}
                    >
                      <Skeleton className="size-10 rounded-xl" />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Skeleton className="h-3 w-2/3 rounded" />
                        <Skeleton className="h-2.5 w-1/2 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <AlertCircle />
                    </EmptyMedia>
                    <EmptyTitle>Library unavailable</EmptyTitle>
                    <EmptyDescription>
                      We couldn&apos;t load the shared resources for this chat.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : groupedResources.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Paperclip />
                    </EmptyMedia>
                    <EmptyTitle>
                      {resources.length === 0
                        ? "Nothing shared yet"
                        : "No matches"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {resources.length === 0
                        ? "Artifacts and files shared in this conversation will appear here."
                        : "Try a different search or resource filter."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col gap-6">
                  {groupedResources.map(([group, groupResources]) => (
                    <section className="flex flex-col gap-2" key={group}>
                      <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {group}
                      </h2>
                      <div className="flex flex-col gap-2">
                        {groupResources.map((resource) => (
                          <ResourceRow
                            key={resource.id}
                            onOpenArtifact={openArtifact}
                            resource={resource}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ResourceRow({
  resource,
  onOpenArtifact,
}: {
  resource: ChatResource;
  onOpenArtifact: (resource: ChatResource) => void;
}) {
  const safeUrl = getSafeNavigationUrl(resource.url);
  const Icon = resourceIcon(resource.type);
  const meta = [
    resource.sender.name,
    formatDistanceToNow(new Date(resource.updatedAt), { addSuffix: true }),
    formatSize(resource.size),
  ]
    .filter(Boolean)
    .join(" · ");
  const content = (
    <>
      <Avatar size="sm">
        {resource.sender.image && (
          <AvatarImage alt="" src={resource.sender.image} />
        )}
        <AvatarFallback>{initials(resource.sender.name)}</AvatarFallback>
      </Avatar>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{resource.name}</div>
        <div className="truncate text-xs text-muted-foreground">{meta}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-muted px-1.5 py-0.5">
            {resource.type === "artifact" && resource.artifactKind
              ? resource.artifactKind
              : typeLabels[resource.type]}
          </span>
          {resource.mediaType && (
            <span className="truncate">{resource.mediaType}</span>
          )}
        </div>
      </div>
      {(resource.type === "artifact" || safeUrl) && (
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
      )}
    </>
  );

  if (resource.type === "artifact") {
    return (
      <button
        aria-label={`Open ${resource.name}`}
        className="group flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition-colors hover:bg-muted"
        onClick={() => onOpenArtifact(resource)}
        type="button"
      >
        {content}
      </button>
    );
  }

  if (safeUrl) {
    return (
      <a
        aria-label={`Open ${resource.name}`}
        className="group flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition-colors hover:bg-muted"
        href={safeUrl}
        rel="noreferrer"
        target="_blank"
      >
        {content}
      </a>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border p-3">
      {content}
    </div>
  );
}
