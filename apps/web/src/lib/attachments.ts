import type { UploadTask } from "@/hooks/use-upload-task-manager";
import type { Attachment } from "@/lib/types";

const MAX_INLINE_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export async function readFileAsDataUrl(
  file: File,
): Promise<string | undefined> {
  if (file.size > MAX_INLINE_ATTACHMENT_BYTES) return undefined;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(undefined);
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(file);
  });
}

export async function attachmentFromUploadTask(
  task: UploadTask,
): Promise<Attachment | undefined> {
  if (!task.url) return undefined;

  return {
    url: task.url,
    name: task.file.name,
    contentType: task.file.type || "application/octet-stream",
    size: task.file.size,
    dataUrl: await readFileAsDataUrl(task.file),
    downloadUrl: task.downloadUrl,
  };
}
