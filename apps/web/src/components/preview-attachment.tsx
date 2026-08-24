import { CrossSmallIcon } from "@/components/icons/icons";
import type { Attachment } from "@/lib/types";
import {
  Download,
  FileAudio,
  FileCode2,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Paperclip,
  Play,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Loader } from "./ai-elements/loader";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const TEXT_FILE_EXTENSIONS = new Set([
  "csv",
  "html",
  "htm",
  "json",
  "md",
  "markdown",
  "text",
  "txt",
  "yaml",
  "yml",
]);

function getExtension(name: string) {
  return name.toLowerCase().split(".").pop() ?? "";
}

function decodeDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+)?((?:;[^;,]+)*),(.*)$/is);
  if (!match) return undefined;

  const metadata = match[2] ?? "";
  const payload = match[3] ?? "";
  try {
    if (!/;base64/i.test(metadata)) return decodeURIComponent(payload);

    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

function getFileLabel(name: string) {
  return name || "Attachment";
}

export const PreviewAttachment = ({
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
}) => {
  const { name, url, contentType, dataUrl } = attachment;
  const previewUrl = (dataUrl ?? url)?.trim() || undefined;
  const normalizedType = contentType?.toLowerCase() ?? "";
  const extension = getExtension(name);
  const isImage = normalizedType.startsWith("image/");
  const isAudio = normalizedType.startsWith("audio/");
  const isVideo = normalizedType.startsWith("video/");
  const isPdf = normalizedType === "application/pdf" || extension === "pdf";
  const isText =
    normalizedType.startsWith("text/") || TEXT_FILE_EXTENSIONS.has(extension);
  const [isOpen, setIsOpen] = useState(false);
  const [remoteText, setRemoteText] = useState<string>();
  const [isLoadingText, setIsLoadingText] = useState(false);
  const textPreview = useMemo(
    () =>
      isText && previewUrl?.startsWith("data:")
        ? decodeDataUrl(previewUrl)
        : remoteText,
    [isText, previewUrl, remoteText],
  );
  const downloadUrl = attachment.downloadUrl ?? previewUrl;
  const label = getFileLabel(name);

  useEffect(() => {
    if (!isOpen || !isText || !previewUrl || previewUrl.startsWith("data:")) {
      return;
    }

    const controller = new AbortController();
    setIsLoadingText(true);
    void fetch(previewUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load text preview");
        setRemoteText((await response.text()).slice(0, 200_000));
      })
      .catch(() => {
        if (!controller.signal.aborted) setRemoteText(undefined);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingText(false);
      });

    return () => controller.abort();
  }, [isOpen, isText, previewUrl]);

  const PreviewIcon = isImage
    ? ImageIcon
    : isAudio
      ? FileAudio
      : isVideo
        ? FileVideo
        : isText
          ? FileCode2
          : FileText;

  const trigger =
    isImage && previewUrl ? (
      <button
        aria-label={`Preview ${label}`}
        className="size-full cursor-zoom-in"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <img alt={label} className="size-full object-cover" src={previewUrl} />
      </button>
    ) : (
      <button
        aria-label={previewUrl ? `Preview ${label}` : label}
        className="flex size-full cursor-pointer flex-col items-center justify-center gap-1 px-1 text-center text-muted-foreground transition-colors hover:bg-muted-foreground/10 disabled:cursor-default"
        disabled={!previewUrl}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <PreviewIcon className="size-5" />
        <span className="max-w-full truncate text-[10px]">{label}</span>
        {isAudio && <Play className="size-3" />}
      </button>
    );

  return (
    <>
      <div
        className="group relative size-16 overflow-hidden rounded-lg border bg-muted"
        data-testid="input-attachment-preview"
      >
        {error ? (
          <div className="flex size-full flex-col items-center justify-center gap-1 px-1 text-center text-[10px] text-destructive">
            <span aria-label={error} title={error}>
              Upload failed
            </span>
            {onRetry && (
              <Button
                aria-label="Retry upload"
                className="size-5 rounded-full p-0"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRetry();
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <RotateCcw className="size-3" />
              </Button>
            )}
          </div>
        ) : (
          trigger
        )}

        {isUploading && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/50"
            data-testid="input-attachment-loader"
          >
            <Loader size={16} />
          </div>
        )}

        {onRemove && !isUploading && (
          <Button
            aria-label={`Remove ${label}`}
            className="absolute top-0.5 right-0.5 size-4 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            size="sm"
            variant="destructive"
            type="button"
          >
            <CrossSmallIcon size={8} />
          </Button>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
          {label}
        </div>
      </div>

      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent className="max-h-[92dvh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="flex min-w-0 items-center gap-2">
              <PreviewIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{label}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Attachment preview for {label}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-auto p-4 sm:p-6">
            {isImage && previewUrl ? (
              <img
                alt={label}
                className="mx-auto max-h-[72dvh] max-w-full object-contain"
                src={previewUrl}
              />
            ) : isAudio && previewUrl ? (
              <div className="flex min-h-32 items-center justify-center">
                <audio className="w-full max-w-xl" controls src={previewUrl} />
              </div>
            ) : isVideo && previewUrl ? (
              <video
                className="mx-auto max-h-[72dvh] max-w-full"
                controls
                src={previewUrl}
              />
            ) : isPdf && previewUrl ? (
              <iframe
                className="h-[70dvh] min-h-96 w-full rounded-lg border bg-muted"
                src={previewUrl}
                title={`Preview of ${label}`}
              />
            ) : isText ? (
              <pre className="max-h-[70dvh] overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-6 whitespace-pre-wrap">
                {isLoadingText
                  ? "Loading preview…"
                  : (textPreview ??
                    "This text preview is unavailable. Use Download to open the original file.\n")}
              </pre>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 p-6 text-center">
                <Paperclip className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Preview is not available for this file type yet.
                </p>
              </div>
            )}
          </div>

          {downloadUrl && (
            <div className="flex justify-end border-t px-5 py-3">
              <Button asChild size="sm" variant="outline">
                <a download={label} href={downloadUrl} rel="noreferrer">
                  <Download className="size-4" />
                  Download
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
