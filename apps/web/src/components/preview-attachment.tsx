"use client";

import { AttachmentPreviewDialog } from "@/components/attachment-preview-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  getAttachmentPreviewKind,
  getAttachmentPreviewUrl,
} from "@/lib/attachment-preview";
import type { Attachment } from "@/lib/types";
import {
  FileAudio,
  FileCode2,
  FileText,
  FileVideo,
  ImageIcon,
  RotateCcw,
  X,
} from "lucide-react";
import { useState } from "react";

export function PreviewAttachment({
  attachment,
  isUploading = false,
  error,
  onRemove,
  onRetry,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  error?: string;
  onRemove?: () => void;
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const kind = getAttachmentPreviewKind(
    attachment.name,
    attachment.contentType,
  );
  const source = getAttachmentPreviewUrl(attachment.dataUrl ?? attachment.url);
  const label = attachment.name || "Attachment";
  const Icon =
    kind === "image"
      ? ImageIcon
      : kind === "audio"
        ? FileAudio
        : kind === "video"
          ? FileVideo
          : kind === "text"
            ? FileCode2
            : FileText;

  return (
    <>
      <div
        className="group relative size-16 shrink-0 overflow-hidden rounded-lg border bg-muted"
        data-testid="input-attachment-preview"
      >
        {error ? (
          <div className="flex size-full flex-col items-center justify-center gap-1 px-1 text-center text-[10px] text-destructive">
            <span title={error}>Upload failed</span>
            {onRetry && (
              <Button
                aria-label={`Retry uploading ${label}`}
                size="icon-xs"
                variant="ghost"
                onClick={onRetry}
              >
                <RotateCcw />
              </Button>
            )}
          </div>
        ) : (
          <Button
            aria-label={`Preview ${label}`}
            title={label}
            className="size-full rounded-none p-0"
            variant="ghost"
            disabled={!source || isUploading}
            onClick={() => setOpen(true)}
          >
            {kind === "image" && source && !imageFailed ? (
              <img
                alt={label}
                className="size-full object-cover"
                src={source}
                onError={() => setImageFailed(true)}
              />
            ) : (
              <Icon />
            )}
          </Button>
        )}
        {isUploading && (
          <output
            className="absolute inset-0 flex items-center justify-center bg-background/80"
            data-testid="input-attachment-loader"
            aria-label={`Uploading ${label}`}
          >
            <Spinner />
          </output>
        )}
        {onRemove && !isUploading && (
          <Button
            aria-label={`Remove ${label}`}
            className="absolute top-0.5 right-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
            size="icon-xs"
            variant="destructive"
            onClick={onRemove}
          >
            <X />
          </Button>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-background/90 px-1 py-0.5 text-[10px] text-foreground">
          {label}
        </div>
      </div>
      <AttachmentPreviewDialog
        attachment={attachment}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
