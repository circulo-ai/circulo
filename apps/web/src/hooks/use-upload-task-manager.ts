"use client";

import {
  MAX_FILE_SIZE,
  getMimeTypeFromExtension,
  validateFileSize,
  validateFileType,
} from "@circulo-ai/upload/validation";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";

import { getFetcher } from "@/lib/swr";

type StorageContext =
  | "general"
  | "knowledge-base"
  | "organization"
  | "chat"
  | "profile-pictures";

interface PresignUploadResponse {
  presignedUrl?: string;
  downloadUrl?: string;
  fileInfo?: {
    path?: string;
    key?: string;
  };
  uploadHeaders?: Record<string, string>;
  directUploadSupported?: boolean;
  error?: string;
}

interface UploadManagerOptions {
  autoStartUploads?: boolean;
  defaultStorageContext?: StorageContext;
  enableApiFallback?: boolean;
  maxConcurrentUploads?: number;
  onTaskComplete?: (task: UploadTask) => void;
  onTaskError?: (task: UploadTask) => void;
  onTasksChange?: (tasks: UploadTask[]) => void;
  presignEndpoint?: string;
  uploadEndpoint?: string;
  uploadRequestHeaders?: Record<string, string>;
}

interface UploadResult {
  key?: string;
  url?: string;
  path?: string;
  downloadUrl?: string;
}

export type UploadState =
  | "queued"
  | "preparing"
  | "uploading"
  | "success"
  | "error"
  | "canceled";

export interface UploadTask {
  bytesSent: number;
  completedAt?: number;
  context: StorageContext;
  error?: string;
  file: File;
  id: string;
  key?: string;
  path?: string;
  downloadUrl?: string;
  metadata?: Record<string, string>;
  progress: number; // 0-100
  startedAt?: number;
  status: UploadState;
  url?: string; // stable/readable URL/path
}

const API_UPLOAD_SWR_KEY = "upload/api";
const PRESIGN_UPLOAD_SWR_KEY = "upload/presign";
const UPLOAD_TASKS_SWR_KEY = "upload-manager/items";

const UPLOAD_MANAGER_DEFAULTS = {
  autoStartUploads: true,
  defaultStorageContext: "general",
  enableApiFallback: true,
  maxConcurrentUploads: 2,
  presignEndpoint: "/api/files/presigned",
  uploadEndpoint: "/api/files/upload",
} satisfies UploadManagerOptions;

