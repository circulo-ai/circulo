import { CrossSmallIcon } from "@/components/icons/icons";
import type { Attachment } from "@/lib/types";
import Image from "next/image";
import Link from "next/link";
import { Loader } from "./ai-elements/loader";
import { Button } from "./ui/button";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType, dataUrl } = attachment;
  const previewUrl = (dataUrl ?? url)?.trim() || undefined;
  const isImage = contentType?.toLowerCase().startsWith("image") === true;
  const isAudio = contentType?.toLowerCase().startsWith("audio") === true;

  return (
    <div
      className="group relative size-16 overflow-hidden rounded-lg border bg-muted"
      data-testid="input-attachment-preview"
    >
      {isImage && previewUrl ? (
        <Image
          alt={name ?? "An image attachment"}
          className="size-full object-cover"
          height={64}
          src={previewUrl}
          width={64}
        />
      ) : isAudio && previewUrl ? (
        <audio className="size-full" controls src={previewUrl} />
      ) : (
        <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
          {previewUrl ? (
            <Link
              className="px-1 text-center underline"
              href={previewUrl}
              target="_blank"
            >
              File
            </Link>
          ) : (
            <span className="px-1 text-center">File unavailable</span>
          )}
        </div>
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
          className="absolute top-0.5 right-0.5 size-4 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.preventDefault(); // Prevent form submission
            e.stopPropagation(); // Stop event bubbling
            onRemove();
          }}
          size="sm"
          variant="destructive"
          type="button" // ✅ CRITICAL: Explicitly set type="button"
        >
          <CrossSmallIcon size={8} />
        </Button>
      )}

      <div className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
        {name}
      </div>
    </div>
  );
};
