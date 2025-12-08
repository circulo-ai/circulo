import { S3StorageProvider, StorageManager } from "@circulo-ai/upload";

// Define your app's storage contexts
export type AppStorageContext =
  | "general"
  | "knowledge-base"
  | "organization"
  | "chat"
  | "profile-pictures";

// Initialize storage manager with your providers
export const storageManager = new StorageManager<AppStorageContext>({
  providers: {
    general: new S3StorageProvider({
      bucket: process.env.S3_BUCKET!,
      region: process.env.AWS_REGION || "us-east-1",
    }),
    "knowledge-base": new S3StorageProvider({
      bucket: process.env.S3_KB_BUCKET!,
      region: process.env.AWS_REGION || "us-east-1",
      pathPrefix: "kb",
    }),
    organization: new S3StorageProvider({
      bucket: process.env.S3_ORG_BUCKET || process.env.S3_BUCKET!,
      region: process.env.AWS_REGION || "us-east-1",
      pathPrefix: "organization",
    }),
    chat: new S3StorageProvider({
      bucket: process.env.S3_CHAT_BUCKET || process.env.S3_BUCKET!,
      region: process.env.AWS_REGION || "us-east-1",
      pathPrefix: "chat",
    }),
    "profile-pictures": new S3StorageProvider({
      bucket: process.env.S3_BUCKET!,
      region: process.env.AWS_REGION || "us-east-1",
      pathPrefix: "profile-pictures",
    }),
  },
  defaultContext: "general",
});
