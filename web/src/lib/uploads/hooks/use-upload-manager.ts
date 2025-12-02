"use client";

import type { StorageContext } from "@/lib/uploads/core/config-resolver";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type UploadStatus =
  | "queued"
  | "preparing"
  | "uploading"
  | "success"
  | "error"
  | "canceled";

export interface UploadItem {
  id: string;
  file: File;
  context: StorageContext;
  status: UploadStatus;
  progress: number; // 0-100
  bytesSent: number;
  error?: string;
  url?: string; // SHOULD be a stable/readable URL/path
  key?: string;
  metadata?: Record<string, string>;
  startedAt?: number;
  completedAt?: number;
}

export interface UseUploadManagerOptions {
  defaultContext?: StorageContext;
  presignPath?: string;
  uploadPath?: string;
  maxConcurrent?: number;
  autoStart?: boolean;
  fallbackToApi?: boolean;
  requestHeaders?: Record<string, string>;
  onChange?: (items: UploadItem[]) => void;
  onItemFinish?: (item: UploadItem) => void;
}

interface PresignResponse {
  presignedUrl?: string; // PUT URL
  fileInfo?: {
    path?: string; // GET/public URL or stable path
    key?: string;
  };
  uploadHeaders?: Record<string, string>;
  directUploadSupported?: boolean;
  error?: string;
}

const DEFAULTS = {
  presignPath: "/api/files/presigned",
  uploadPath: "/api/files/upload",
  maxConcurrent: 2,
  autoStart: true,
  fallbackToApi: true,
  defaultContext: "general" as StorageContext,
};

