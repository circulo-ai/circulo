import { env, isTruthy } from "@/lib/env";
import { S3StorageProvider, StorageManager } from "@circulo-ai/upload";

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

function makeProvider(bucket: string | undefined, pathPrefix?: string) {
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
    general: makeProvider(defaultBucket),
    "knowledge-base": makeProvider(kbBucket, "kb"),
    organization: makeProvider(orgBucket, "organization"),
    chat: makeProvider(chatBucket, "chat"),
    // No path prefix here to avoid double-prefixing when the bucket name already implies purpose
    "profile-pictures": makeProvider(profilePicturesBucket),
  },
  defaultContext: "general",
});
