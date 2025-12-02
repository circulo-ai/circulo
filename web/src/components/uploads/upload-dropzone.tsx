import clsx from "clsx";
import { useCallback, useRef, useState, type ReactNode } from "react";

export interface UploadDropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: string[]; // e.g. ["image/*", ".pdf"]
  maxSizeMb?: number;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  activeClassName?: string;
  idleContent?: ReactNode;
  activeContent?: ReactNode;
  /**
   * Fully custom renderer with state and helpers.
   */
  renderContent?: (state: {
    isDragging: boolean;
    disabled?: boolean;
    openFilePicker: () => void;
  }) => ReactNode;
  onReject?: (reason: string) => void;
}

const defaultIdle = (
  <div className="text-center text-sm text-muted-foreground">
    Drag & drop files or click to browse
  </div>
);

/**
 * Lightweight, theme-friendly dropzone with validation hooks.
 */
export function UploadDropzone({
  onFiles,
  accept,
  maxSizeMb,
  multiple = true,
  disabled,
  className,
  activeClassName,
  idleContent = defaultIdle,
  activeContent,
  renderContent,
  onReject,
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isAccepted = useCallback(
    (file: File) => {
      if (!accept || accept.length === 0) return true;
      return accept.some((rule) => {
        if (rule.endsWith("/*")) {
          const prefix = rule.replace("/*", "");
          return file.type.startsWith(prefix);
        }
        if (rule.startsWith(".")) {
          return file.name.toLowerCase().endsWith(rule.toLowerCase());
        }
        return file.type === rule;
      });
    },
    [accept],
  );

  const validateFiles = useCallback(
    (files: FileList | File[]) => {
      const picked: File[] = [];
      const maxBytes = maxSizeMb ? maxSizeMb * 1024 * 1024 : undefined;

      for (const file of Array.from(files)) {
        if (!isAccepted(file)) {
          onReject?.(`File type not allowed: ${file.name}`);
          continue;
        }
        if (maxBytes && file.size > maxBytes) {
          onReject?.(
            `File too large (${Math.round(file.size / 1024 / 1024)}MB). Max ${maxSizeMb}MB`,
          );
          continue;
        }
        picked.push(file);
        if (!multiple) break;
      }

      if (picked.length > 0) {
        onFiles(picked);
      }
    },
    [isAccepted, maxSizeMb, multiple, onFiles, onReject],
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    validateFiles(event.dataTransfer.files);
  };

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const files = event.target.files;
    if (files?.length) {
      validateFiles(files);
      event.target.value = "";
    }
  };

  const openFilePicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div
      className={clsx(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/50 p-6 transition-colors",
        disabled && "cursor-not-allowed opacity-60",
        isDragging && "border-primary bg-primary/5",
        className,
        isDragging && activeClassName,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={openFilePicker}
    >
      <input
        type="file"
        className="hidden"
        multiple={multiple}
        disabled={disabled}
        accept={accept?.join(",")}
        onChange={handleInput}
        ref={inputRef}
      />
      {renderContent
        ? renderContent({ isDragging, disabled, openFilePicker })
        : isDragging
          ? activeContent || idleContent
          : idleContent}
    </div>
  );
}
