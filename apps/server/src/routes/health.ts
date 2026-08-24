import { createRouter } from "@/lib/create-app";
import { env, isTruthy } from "@/lib/env";
import { isServiceReady, type ReadinessState } from "@/lib/readiness";
import {
  hasInvalidTrustedProxy,
  parseTrustedProxyIps,
} from "@/lib/trusted-proxies";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { getDb } from "@circulo-ai/db";
import { createRedis } from "@circulo-ai/redis";
import { sql } from "drizzle-orm";

const router = createRouter();

router.get("/", (c) =>
  c.json({
    service: "circulo-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  }),
);

router.get("/health", (c) =>
  c.json({
    service: "circulo-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  }),
);

router.get("/health/ready", async (c) => {
  const checks: Record<string, ReadinessState> = {};
  const isProduction = env.NODE_ENV === "production";

  try {
    await withTimeout(getDb().execute(sql`select 1`), 2_000);
    checks.database = "ok";
  } catch {
    checks.database = "failed";
  }

  if (env.REDIS_URL) {
    try {
      const redis = createRedis({ url: env.REDIS_URL, namespace: "health" });
      await withTimeout(redis.ping(), 2_000);
      checks.redis = "ok";
    } catch {
      checks.redis = "failed";
    }
  } else {
    checks.redis = "not_configured";
  }

  checks.auth =
    env.BETTER_AUTH_URL && env.BETTER_AUTH_SECRET ? "ok" : "not_configured";
  const trustedProxyHops = Number(env.TRUSTED_PROXY_HOPS ?? "0");
  const trustedProxyIps = parseTrustedProxyIps(env.TRUSTED_PROXY_IPS);
  const hasInvalidProxy = hasInvalidTrustedProxy(env.TRUSTED_PROXY_IPS);
  checks.proxy = hasInvalidProxy
    ? "not_configured"
    : Number.isFinite(trustedProxyHops) && trustedProxyHops > 0
      ? trustedProxyIps.length > 0
        ? "ok"
        : "not_configured"
      : "ok";
  checks.encryption = isValidEncryptionKey(env.ENCRYPTION_KEY)
    ? "ok"
    : "not_configured";
  checks.ai = env.OPENROUTER_API_KEY ? "ok" : "not_configured";
  checks.email = hasEmailProvider() ? "ok" : "not_configured";
  checks.storage = await checkStorageProvider();
  checks.billing =
    !isTruthy(env.BILLING_ENABLED) || env.AUTUMN_SECRET_KEY
      ? "ok"
      : "not_configured";

  const ready = isServiceReady(checks, isProduction);
  return c.json(
    {
      service: "circulo-api",
      status: ready ? "ready" : "not_ready",
      checks,
      timestamp: new Date().toISOString(),
    },
    ready ? 200 : 503,
  );
});

export default router;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Health check timed out")),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isValidEncryptionKey(value: string | undefined): boolean {
  return Boolean(value && /^[0-9a-fA-F]{64}$/.test(value));
}

function hasEmailProvider(): boolean {
  return Boolean(
    (env.RESEND_API_KEY?.trim() && env.RESEND_API_KEY !== "placeholder") ||
    env.AZURE_ACS_CONNECTION_STRING?.trim(),
  );
}

function hasStorageProvider(): boolean {
  const driver = getStorageDriver();
  if (driver === "local") return env.NODE_ENV !== "production";

  if (driver === "azure") {
    return Boolean(
      env.AZURE_STORAGE_CONTAINER_NAME &&
      (env.AZURE_CONNECTION_STRING ||
        (env.AZURE_ACCOUNT_NAME && env.AZURE_ACCOUNT_KEY)),
    );
  }

  return Boolean(env.S3_BUCKET_NAME || process.env.S3_BUCKET);
}

async function checkStorageProvider(): Promise<ReadinessState> {
  if (!hasStorageProvider()) return "not_configured";

  const driver = getStorageDriver();
  if (driver === "local") return "ok";
  if (driver === "azure") return checkAzureStorageProvider();

  const buckets = [
    env.S3_BUCKET_NAME || process.env.S3_BUCKET,
    env.S3_KB_BUCKET_NAME,
    env.S3_EXECUTION_FILES_BUCKET_NAME,
    env.S3_CHAT_BUCKET_NAME,
    env.S3_PROFILE_PICTURES_BUCKET_NAME,
  ].filter((bucket): bucket is string => Boolean(bucket?.trim()));
  const client = new S3Client({
    region: env.S3_REGION || process.env.AWS_REGION || "us-east-1",
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: isTruthy(env.S3_FORCE_PATH_STYLE),
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  try {
    await Promise.all(
      [...new Set(buckets)].map((Bucket) =>
        withTimeout(client.send(new HeadBucketCommand({ Bucket })), 2_000),
      ),
    );
    return "ok";
  } catch {
    return "failed";
  } finally {
    client.destroy();
  }
}

function getStorageDriver(): "local" | "s3" | "azure" {
  return (
    env.CIRCULO_STORAGE_DRIVER ??
    (env.NODE_ENV === "production" ? "s3" : "local")
  );
}

async function checkAzureStorageProvider(): Promise<ReadinessState> {
  if (!hasStorageProvider()) return "not_configured";

  try {
    const client = env.AZURE_CONNECTION_STRING
      ? BlobServiceClient.fromConnectionString(env.AZURE_CONNECTION_STRING)
      : new BlobServiceClient(
          `https://${env.AZURE_ACCOUNT_NAME}.blob.core.windows.net`,
          new StorageSharedKeyCredential(
            env.AZURE_ACCOUNT_NAME!,
            env.AZURE_ACCOUNT_KEY!,
          ),
        );
    const containers = [
      env.AZURE_STORAGE_CONTAINER_NAME,
      env.AZURE_STORAGE_KB_CONTAINER_NAME,
      env.AZURE_STORAGE_EXECUTION_FILES_CONTAINER_NAME,
      env.AZURE_STORAGE_CHAT_CONTAINER_NAME,
      env.AZURE_STORAGE_PROFILE_PICTURES_CONTAINER_NAME,
    ].filter((container): container is string => Boolean(container?.trim()));

    const results = await Promise.all(
      [...new Set(containers)].map((container) =>
        withTimeout(client.getContainerClient(container).exists(), 2_000),
      ),
    );
    return results.every(Boolean) ? "ok" : "failed";
  } catch {
    return "failed";
  }
}
