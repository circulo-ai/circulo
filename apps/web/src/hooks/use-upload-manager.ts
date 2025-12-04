import { useCallback, useMemo, useState } from "react";

export type UploadStatus =
  | "queued"
  | "preparing"
  | "uploading"
  | "success"
  | "error"
  | "canceled";

export type UploadItem = {
  id: string;
  file: File;
  context: string;
  status: UploadStatus;
  progress: number;
  url?: string;
  key?: string;
  error?: string;
};

export type UseUploadManagerOptions = {
  defaultContext?: string;
  onItemFinish?: (item: UploadItem) => void;
};

async function uploadFile({
  file,
  context,
}: {
  file: File;
  context: string;
}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("context", context);

  const response = await fetch("/api/files/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Upload failed");
  }

  const data = await response.json();
  const result = Array.isArray(data.files) ? data.files[0] : data;

  return {
    url: result.url ?? result.path,
    key: result.key,
  };
}

export function useUploadManager(options: UseUploadManagerOptions = {}) {
  const defaultContext = options.defaultContext ?? "general";
  const [items, setItems] = useState<UploadItem[]>([]);

  const isUploading = useMemo(
    () =>
      items.some(
        (item) =>
          item.status === "uploading" || item.status === "preparing",
      ),
    [items],
  );

  const updateItem = useCallback(
    (id: string, updater: (item: UploadItem) => UploadItem) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? updater(item) : item)),
      );
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const startUpload = useCallback(
    async (file: File, context: string) => {
      const id = crypto.randomUUID();
      setItems((prev) => [
        ...prev,
        {
          id,
          file,
          context,
          status: "preparing",
          progress: 0,
        },
      ]);

      try {
        updateItem(id, (item) => ({ ...item, status: "uploading" }));

        const { url, key } = await uploadFile({ file, context });

        updateItem(id, (item) => ({
          ...item,
          status: "success",
          progress: 100,
          url: url ?? item.url,
          key: key ?? item.key,
        }));

        const finalItem =
          items.find((i) => i.id === id) ??
          ({
            id,
            file,
            context,
            status: "success",
            progress: 100,
            url,
            key,
          } satisfies UploadItem);

        options.onItemFinish?.({
          ...finalItem,
          status: "success",
          progress: 100,
          url,
          key,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Upload failed";
        updateItem(id, (item) => ({
          ...item,
          status: "error",
          progress: 0,
          error: message,
        }));

        const erroredItem =
          items.find((i) => i.id === id) ??
          ({
            id,
            file,
            context,
            status: "error",
            progress: 0,
            error: message,
          } satisfies UploadItem);

        options.onItemFinish?.(erroredItem);
      }
    },
    [items, options, updateItem],
  );

  const addFiles = useCallback(
    (files: File[], context?: string) => {
      const resolvedContext = context ?? defaultContext;
      files.forEach((file) => {
        void startUpload(file, resolvedContext);
      });
    },
    [defaultContext, startUpload],
  );

  const retry = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      remove(id);
      void startUpload(item.file, item.context);
    },
    [items, remove, startUpload],
  );

  const cancel = useCallback(
    (id: string) => {
      updateItem(id, (item) => ({ ...item, status: "canceled" }));
    },
    [updateItem],
  );

  return {
    items,
    isUploading,
    addFiles,
    remove,
    clear,
    retry,
    cancel,
  };
}