export function useUploadManager(options: UseUploadManagerOptions = {}) {
  const {
    defaultContext = DEFAULTS.defaultContext,
    presignPath = DEFAULTS.presignPath,
    uploadPath = DEFAULTS.uploadPath,
    maxConcurrent = DEFAULTS.maxConcurrent,
    autoStart = DEFAULTS.autoStart,
    fallbackToApi = DEFAULTS.fallbackToApi,
    requestHeaders,
    onChange,
    onItemFinish,
  } = options;

  const itemsRef = useRef<Record<string, UploadItem>>({});
  const queueRef = useRef<string[]>([]);
  const inFlightRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<Record<string, () => void>>({});
  const [version, setVersion] = useState(0);

  const notify = useCallback(() => {
    setVersion((v) => v + 1);
    onChange?.(Object.values(itemsRef.current));
  }, [onChange]);

  const setItem = useCallback(
    (id: string, updater: (current: UploadItem) => UploadItem) => {
      const current = itemsRef.current[id];
      if (!current) return;
      itemsRef.current = {
        ...itemsRef.current,
        [id]: updater(current),
      };
      notify();
    },
    [notify],
  );

  const removeFromQueue = (id: string) => {
    queueRef.current = queueRef.current.filter((queued) => queued !== id);
  };

  const finalize = useCallback(
    (id: string) => {
      inFlightRef.current.delete(id);
      delete abortRef.current[id];
      notify();
    },
    [notify],
  );

  const startNext = useCallback(() => {
    while (
      inFlightRef.current.size < maxConcurrent &&
      queueRef.current.length > 0
    ) {
      const nextId = queueRef.current.shift()!;
      void startUpload(nextId);
    }
  }, [maxConcurrent]);

  const addFiles = useCallback(
    (
      files: File[] | FileList,
      context: StorageContext = defaultContext,
      metadata?: Record<string, string>,
    ) => {
      const addedIds: string[] = [];
      Array.from(files).forEach((file) => {
        const id = nanoid();
        const item: UploadItem = {
          id,
          file,
          context,
          status: "queued",
          progress: 0,
          bytesSent: 0,
          metadata,
        };
        itemsRef.current = { ...itemsRef.current, [id]: item };
        queueRef.current.push(id);
        addedIds.push(id);
      });
      notify();
      if (autoStart) startNext();
      return addedIds;
    },
    [autoStart, defaultContext, notify, startNext],
  );

  const cancel = useCallback(
    (id: string) => {
      abortRef.current[id]?.();
      removeFromQueue(id);
      setItem(id, (item) => ({
        ...item,
        status: "canceled",
        error: undefined,
        progress: item.progress > 0 ? item.progress : 0,
        completedAt: Date.now(),
      }));
      finalize(id);
      startNext();
    },
    [finalize, setItem, startNext],
  );

  const retry = useCallback(
    (id: string) => {
      removeFromQueue(id);
      queueRef.current.push(id);
      setItem(id, (item) => ({
        ...item,
        status: "queued",
        progress: 0,
        bytesSent: 0,
        error: undefined,
        completedAt: undefined,
      }));
      if (autoStart) startNext();
    },
    [autoStart, setItem, startNext],
  );

  const remove = useCallback(
    (id: string) => {
      cancel(id);
      const nextItems = { ...itemsRef.current };
      delete nextItems[id];
      itemsRef.current = nextItems;
      notify();
    },
    [cancel, notify],
  );

  const clear = useCallback(() => {
    Object.keys(abortRef.current).forEach((id) => abortRef.current[id]?.());
    queueRef.current = [];
    inFlightRef.current.clear();
    itemsRef.current = {};
    abortRef.current = {};
    notify();
  }, [notify]);

  async function presignRequest(item: UploadItem): Promise<PresignResponse> {
    const res = await fetch(`${presignPath}?type=${item.context}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(requestHeaders || {}),
      },
      body: JSON.stringify({
        fileName: item.file.name,
        contentType: item.file.type,
        fileSize: item.file.size,
        metadata: item.metadata,
      }),
    });

    const json = (await res.json()) as PresignResponse;
    if (!res.ok) {
      throw new Error(json?.error || "Failed to request presigned URL");
    }
    return json;
  }

  const apiUpload = async (item: UploadItem, signal: AbortSignal) => {
    if (item.context !== "general" && item.context !== "chat") {
      throw new Error(
        `API fallback only supports "general" or "chat" context (got "${item.context}")`,
      );
    }

    const formData = new FormData();
    formData.append("file", item.file);

    const res = await fetch(uploadPath, {
      method: "POST",
      body: formData,
      signal,
      headers: requestHeaders,
    });

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || `Upload failed with status ${res.status}`);
    }

    const json = await res.json();
    return { url: json.url || json.path, key: json.key };
  };

  const directUpload = (item: UploadItem, presign: PresignResponse) => {
    return new Promise<{ url: string; key?: string }>((resolve, reject) => {
      if (!presign.presignedUrl) {
        reject(new Error("Missing presigned URL"));
        return;
      }

      // ✅ FIX: never store PUT URL as final attachment URL
      if (!presign.fileInfo?.path) {
        reject(
          new Error(
            "Presign response missing readable file path (fileInfo.path). " +
              "Backend must return a stable GET/public URL.",
          ),
        );
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presign.presignedUrl, true);

      if (presign.uploadHeaders) {
        Object.entries(presign.uploadHeaders).forEach(([k, v]) =>
          xhr.setRequestHeader(k, v),
        );
      }

      xhr.setRequestHeader(
        "Content-Type",
        item.file.type || "application/octet-stream",
      );

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const progress = Math.round((event.loaded / event.total) * 100);
        setItem(item.id, (state) => ({
          ...state,
          progress,
          bytesSent: event.loaded,
          status: "uploading",
        }));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            url: presign.fileInfo!.path!, // stable/readable
            key: presign.fileInfo?.key,
          });
        } else {
          reject(
            new Error(
              `Upload failed with status ${xhr.status}: ${
                xhr.responseText || "Unknown error"
              }`,
            ),
          );
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onabort = () => reject(new Error("Upload aborted"));

      xhr.send(item.file);
      abortRef.current[item.id] = () => xhr.abort();
    });
  };

  async function startUpload(id: string) {
    const item = itemsRef.current[id];
    if (!item || inFlightRef.current.has(id)) return;

    inFlightRef.current.add(id);
    setItem(id, (state) => ({
      ...state,
      status: "preparing",
      startedAt: Date.now(),
      error: undefined,
    }));

    try {
      const presign = await presignRequest(item);

      const canDirect = presign.directUploadSupported && presign.presignedUrl;

      // ✅ OPTIONAL FIX: allow fallback for chat too (matches apiUpload above)
      const allowApiFallback =
        fallbackToApi &&
        (item.context === "general" || item.context === "chat");

      let result: { url?: string; key?: string } | undefined;

      if (canDirect) {
        result = await directUpload(item, presign);
      } else if (allowApiFallback) {
        setItem(id, (state) => ({
          ...state,
          status: "uploading",
          progress: Math.max(state.progress, 10),
        }));

        const controller = new AbortController();
        abortRef.current[id] = () => controller.abort();
        result = await apiUpload(item, controller.signal);
      } else {
        throw new Error(
          "Direct upload not supported and fallback is disabled for this context",
        );
      }

      setItem(id, (state) => ({
        ...state,
        status: "success",
        progress: 100,
        bytesSent: state.file.size,
        url: result?.url,
        key: result?.key,
        completedAt: Date.now(),
      }));

      onItemFinish?.(itemsRef.current[id]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setItem(id, (state) => ({
        ...state,
        status: message === "Upload aborted" ? "canceled" : "error",
        error: message,
        completedAt: Date.now(),
      }));
      onItemFinish?.(itemsRef.current[id]);
    } finally {
      finalize(id);
      startNext();
    }
  }

  const start = useCallback(
    (id?: string) => {
      if (id) {
        removeFromQueue(id);
        queueRef.current.unshift(id);
      }
      startNext();
    },
    [startNext],
  );

  const items = useMemo(
    () =>
      Object.values(itemsRef.current).sort((a, b) => {
        if (a.startedAt && b.startedAt) return b.startedAt - a.startedAt;
        if (a.startedAt) return -1;
        if (b.startedAt) return 1;
        return 0;
      }),
    [version],
  );

  const activeCount = useMemo(
    () =>
      items.filter(
        (item) => item.status === "uploading" || item.status === "preparing",
      ).length,
    [items],
  );

  const hasErrors = useMemo(
    () => items.some((item) => item.status === "error"),
    [items],
  );

  useEffect(() => {
    const abortAllActive = (reason: string) => {
      const activeIds = Array.from(inFlightRef.current);

      activeIds.forEach((id) => {
        // trigger XHR/fetch abort
        abortRef.current[id]?.();

        // mark item as error so UI can retry / re-add
        setItem(id, (item) => ({
          ...item,
          status: "error",
          error: reason,
          completedAt: Date.now(),
        }));

        finalize(id);
      });

      // allow queued items to restart once network is back
      startNext();
    };

    const onOffline = () => abortAllActive("Network disconnected");
    const onOnline = () => {
      // kick queue again when we're back
      startNext();
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [finalize, setItem, startNext]);

  return {
    items,
    activeCount,
    hasErrors,
    addFiles,
    cancel,
    retry,
    remove,
    clear,
    start,
    isUploading: activeCount > 0,
  };
}
