import { getServePathPrefix } from "@/lib/uploads/core/storage-client";
import { useCallback, useMemo, useState } from "react";

export interface UseStorageAssetOptions {
  /**
   * Full serve path (e.g., `/api/files/serve/s3/<key>?context=profile-pictures`).
   */
  path?: string;
  /**
   * Storage key that will be combined with context and serve prefix.
   */
  key?: string;
  /**
   * Optional storage context, appended as `?context=<context>` if not present.
   */
  context?: string;
  /**
   * Optional base URL to prepend (useful for SSR or absolute URLs).
   */
  baseUrl?: string;
  /**
   * Fallback URL used when the primary asset fails to load.
   */
  fallbackUrl?: string;
}

function buildServeUrl(
  key?: string,
  context?: string,
  baseUrl?: string,
): string | undefined {
  if (!key) return undefined;
  const prefix = getServePathPrefix().replace(/\/+$/, "/");
  const url = `${prefix}${encodeURIComponent(key)}${context ? `?context=${encodeURIComponent(context)}` : ""}`;
  if (!baseUrl) return url;
  const trimmed = baseUrl.replace(/\/$/, "");
  return url.startsWith("http") ? url : `${trimmed}${url}`;
}

function normalizePath(
  path?: string,
  context?: string,
  baseUrl?: string,
): string | undefined {
  if (!path) return undefined;
  const url =
    context && !path.includes("?")
      ? `${path}?context=${encodeURIComponent(context)}`
      : path;
  if (!baseUrl) return url;
  const trimmed = baseUrl.replace(/\/$/, "");
  return url.startsWith("http") ? url : `${trimmed}${url}`;
}

const imagePattern = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

export function useStorageAsset(options: UseStorageAssetOptions) {
  const { path, key, context, baseUrl, fallbackUrl } = options;

  const resolved = useMemo(() => {
    if (path) return normalizePath(path, context, baseUrl);
    return buildServeUrl(key, context, baseUrl);
  }, [path, key, context, baseUrl]);

  const [hasError, setHasError] = useState(false);

  const src = hasError ? (fallbackUrl ?? resolved) : (resolved ?? fallbackUrl);
  const isImage = !!src && imagePattern.test(src.split("?")[0] || "");

  const onError = useCallback(() => {
    setHasError(true);
  }, []);

  const resetError = useCallback(() => {
    setHasError(false);
  }, []);

  return {
    src,
    isImage,
    hasError,
    onError,
    resetError,
  };
}
