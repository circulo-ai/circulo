"use client";

import { Response } from "@/components/ai-elements/response";
import { PdfAttachmentPreview } from "@/components/pdf-attachment-preview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  formatAttachmentSize,
  getAttachmentPreviewKind,
  getAttachmentPreviewUrl,
  readInlinePreviewBytes,
  readPreviewBytes,
  type ParsedAttachmentPreview,
} from "@/lib/attachment-preview";
import type { Attachment } from "@/lib/types";
import {
  Download,
  FileText,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type PreviewState = {
  loading: boolean;
  error?: string;
  text?: string;
  parsed?: ParsedAttachmentPreview;
  truncated?: boolean;
};

export function AttachmentPreviewDialog({
  attachment,
  open,
  onOpenChange,
  sharedBy,
  sharedAt,
}: {
  attachment: Attachment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sharedBy?: string;
  sharedAt?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <AttachmentPreviewContent
          key={`${attachment.url}:${attachment.dataUrl?.length ?? 0}`}
          attachment={attachment}
          sharedBy={sharedBy}
          sharedAt={sharedAt}
        />
      )}
    </Dialog>
  );
}

function AttachmentPreviewContent({
  attachment,
  sharedBy,
  sharedAt,
}: {
  attachment: Attachment;
  sharedBy?: string;
  sharedAt?: string;
}) {
  const kind = getAttachmentPreviewKind(
    attachment.name,
    attachment.contentType,
  );
  const source =
    getAttachmentPreviewUrl(attachment.downloadUrl ?? attachment.url) ??
    getAttachmentPreviewUrl(attachment.dataUrl);
  const download = getAttachmentPreviewUrl(
    attachment.downloadUrl ?? attachment.dataUrl ?? attachment.url,
  );
  const [state, setState] = useState<PreviewState>({
    loading:
      Boolean(source) &&
      ["text", "document", "spreadsheet", "pdf"].includes(kind),
  });
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const imageRef = useRef<HTMLImageElement>(null);
  const fitWidthRef = useRef(0);
  const changeZoom = (next: number) => {
    if (zoom === 1 && imageRef.current)
      fitWidthRef.current = imageRef.current.getBoundingClientRect().width;
    setZoom(next);
  };
  const [sheetIndex, setSheetIndex] = useState("0");
  const [pdfBytes, setPdfBytes] = useState<Uint8Array>();
  const size = formatAttachmentSize(attachment.size);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt restarts a failed PDF request.
  useEffect(() => {
    if (kind !== "pdf" || !source) return;
    const controller = new AbortController();
    setState({ loading: true });
    void (async () => {
      try {
        const { bytes } = source.startsWith("data:")
          ? readInlinePreviewBytes(source, 10 * 1024 * 1024)
          : await readPreviewBytes(
              await fetch(source, { signal: controller.signal }),
              10 * 1024 * 1024,
            );
        if (controller.signal.aborted) return;
        if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
          throw new Error(
            "This file is not a valid PDF. Download the original to open it.",
          );
        setPdfBytes(bytes);
        setState({ loading: false });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "This PDF could not be loaded. Download the original to open it.",
          });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [source, kind, attempt]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt intentionally restarts a failed preview request.
  useEffect(() => {
    if (!source || !["text", "document", "spreadsheet"].includes(kind)) return;
    const controller = new AbortController();
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setState({ loading: true });
    void (async () => {
      try {
        const limit = kind === "text" ? 1024 * 1024 : 10 * 1024 * 1024;
        const { bytes, truncated } = source.startsWith("data:")
          ? readInlinePreviewBytes(source, limit, kind === "text")
          : await readPreviewBytes(
              await fetch(source, { signal: controller.signal }),
              limit,
              kind === "text",
            );
        if (controller.signal.aborted) return;
        if (kind === "text") {
          const text = new TextDecoder().decode(bytes);
          setState({
            loading: false,
            text: text.slice(0, 200_000),
            truncated: truncated || text.length > 200_000,
          });
          return;
        }
        worker = new Worker(
          new URL("../workers/attachment-preview.worker.ts", import.meta.url),
        );
        const parsed = await new Promise<ParsedAttachmentPreview>(
          (resolve, reject) => {
            timeout = setTimeout(() => {
              worker?.terminate();
              reject(
                new Error(
                  "The preview took too long to prepare. Download the original to open it.",
                ),
              );
            }, 15_000);
            worker!.onmessage = (
              event: MessageEvent<{
                result?: ParsedAttachmentPreview;
                error?: string;
              }>,
            ) => {
              if (event.data.result) resolve(event.data.result);
              else
                reject(new Error(event.data.error ?? "Preview unavailable."));
            };
            worker!.onerror = () =>
              reject(
                new Error(
                  "The preview could not be prepared. Download the original to open it.",
                ),
              );
            worker!.postMessage({ kind, bytes: bytes.buffer }, [bytes.buffer]);
          },
        );
        if (!controller.signal.aborted)
          setState({ loading: false, parsed, truncated: parsed.truncated });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            loading: false,
            error:
              error instanceof TypeError
                ? "The file could not be loaded. Try again or download the original."
                : error instanceof Error
                  ? error.message
                  : "Preview unavailable.",
          });
      } finally {
        if (timeout) clearTimeout(timeout);
        worker?.terminate();
      }
    })();
    return () => {
      controller.abort();
      if (timeout) clearTimeout(timeout);
      worker?.terminate();
    };
  }, [source, kind, attempt]);

  const failMedia = () =>
    setState({
      loading: false,
      error:
        "Your device could not open this media format. Download the original to open it in another app.",
    });
  const sheet =
    state.parsed?.kind === "spreadsheet"
      ? state.parsed.sheets[Number(sheetIndex)]
      : undefined;
  const sheetItems =
    state.parsed?.kind === "spreadsheet"
      ? state.parsed.sheets.map((item, index) => ({
          value: String(index),
          label: item.name,
        }))
      : [];

  return (
    <DialogContent
      showCloseButton={false}
      className="flex h-[min(48rem,calc(var(--circulo-content-height,100dvh)-2rem))] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
    >
      <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="truncate" title={attachment.name}>
              {attachment.name || "Attachment"}
            </DialogTitle>
            <DialogDescription className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
              <span>
                {attachment.contentType || "File"}
                {size ? ` · ${size}` : ""}
              </span>
              {sharedBy && (
                <span>
                  Shared by {sharedBy}
                  {sharedAt ? ` · ${sharedAt}` : ""}
                </span>
              )}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {kind === "image" && !state.error && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom out"
                  disabled={zoom <= 0.5}
                  onClick={() => changeZoom(Math.max(0.5, zoom - 0.25))}
                >
                  <ZoomOut />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Reset image zoom"
                  onClick={() => setZoom(1)}
                >
                  {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom in"
                  disabled={zoom >= 3}
                  onClick={() => changeZoom(Math.min(3, zoom + 0.25))}
                >
                  <ZoomIn />
                </Button>
              </>
            )}
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close preview"
                />
              }
            >
              <X />
            </DialogClose>
          </div>
        </div>
      </DialogHeader>
      <div
        className="chat-scrollbar min-h-0 flex-1 overflow-auto bg-muted/30 p-4 sm:p-6"
        aria-busy={state.loading}
      >
        {state.loading ? (
          <output className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Preparing preview…
          </output>
        ) : state.error || !source ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>Preview unavailable</EmptyTitle>
              <EmptyDescription>
                {state.error ?? "This attachment has no accessible file URL."}
              </EmptyDescription>
            </EmptyHeader>
            {source && (
              <Button
                variant="outline"
                onClick={() => {
                  setState({ loading: false });
                  setAttempt((value) => value + 1);
                }}
              >
                <RotateCcw data-icon="inline-start" />
                Try again
              </Button>
            )}
          </Empty>
        ) : kind === "image" ? (
          <div className="flex min-h-full">
            <img
              key={attempt}
              ref={imageRef}
              alt={attachment.name}
              src={source}
              onError={failMedia}
              className="m-auto shrink-0 object-contain"
              style={{
                width: zoom === 1 ? undefined : fitWidthRef.current * zoom,
                maxWidth: zoom > 1 ? "none" : "100%",
                maxHeight: zoom === 1 ? "min(35rem,60dvh)" : "none",
              }}
            />
          </div>
        ) : kind === "audio" ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <FileText
              aria-hidden="true"
              className="size-12 text-muted-foreground"
            />
            {/* biome-ignore lint/a11y/useMediaCaption: Uploaded recordings do not include caption tracks. */}
            <audio
              key={attempt}
              className="w-full max-w-xl"
              controls
              preload="metadata"
              src={source}
              onError={failMedia}
              aria-label={attachment.name}
            />
          </div>
        ) : kind === "video" ? (
          <div className="flex min-h-full items-center justify-center">
            {/* biome-ignore lint/a11y/useMediaCaption: Uploaded videos do not include caption tracks. */}
            <video
              key={attempt}
              className="max-h-[60dvh] max-w-full"
              controls
              preload="metadata"
              src={source}
              onError={failMedia}
              aria-label={attachment.name}
            />
          </div>
        ) : kind === "pdf" ? (
          pdfBytes && (
            <PdfAttachmentPreview bytes={pdfBytes} name={attachment.name} />
          )
        ) : kind === "document" && state.parsed?.kind === "document" ? (
          <div className="mx-auto max-w-4xl rounded-xl border bg-background p-5 text-sm leading-7 break-words whitespace-pre-wrap">
            {state.parsed.text || "This document contains no extractable text."}
          </div>
        ) : kind === "text" &&
          (/\.(md|markdown)$/i.test(attachment.name) ||
            attachment.contentType === "text/markdown") ? (
          <div className="mx-auto max-w-4xl rounded-xl border bg-background p-5">
            <Response mode="static">{state.text ?? ""}</Response>
          </div>
        ) : kind === "text" ? (
          <pre className="mx-auto max-w-4xl rounded-xl border bg-background p-5 font-mono text-sm leading-6 break-words whitespace-pre-wrap">
            {state.text ?? ""}
          </pre>
        ) : kind === "spreadsheet" && sheet ? (
          <div className="flex flex-col gap-4">
            <Select
              items={sheetItems}
              value={sheetIndex}
              onValueChange={(value) => setSheetIndex(value ?? "0")}
            >
              <SelectTrigger aria-label="Worksheet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sheetItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {sheet.rows.length > 0 ? (
              <Table className="bg-background">
                <TableBody>
                  {sheet.rows.map((row, index) => (
                    <TableRow key={index}>
                      {row.map((cell, column) => (
                        <TableCell
                          className="max-w-80 truncate"
                          key={column}
                          title={cell}
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                This worksheet is empty.
              </p>
            )}
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>No inline preview</EmptyTitle>
              <EmptyDescription>
                This file type can be downloaded and opened in an app on your
                device.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-6">
        <p className="text-xs text-muted-foreground">
          {state.truncated
            ? "Preview shortened. Download the original for the full file."
            : kind === "document"
              ? "Document text preview. Download for the original formatting."
              : kind === "pdf"
                ? "If your device cannot display this PDF, download the original to open it."
                : "Original file is available to download."}
        </p>
        {download && (
          <Button asChild variant="outline" size="sm">
            <a href={download} download={attachment.name} rel="noreferrer">
              <Download data-icon="inline-start" />
              Download
            </a>
          </Button>
        )}
      </div>
    </DialogContent>
  );
}
