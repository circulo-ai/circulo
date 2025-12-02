import type {
  UploadItem,
  UploadStatus,
} from "@/lib/uploads/hooks/use-upload-manager";
import clsx from "clsx";
import type { ReactNode } from "react";

export interface UploadListProps {
  items: UploadItem[];
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  className?: string;
  /**
   * Custom action renderer. Defaults to built-in retry/remove/cancel buttons.
   */
  renderActions?: (item: UploadItem) => ReactNode;
  /**
   * Custom metadata renderer (e.g., show context or size).
   */
  renderMeta?: (item: UploadItem) => ReactNode;
  /**
   * Hide progress bars when not needed.
   */
  hideProgress?: boolean;
  /**
   * Render a fully custom item; receives default parts for easy reuse.
   */
  renderItem?: (
    item: UploadItem,
    parts: {
      actions: ReactNode;
      meta: ReactNode;
      progress: ReactNode;
      statusLabel: string;
      statusClass: string;
    },
  ) => ReactNode;
}

const statusColor: Record<UploadStatus, string> = {
  queued: "text-muted-foreground",
  preparing: "text-foreground",
  uploading: "text-primary",
  success: "text-green-600",
  error: "text-destructive",
  canceled: "text-muted-foreground",
};

const statusLabel: Record<UploadStatus, string> = {
  queued: "Queued",
  preparing: "Preparing",
  uploading: "Uploading",
  success: "Done",
  error: "Failed",
  canceled: "Canceled",
};

const buttonBase =
  "rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50";

function ProgressBar({
  value,
  status,
}: {
  value: number;
  status: UploadStatus;
}) {
  const isIndeterminate = value <= 0 || value === Infinity;
  return (
    <div className="mt-1 h-2 w-full rounded-full bg-muted">
      <div
        className={clsx(
          "h-2 rounded-full transition-[width] duration-200",
          status === "error" && "bg-destructive",
          status === "success" && "bg-green-500",
          (status === "uploading" || status === "preparing") && "bg-primary",
          status === "queued" && "bg-muted-foreground",
          status === "canceled" && "bg-muted-foreground/70",
        )}
        style={{ width: isIndeterminate ? "35%" : `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

/**
 * Minimal, theme-friendly list for upload items with pluggable actions/metas.
 */
export function UploadList({
  items,
  onCancel,
  onRetry,
  onRemove,
  className,
  renderActions,
  renderMeta,
  renderItem,
  hideProgress,
}: UploadListProps) {
  return (
    <div className={clsx("space-y-3", className)}>
      {items.map((item) => {
        const defaultActions = () => {
          if (item.status === "uploading" || item.status === "preparing") {
            return (
              <button
                className={clsx(buttonBase, "border-muted-foreground/40")}
                onClick={() => onCancel?.(item.id)}
              >
                Cancel
              </button>
            );
          }
          if (item.status === "error" || item.status === "canceled") {
            return (
              <div className="flex gap-2">
                <button
                  className={clsx(
                    buttonBase,
                    "border-primary/50 text-primary hover:bg-primary/10",
                  )}
                  onClick={() => onRetry?.(item.id)}
                >
                  Retry
                </button>
                <button
                  className={clsx(
                    buttonBase,
                    "border-muted-foreground/40 text-muted-foreground hover:bg-muted/50",
                  )}
                  onClick={() => onRemove?.(item.id)}
                >
                  Remove
                </button>
              </div>
            );
          }
          if (item.status === "success") {
            return (
              <button
                className={clsx(
                  buttonBase,
                  "border-muted-foreground/40 text-muted-foreground hover:bg-muted/50",
                )}
                onClick={() => onRemove?.(item.id)}
              >
                Clear
              </button>
            );
          }
          return null;
        };

        const actions = renderActions ? renderActions(item) : defaultActions();

        const meta = (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{(item.file.size / 1024 / 1024).toFixed(2)} MB</span>
            <span>•</span>
            <span>{item.context}</span>
            {item.error && (
              <>
                <span>•</span>
                <span className="text-destructive">{item.error}</span>
              </>
            )}
            {renderMeta?.(item)}
          </div>
        );

        const progressNode = hideProgress ? null : (
          <ProgressBar value={item.progress} status={item.status} />
        );

        if (renderItem) {
          return (
            <div
              key={item.id}
              className="rounded-lg border border-border/70 bg-card px-3 py-2 shadow-xs"
            >
              {renderItem(item, {
                actions,
                meta,
                progress: progressNode,
                statusLabel: statusLabel[item.status],
                statusClass: statusColor[item.status],
              })}
            </div>
          );
        }

        return (
          <div
            key={item.id}
            className="rounded-lg border border-border/70 bg-card px-3 py-2 shadow-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {item.file.name}
                  </p>
                  <span
                    className={clsx(
                      "text-xs font-medium",
                      statusColor[item.status],
                    )}
                  >
                    {statusLabel[item.status]}
                  </span>
                </div>
                {meta}
                {progressNode}
              </div>
              {actions && <div className="shrink-0">{actions}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
