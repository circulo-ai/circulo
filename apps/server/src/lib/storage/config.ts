import { env, isTruthy } from "@/lib/env";
import {
  AzureBlobStorageProvider,
  LocalStorageProvider,
  S3StorageProvider,
  StorageManager,
} from "@circulo-ai/upload";

// Define your app's storage contexts
export type AppStorageContext =
  | "general"
  | "knowledge-base"
  | "organization"
  | "chat"
  | "profile-pictures";

const region = env.S3_REGION || process.env.AWS_REGION || "us-east-1";
const endpoint = env.S3_ENDPOINT;
const forcePathStyle =
  env.S3_FORCE_PATH_STYLE !== undefined
    ? isTruthy(env.S3_FORCE_PATH_STYLE)
    : undefined;
const credentials =
  env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      }
    : undefined;

const defaultBucket = env.S3_BUCKET_NAME || process.env.S3_BUCKET;
const kbBucket =
  env.S3_KB_BUCKET_NAME || process.env.S3_KB_BUCKET || defaultBucket;
const orgBucket =
  env.S3_EXECUTION_FILES_BUCKET_NAME ||
  env.S3_BUCKET_NAME ||
  process.env.S3_ORG_BUCKET ||
  defaultBucket;
const chatBucket =
  env.S3_CHAT_BUCKET_NAME || process.env.S3_CHAT_BUCKET || defaultBucket;
const profilePicturesBucket =
  env.S3_PROFILE_PICTURES_BUCKET_NAME ||
  process.env.S3_PROFILE_PICTURES_BUCKET ||
  defaultBucket;

const defaultContainer = env.AZURE_STORAGE_CONTAINER_NAME;
const kbContainer = env.AZURE_STORAGE_KB_CONTAINER_NAME || defaultContainer;
const orgContainer =
  env.AZURE_STORAGE_EXECUTION_FILES_CONTAINER_NAME || defaultContainer;
const chatContainer = env.AZURE_STORAGE_CHAT_CONTAINER_NAME || defaultContainer;
const profilePicturesContainer =
  env.AZURE_STORAGE_PROFILE_PICTURES_CONTAINER_NAME || defaultContainer;

// Local development should not depend on a separately hosted object store.
// Production defaults to S3-compatible storage, while Azure can be selected
// explicitly with CIRCULO_STORAGE_DRIVER=azure.
const storageDriver =
  env.CIRCULO_STORAGE_DRIVER ??
  (env.NODE_ENV === "production" ? "s3" : "local");
const localStoragePath = env.CIRCULO_LOCAL_STORAGE_PATH || "./.local-storage";

if (env.NODE_ENV === "production" && storageDriver === "local") {
  throw new Error(
    "Local storage cannot be used in production. Configure S3 or Azure Blob Storage.",
  );
}

function makeProvider(bucket: string | undefined, pathPrefix?: string) {
  if (storageDriver === "local") {
    return new LocalStorageProvider({
      basePath: localStoragePath,
      pathPrefix,
    });
  }

  if (storageDriver === "azure") {
    if (!bucket) {
      throw new Error("Missing Azure Blob container configuration");
    }
    if (!env.AZURE_ACCOUNT_NAME && !env.AZURE_CONNECTION_STRING) {
      throw new Error(
        "Azure Blob storage requires AZURE_CONNECTION_STRING or AZURE_ACCOUNT_NAME + AZURE_ACCOUNT_KEY",
      );
    }

    return new AzureBlobStorageProvider({
      containerName: bucket,
      accountName: env.AZURE_ACCOUNT_NAME ?? "",
      accountKey: env.AZURE_ACCOUNT_KEY,
      connectionString: env.AZURE_CONNECTION_STRING,
      pathPrefix,
    });
  }

  if (!bucket) {
    throw new Error("Missing S3 bucket configuration for storage provider");
  }

  return new S3StorageProvider({
    bucket,
    region,
    endpoint,
    forcePathStyle,
    credentials,
    pathPrefix,
  });
}

// Initialize storage manager with your providers
export const storageManager = new StorageManager<AppStorageContext>({
  providers: {
    general: makeProvider(
      storageDriver === "azure" ? defaultContainer : defaultBucket,
    ),
    "knowledge-base": makeProvider(
      storageDriver === "azure" ? kbContainer : kbBucket,
      "kb",
    ),
    organization: makeProvider(
      storageDriver === "azure" ? orgContainer : orgBucket,
      "organization",
    ),
    chat: makeProvider(
      storageDriver === "azure" ? chatContainer : chatBucket,
      "chat",
    ),
    // No path prefix here to avoid double-prefixing when the bucket name already implies purpose
    "profile-pictures": makeProvider(
      storageDriver === "azure"
        ? profilePicturesContainer
        : profilePicturesBucket,
    ),
  },
  defaultContext: "general",
});
