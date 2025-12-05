export {
  getStorageConfig,
  type StorageContext,
} from "@/lib/uploads/core/config-resolver";
export {
  UPLOAD_DIR,
  USE_BLOB_STORAGE,
  USE_S3_STORAGE,
} from "@/lib/uploads/core/setup";
export {
  getServePathPrefix,
  getStorageProvider,
  isUsingCloudStorage,
  type CustomStorageConfig,
  type FileInfo,
} from "@/lib/uploads/core/storage-client";
export * as StorageService from "@/lib/uploads/core/storage-service";
export {
  MIME_TYPE_MAPPING,
  bufferToBase64,
  createFileContent as createAnthropicFileContent,
  getContentType as getAnthropicContentType,
  getFileExtension,
  getMimeTypeFromExtension,
  isSupportedFileType,
  type MessageContent as AnthropicMessageContent,
  type FileAttachment,
} from "@/lib/uploads/utils/file-utils";
