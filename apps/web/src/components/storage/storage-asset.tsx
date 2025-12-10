import { useStorageAsset } from "@/components/storage/use-storage-asset";
import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";

export interface StorageAssetProps {
  /** Full serve path (e.g., `/api/files/serve/<key>?context=profile-pictures`). */
  path?: string;
  /** Storage key (will be combined with context and serve prefix). */
  key?: string;
  /** Storage context (appended as `?context=` if not present). */
  context?: string;
  /** Optional base URL to prepend for absolute URLs. */
  baseUrl?: string;
  /** Fallback URL when the main asset fails. */
  fallbackUrl?: string;
  /** Render prop for full control. */
  render?: (state: {
    src?: string;
    isImage: boolean;
    hasError: boolean;
    onError: () => void;
  }) => ReactNode;
  /** Props forwarded to the default <img> rendering path. */
  imgProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, "src">;
  /** Props forwarded to the default <a> rendering path. */
  linkProps?: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;
  /**
   * When true, always render as <img> (even if not detected as image).
   * Useful for custom icons or when extension is missing.
   */
  forceImage?: boolean;
  /** Fallback label used by the default link renderer. */
  label?: string;
}

/**
 * General-purpose storage asset renderer. Defaults to:
 * - <img> for image-like assets
 * - <a> link for other assets
 * Use `render` to fully control output.
 */
export function StorageAsset({
  path,
  key,
  context,
  baseUrl,
  fallbackUrl,
  render,
  imgProps,
  linkProps,
  forceImage,
  label,
}: StorageAssetProps) {
  const { src, isImage, hasError, onError } = useStorageAsset({
    path,
    key,
    context,
    baseUrl,
    fallbackUrl,
  });

  if (!src) return null;

  if (render) {
    return (
      <>{render({ src, isImage: forceImage || isImage, hasError, onError })}</>
    );
  }

  if (forceImage || isImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} onError={onError} {...imgProps} />;
  }

  return (
    <a
      href={src}
      onClick={(e) => hasError && e.preventDefault()}
      {...linkProps}
    >
      {label || linkProps?.children || "Download"}
    </a>
  );
}
