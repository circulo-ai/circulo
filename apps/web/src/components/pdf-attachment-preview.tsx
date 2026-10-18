"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

export function PdfAttachmentPreview({
  bytes,
  name,
}: {
  bytes: Uint8Array;
  name: string;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [text, setText] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() =>
      setWidth(Math.max(100, container.clientWidth - 24)),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let task:
      | ReturnType<(typeof import("pdfjs-dist"))["getDocument"]>
      | undefined;
    const timeout = setTimeout(() => {
      if (!disposed) {
        setError(
          "This PDF took too long to open. Download the original to view it.",
        );
        setBusy(false);
        void task?.destroy();
      }
    }, 20_000);
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        // Disable embedded scripting and dynamic code generation in uploaded PDFs.
        task = pdfjs.getDocument({
          data: bytes.slice(),
          enableXfa: false,
        });
        const loaded = await task.promise;
        if (!disposed) setDocument(loaded);
      } catch {
        if (!disposed) {
          setError(
            "This PDF could not be opened. It may be damaged or password protected. Download the original to view it.",
          );
          setBusy(false);
        }
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      void task?.destroy();
    };
  }, [bytes]);

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    let disposed = false;
    let render: RenderTask | undefined;
    const canvas = canvasRef.current;
    setBusy(true);
    setError(undefined);
    void (async () => {
      try {
        const pdfPage = await document.getPage(page);
        if (disposed) return;
        const natural = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({
          scale: Math.min(width / natural.width, 1.5) * zoom,
        });
        // Bound output size even for malformed PDFs or very large displays.
        const density = Math.min(
          window.devicePixelRatio || 1,
          2,
          4096 / Math.max(viewport.width, viewport.height),
        );
        canvas.width = Math.max(1, Math.floor(viewport.width * density));
        canvas.height = Math.max(1, Math.floor(viewport.height * density));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        render = pdfPage.render({
          canvas,
          viewport,
          transform: [density, 0, 0, density, 0, 0],
        });
        await render.promise;
        const content = await pdfPage.getTextContent();
        if (!disposed)
          setText(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
      } catch {
        if (!disposed)
          setError(
            "This page could not be rendered. Download the original to view it.",
          );
      } finally {
        if (!disposed) setBusy(false);
      }
    })();
    return () => {
      disposed = true;
      render?.cancel();
    };
  }, [document, page, zoom, width]);

  return (
    <div className="flex min-h-full flex-col gap-3" ref={containerRef}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-center gap-2 rounded-lg border bg-background p-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous PDF page"
          disabled={busy || page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-sm tabular-nums">
          Page {page} of {document?.numPages ?? "…"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next PDF page"
          disabled={busy || !document || page >= document.numPages}
          onClick={() => setPage((value) => value + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom PDF out"
          disabled={busy || zoom <= 0.5}
          onClick={() => setZoom((value) => value - 0.25)}
        >
          <ZoomOut />
        </Button>
        <span className="text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom PDF in"
          disabled={busy || zoom >= 2}
          onClick={() => setZoom((value) => value + 0.25)}
        >
          <ZoomIn />
        </Button>
      </div>
      {busy && (
        <output className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Rendering PDF…
        </output>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <canvas
        ref={canvasRef}
        className="mx-auto max-w-none rounded border bg-white"
        role="img"
        aria-label={`${name}, page ${page}`}
        hidden={Boolean(error)}
      />
      <p className="sr-only">{text}</p>
    </div>
  );
}