export function useUploadTaskManager({
  autoStartUploads = UPLOAD_MANAGER_DEFAULTS.autoStartUploads,
  defaultStorageContext = UPLOAD_MANAGER_DEFAULTS.defaultStorageContext,
  enableApiFallback = UPLOAD_MANAGER_DEFAULTS.enableApiFallback,
  maxConcurrentUploads = UPLOAD_MANAGER_DEFAULTS.maxConcurrentUploads,
  onTaskComplete,
  onTaskError,
  onTasksChange,
  presignEndpoint = UPLOAD_MANAGER_DEFAULTS.presignEndpoint,
  uploadEndpoint = UPLOAD_MANAGER_DEFAULTS.uploadEndpoint,
  uploadRequestHeaders,
}: UploadManagerOptions) {
  const abortHandlersRef = useRef<Record<string, () => void>>({});
  const drainQueueRef = useRef<() => void>(() => {});
  const inFlightTaskIdsRef = useRef<Set<string>>(new Set());
  const pendingTaskIdsRef = useRef<string[]>([]);
  const taskStoreRef = useRef<Record<string, UploadTask>>({});

  const { data: taskCache = {}, mutate: mutateTaskCache } = useSWR<
    Record<string, UploadTask>
  >(UPLOAD_TASKS_SWR_KEY, () => taskStoreRef.current, {
    fallbackData: taskStoreRef.current,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateOnMount: false,
  });

  useEffect(() => {
    taskStoreRef.current = taskCache;
  }, [taskCache]);

  const updateTasks = useCallback(
    (
      updater: (
        current: Record<string, UploadTask>,
      ) => Record<string, UploadTask>,
    ) => {
      const current = taskStoreRef.current;
      const next = updater(current);
      if (next === current) return current;
      taskStoreRef.current = next;
      mutateTaskCache(next, false);
      onTasksChange?.(Object.values(next));
      return next;
    },
    [mutateTaskCache, onTasksChange],
  );

  const updateTask = useCallback(
    (taskId: string, updater: (current: UploadTask) => UploadTask) => {
      updateTasks((tasks) => {
        const existingTask = tasks[taskId];
        if (!existingTask) return tasks;
        return { ...tasks, [taskId]: updater(existingTask) };
      });
    },
    [updateTasks],
  );

  const releaseTaskSlot = useCallback((taskId: string) => {
    inFlightTaskIdsRef.current.delete(taskId);
    delete abortHandlersRef.current[taskId];
  }, []);

  const removeTaskFromQueue = useCallback((taskId: string) => {
    pendingTaskIdsRef.current = pendingTaskIdsRef.current.filter(
      (queuedId) => queuedId !== taskId,
    );
  }, []);

  const { trigger: triggerApiUpload } = useSWRMutation<
    UploadResult,
    Error,
    typeof API_UPLOAD_SWR_KEY,
    { task: UploadTask; signal: AbortSignal }
  >(
    API_UPLOAD_SWR_KEY,
    async (_key, { arg }) => {
      const { task, signal } = arg;
      if (task.context !== "general" && task.context !== "chat") {
        throw new Error(
          `API fallback only supports "general" or "chat" context (got "${task.context}")`,
        );
      }

      const formData = new FormData();
      formData.append("file", task.file);
      formData.append("context", task.context);

      const response: UploadResult = await getFetcher("POST", {
        headers: uploadRequestHeaders,
        raw: true,
        signal,
      })(uploadEndpoint, {
        arg: formData,
      });

      return {
        url: response.downloadUrl ?? response.url ?? response.path,
        path: response.path,
        key: response.key,
        downloadUrl: response.downloadUrl,
      };
    },
    { revalidate: false },
  );

  const { trigger: requestPresignedUpload } = useSWRMutation<
    PresignUploadResponse,
    Error,
    typeof PRESIGN_UPLOAD_SWR_KEY,
    UploadTask
  >(
    PRESIGN_UPLOAD_SWR_KEY,
    async (_key, { arg: task }) => {
      const payload = {
        fileName: task.file.name,
        contentType: task.file.type,
        fileSize: task.file.size,
        metadata: task.metadata,
      };

      return getFetcher("POST", {
        headers: uploadRequestHeaders,
      })([presignEndpoint, { type: task.context }], { arg: payload });
    },
    { revalidate: false },
  );

  const uploadViaPresignedUrl = useCallback(
    (task: UploadTask, presignData: PresignUploadResponse) => {
      return new Promise<UploadResult>((resolve, reject) => {
        if (!presignData.presignedUrl) {
          reject(new Error("Missing presigned URL"));
          return;
        }

        if (!presignData.fileInfo?.path && !presignData.downloadUrl) {
          reject(
            new Error(
              "Presign response missing readable file path (fileInfo.path) or downloadUrl. " +
                "Backend must return a usable GET URL.",
            ),
          );
          return;
        }

        const fileInfo = presignData.fileInfo;
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presignData.presignedUrl, true);

        if (presignData.uploadHeaders) {
          Object.entries(presignData.uploadHeaders).forEach(([key, value]) =>
            xhr.setRequestHeader(key, value),
          );
        }

        xhr.setRequestHeader(
          "Content-Type",
          task.file.type || "application/octet-stream",
        );

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const progress = Math.round((event.loaded / event.total) * 100);
          updateTask(task.id, (state) => ({
            ...state,
            progress,
            bytesSent: event.loaded,
            status: "uploading",
          }));
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({
              url: fileInfo?.path ?? presignData.downloadUrl,
              path: fileInfo?.path,
              key: fileInfo?.key,
              downloadUrl: presignData.downloadUrl,
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

        xhr.send(task.file);
        abortHandlersRef.current[task.id] = () => xhr.abort();
      });
    },
    [updateTask],
  );

  const processUploadTask = useCallback(
    async (taskId: string) => {
      const task = taskStoreRef.current[taskId];
      if (inFlightTaskIdsRef.current.has(taskId)) return;

      inFlightTaskIdsRef.current.add(taskId);
      updateTask(taskId, (state) => ({
        ...state,
        status: "preparing",
        startedAt: Date.now(),
      }));

      try {
        const presignData = await requestPresignedUpload(task);

        const directUploadSupported =
          presignData.directUploadSupported && presignData.presignedUrl;
        const apiFallbackAllowed =
          enableApiFallback &&
          (task.context === "general" || task.context === "chat");

        let result: UploadResult | undefined;

        if (directUploadSupported) {
          result = await uploadViaPresignedUrl(task, presignData);
        } else if (apiFallbackAllowed) {
          updateTask(taskId, (state) => ({
            ...state,
            status: "uploading",
            progress: Math.max(state.progress, 10),
          }));

          const controller = new AbortController();
          abortHandlersRef.current[taskId] = () => controller.abort();
          const apiResult = await triggerApiUpload({
            task,
            signal: controller.signal,
          });
          result = {
            url: apiResult.url,
            key: apiResult.key,
            path: apiResult.path,
            downloadUrl: apiResult.downloadUrl,
          };
        } else {
          throw new Error(
            "Direct upload not supported and fallback is disabled for this context",
          );
        }

        if (!result) throw new Error("Upload completed without a result");

        updateTask(taskId, (state) => ({
          ...state,
          status: "success",
          progress: 100,
          bytesSent: state.file.size,
          url: result.path ?? result.url ?? result.downloadUrl,
          path: result.path ?? result.url ?? result.downloadUrl,
          downloadUrl: result.downloadUrl,
          key: result.key,
          completedAt: Date.now(),
        }));

        onTaskComplete?.(taskStoreRef.current[taskId]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Upload failed";
        updateTask(taskId, (state) => ({
          ...state,
          status: message === "Upload aborted" ? "canceled" : "error",
          error: message,
          completedAt: Date.now(),
        }));
        onTaskComplete?.(taskStoreRef.current[taskId]);
        if (message !== "Upload aborted") {
          onTaskError?.(taskStoreRef.current[taskId]);
        }
      } finally {
        releaseTaskSlot(taskId);
        drainQueueRef.current();
      }
    },
    [
      enableApiFallback,
      onTaskComplete,
      onTaskError,
      releaseTaskSlot,
      requestPresignedUpload,
      triggerApiUpload,
      updateTask,
      uploadViaPresignedUrl,
    ],
  );

  const runUploadQueue = useCallback(() => {
    while (
      inFlightTaskIdsRef.current.size < maxConcurrentUploads &&
      pendingTaskIdsRef.current.length > 0
    ) {
      const nextTaskId = pendingTaskIdsRef.current.shift()!;
      void processUploadTask(nextTaskId);
    }
  }, [maxConcurrentUploads, processUploadTask]);

  useEffect(() => {
    drainQueueRef.current = runUploadQueue;
  }, [runUploadQueue]);

  const enqueueUploads = useCallback(
    (
      files: File[] | FileList,
      context: StorageContext = defaultStorageContext,
      metadata?: Record<string, string>,
    ) => {
      const addedTaskIds: string[] = [];
      updateTasks((tasks) => {
        const nextTasks = { ...tasks };
        Array.from(files).forEach((file) => {
          const taskId = nanoid();
          const typeError = validateFileType(
            file.name,
            file.type ||
              getMimeTypeFromExtension(file.name.split(".").pop() ?? ""),
          );
          const sizeError = validateFileSize(file.size, MAX_FILE_SIZE);
          const validationError = typeError ?? sizeError;

          nextTasks[taskId] = {
            id: taskId,
            file,
            context,
            status: validationError ? "error" : "queued",
            progress: 0,
            bytesSent: 0,
            metadata,
            ...(validationError
              ? { error: validationError.message, completedAt: Date.now() }
              : {}),
          };
          if (!validationError) pendingTaskIdsRef.current.push(taskId);
          addedTaskIds.push(taskId);
        });
        return nextTasks;
      });
      addedTaskIds.forEach((taskId) => {
        const task = taskStoreRef.current[taskId];
        if (task?.status === "error") onTaskError?.(task);
      });
      if (autoStartUploads) runUploadQueue();
      return addedTaskIds;
    },
    [
      autoStartUploads,
      defaultStorageContext,
      onTaskError,
      runUploadQueue,
      updateTasks,
    ],
  );

  const cancelUploadTask = useCallback(
    (taskId: string) => {
      abortHandlersRef.current[taskId]?.();
      removeTaskFromQueue(taskId);
      updateTask(taskId, (task) => ({
        ...task,
        status: "canceled",
        progress: task.progress > 0 ? task.progress : 0,
        completedAt: Date.now(),
      }));
      releaseTaskSlot(taskId);
      runUploadQueue();
    },
    [releaseTaskSlot, removeTaskFromQueue, runUploadQueue, updateTask],
  );

  const retryUploadTask = useCallback(
    (taskId: string) => {
      removeTaskFromQueue(taskId);
      pendingTaskIdsRef.current.push(taskId);
      updateTask(taskId, (task) => ({
        ...task,
        status: "queued",
        progress: 0,
        bytesSent: 0,
      }));
      if (autoStartUploads) runUploadQueue();
    },
    [autoStartUploads, removeTaskFromQueue, runUploadQueue, updateTask],
  );

  const removeUploadTask = useCallback(
    (taskId: string) => {
      cancelUploadTask(taskId);
      const nextTasks = { ...taskStoreRef.current };
      delete nextTasks[taskId];
      updateTasks(() => nextTasks);
    },
    [cancelUploadTask, updateTasks],
  );

  const resetAllUploadTasks = useCallback(() => {
    Object.keys(abortHandlersRef.current).forEach((taskId) =>
      abortHandlersRef.current[taskId]?.(),
    );
    pendingTaskIdsRef.current = [];
    inFlightTaskIdsRef.current.clear();
    abortHandlersRef.current = {};
    updateTasks(() => ({}));
  }, [updateTasks]);

  const startUploads = useCallback(
    (taskId?: string) => {
      if (taskId) {
        removeTaskFromQueue(taskId);
        pendingTaskIdsRef.current.unshift(taskId);
      }
      runUploadQueue();
    },
    [removeTaskFromQueue, runUploadQueue],
  );

  const uploadTasks = useMemo(
    () =>
      Object.values(taskCache).sort((a, b) => {
        if (a.startedAt && b.startedAt) return b.startedAt - a.startedAt;
        if (a.startedAt) return -1;
        if (b.startedAt) return 1;
        return 0;
      }),
    [taskCache],
  );

  const activeUploadCount = useMemo(
    () =>
      uploadTasks.filter(
        (task) => task.status === "uploading" || task.status === "preparing",
      ).length,
    [uploadTasks],
  );

  const hasUploadErrors = useMemo(
    () => uploadTasks.some((task) => task.status === "error"),
    [uploadTasks],
  );

  const hasActiveUploads = useMemo(
    () => activeUploadCount > 0,
    [activeUploadCount],
  );

  useEffect(() => {
    const abortAllActiveTasks = (reason: string) => {
      const activeTaskIds = Array.from(inFlightTaskIdsRef.current);

      activeTaskIds.forEach((taskId) => {
        abortHandlersRef.current[taskId]?.();
        updateTask(taskId, (task) => ({
          ...task,
          status: "error",
          error: reason,
          completedAt: Date.now(),
        }));

        releaseTaskSlot(taskId);
      });

      runUploadQueue();
    };

    const handleOffline = () => abortAllActiveTasks("Network disconnected");
    const handleOnline = () => {
      runUploadQueue();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [releaseTaskSlot, runUploadQueue, updateTask]);

  return {
    activeUploadCount,
    cancelUploadTask,
    enqueueUploads,
    hasActiveUploads,
    hasUploadErrors,
    removeUploadTask,
    resetAllUploadTasks,
    retryUploadTask,
    startUploads,
    uploadTasks,
  };
}
