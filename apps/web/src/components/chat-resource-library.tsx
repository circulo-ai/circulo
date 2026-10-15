"use client";

import type { ArtifactKind } from "@/components/artifacts/artifact";
import { AttachmentPreviewDialog } from "@/components/attachment-preview-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
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
import { getAttachmentPreviewUrl } from "@/lib/attachment-preview";
import { getFetcher } from "@/lib/swr";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { format, isValid } from "date-fns";
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
  modifiedAt: string | null;
};

type ResourceFilter = "all" | "artifact" | "file" | "audio";

const EMPTY_RESOURCES: ChatResource[] = [];

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

function formatResourceDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return isValid(date) ? format(date, "MMM d, yyyy 'at' h:mm a") : null;
}

export function ChatResourceLibrary({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ResourceFilter>("all");
  const [previewResource, setPreviewResource] = useState<ChatResource>();
  const { setArtifact } = useArtifact();
  const { data, error, isLoading, mutate } = useSWR<{
    resources: ChatResource[];
  }>(open ? `/api/chat/${chatId}/resources` : null, getFetcher());

  const resources = data?.resources ?? EMPTY_RESOURCES;
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
        <SheetContent
          className="w-full gap-0 p-0 sm:w-[min(42rem,calc(100vw-2rem))] sm:!max-w-[min(42rem,calc(100vw-2rem))]"
          side="right"
        >
          <SheetHeader className="border-b px-5 py-5 pr-14 sm:px-6">
            <SheetTitle className="flex items-center gap-2 text-lg">
              Chat library
              <Badge className="font-normal" variant="secondary">
                {resources.length}
              </Badge>
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
                      className="flex flex-col gap-3 rounded-2xl border p-4"
                      key={item}
                    >
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-11 rounded-xl" />
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <Skeleton className="h-4 w-2/3 rounded" />
                          <Skeleton className="h-3 w-1/2 rounded" />
                        </div>
                      </div>
                      <div className="flex gap-3 border-t pt-3">
                        <Skeleton className="h-7 w-28 rounded-full" />
                        <Skeleton className="h-7 w-32 rounded-full" />
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
                  <EmptyContent>
                    <Button onClick={() => void mutate()} variant="outline">
                      Try again
                    </Button>
                  </EmptyContent>
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
                            onPreview={setPreviewResource}
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
      {previewResource && (
        <AttachmentPreviewDialog
          attachment={{
            name: previewResource.name,
            url: previewResource.url ?? "",
            contentType: previewResource.mediaType ?? "",
            size: previewResource.size ?? undefined,
          }}
          sharedBy={previewResource.sender.name}
          sharedAt={formatResourceDate(previewResource.createdAt) ?? undefined}
          open={Boolean(previewResource)}
          onOpenChange={(isOpen) => {
            if (!isOpen) setPreviewResource(undefined);
          }}
        />
      )}
    </>
  );
}

function ResourceRow({
  resource,
  onOpenArtifact,
  onPreview,
}: {
  resource: ChatResource;
  onOpenArtifact: (resource: ChatResource) => void;
  onPreview: (resource: ChatResource) => void;
}) {
  const safeUrl = getAttachmentPreviewUrl(resource.url);
  const Icon = resourceIcon(resource.type);
  const createdAt = formatResourceDate(resource.createdAt);
  const modifiedAt = formatResourceDate(resource.modifiedAt);
  const senderRole =
    resource.sender.type === "agent"
      ? "Agent"
      : resource.sender.type === "system"
        ? "System"
        : "Member";
  const content = (
    <Card className="gap-0 rounded-xl py-0 transition-colors group-hover:border-foreground/20 group-hover:bg-muted/20 group-focus-visible:border-ring group-focus-visible:ring-2 group-focus-visible:ring-ring/50">
      <CardHeader className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 p-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-5" />
        </div>
        <div className="min-w-0">
          <CardTitle className="truncate text-sm" title={resource.name}>
            {resource.name}
          </CardTitle>
          <CardDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span>
              {resource.type === "artifact" && resource.artifactKind
                ? resource.artifactKind
                : typeLabels[resource.type]}
            </span>
            {resource.mediaType && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{resource.mediaType}</span>
              </>
            )}
            {formatSize(resource.size) && (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatSize(resource.size)}</span>
              </>
            )}
          </CardDescription>
        </div>
        {(resource.type === "artifact" || safeUrl) && (
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
          />
        )}
      </CardHeader>
      <CardContent className="grid gap-3 border-t px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar size="sm">
            {resource.sender.image && (
              <AvatarImage alt="" src={resource.sender.image} />
            )}
            <AvatarFallback>{initials(resource.sender.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground">Shared by</div>
            <div className="truncate text-sm font-medium">
              {resource.sender.name}
            </div>
          </div>
          <Badge className="ml-auto sm:ml-0" variant="outline">
            {senderRole}
          </Badge>
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-muted-foreground">
              {resource.type === "artifact" ? "Created" : "Shared"}
            </dt>
            <dd
              className="font-medium break-words"
              title={createdAt ?? undefined}
            >
              {createdAt ?? "Date unavailable"}
            </dd>
          </div>
          {modifiedAt && (
            <div>
              <dt className="text-muted-foreground">Modified</dt>
              <dd className="font-medium break-words" title={modifiedAt}>
                {modifiedAt}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );

  if (resource.type === "artifact") {
    return (
      <button
        aria-label={`Open artifact ${resource.name}`}
        className="group w-full min-w-0 rounded-xl text-left focus-visible:outline-none"
        onClick={() => onOpenArtifact(resource)}
        type="button"
      >
        {content}
      </button>
    );
  }

  if (safeUrl) {
    return (
      <button
        aria-label={`Preview ${resource.name}`}
        className="group block min-w-0 rounded-xl text-left focus-visible:outline-none"
        type="button"
        onClick={() => onPreview(resource)}
      >
        {content}
      </button>
    );
  }

  return <div className="group min-w-0 rounded-xl">{content}</div>;
}
