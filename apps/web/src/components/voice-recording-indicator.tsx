"use client";

import { Mic, Square, X } from "lucide-react";
import { Button } from "./ui/button";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function VoiceRecordingIndicator({
  elapsedSeconds,
  interimTranscript,
  transcript,
  onCancel,
  onStop,
}: {
  elapsedSeconds: number;
  interimTranscript: string;
  transcript: string;
  onCancel: () => void;
  onStop: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-2 py-1.5"
      role="status"
    >
      <Button
        aria-label="Cancel voice recording"
        className="size-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onCancel}
        size="icon"
        type="button"
        variant="ghost"
      >
        <X className="size-4" />
      </Button>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Mic className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div
          className="flex h-6 shrink-0 items-center gap-0.5"
          aria-hidden="true"
        >
          {[3, 5, 8, 4, 7, 10, 5, 8, 3].map((height, index) => (
            <span
              className="w-0.5 rounded-full bg-destructive/70 motion-safe:animate-pulse"
              key={`${height}-${index}`}
              style={{
                height: `${height * 2}px`,
                animationDelay: `${index * 80}ms`,
              }}
            />
          ))}
        </div>
        <span className="shrink-0 text-sm font-medium text-destructive tabular-nums">
          {formatDuration(elapsedSeconds)}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {interimTranscript || transcript || "Listening…"}
        </span>
      </div>
      <Button
        aria-label="Stop voice recording"
        className="text-destructive-foreground size-9 shrink-0 rounded-full bg-destructive hover:bg-destructive/90"
        onClick={onStop}
        size="icon"
        type="button"
      >
        <Square className="size-3.5 fill-current" />
      </Button>
    </div>
  );
}
