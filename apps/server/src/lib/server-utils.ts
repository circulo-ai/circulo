import crypto, {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "crypto";
import { env } from "./env";
import { createLogger } from "./logs/console/logger";

const logger = createLogger("ServerUtils");

/**
 * Generate a short request ID for correlation
 */
export function generateRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function generateId() {
  return crypto.randomUUID();
}

/**
 * Calculate approximate USD cost for a model usage.
 *
 * @param model - The full model name, e.g. "gpt-4o-mini" or "claude-3.5-sonnet".
 * @param inputTokens - Prompt tokens used.
 * @param outputTokens - Completion tokens used.
 * @returns Cost in USD (number).
 */
export function calculateCostFromUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // Prices are per 1,000 tokens, in USD
  // (as of late 2025; update as needed)
  const pricing: Record<string, { input: number; output: number }> = {
    // --- OpenAI ---
    "gpt-4o": { input: 0.005, output: 0.015 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
    // --- Anthropic (Claude) ---
    "claude-3.5-sonnet": { input: 0.003, output: 0.015 },
    "claude-3-opus": { input: 0.015, output: 0.075 },
    "claude-3-haiku": { input: 0.00025, output: 0.00125 },
    // --- Google Gemini ---
    "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
    "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
    // --- Mistral ---
    "mistral-large": { input: 0.002, output: 0.006 },
    "mistral-small": { input: 0.00025, output: 0.00075 },
  };

  // Try to find a matching model pricing rule
  const key = Object.keys(pricing).find((k) => model.startsWith(k));
  const price = (key ? pricing[key] : undefined) ?? {
    input: 0.002,
    output: 0.006,
  }; // default fallback

  const inputCost = (inputTokens / 1000) * price.input;
  const outputCost = (outputTokens / 1000) * price.output;
  const total = inputCost + outputCost;

  // Ensure precision and prevent negative or NaN
  return Number(total.toFixed(6)) || 0;
}

export function aesEncryptBase64(
  plain: string,
  keyB64: string,
  ivB64: string,
): string {
  const key = Buffer.from(keyB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plain, "utf8")),
    cipher.final(),
  ]);
  return encrypted.toString("base64");
}

export function hmacSha256Base64(data: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(data, "utf8")
    .digest("base64");
}

export function sha256SignBase64(data: string, signKey: string): string {
  const h = createHmac("sha256", signKey);
  h.update(data, "utf8");
  return h.digest("base64");
}

function getEncryptionKey(): Buffer {
  const key = env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes)",
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypts a secret using AES-256-GCM
 * @param secret - The secret to encrypt
 * @returns A promise that resolves to an object containing the encrypted secret and IV
 */
export async function encryptSecret(
  secret: string,
): Promise<{ encrypted: string; iv: string }> {
  const iv = randomBytes(16);
  const key = getEncryptionKey();

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:encrypted:authTag
  return {
    encrypted: `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`,
    iv: iv.toString("hex"),
  };
}

/**
 * Decrypts an encrypted secret
 * @param encryptedValue - The encrypted value in format "iv:encrypted:authTag"
 * @returns A promise that resolves to an object containing the decrypted secret
 */
export async function decryptSecret(
  encryptedValue: string,
): Promise<{ decrypted: string }> {
  const parts = encryptedValue.split(":");
  const ivHex = parts[0];
  const authTagHex = parts[parts.length - 1];
  const encrypted = parts.slice(1, -1).join(":");

  if (!ivHex || !encrypted || !authTagHex) {
    throw new Error(
      'Invalid encrypted value format. Expected "iv:encrypted:authTag"',
    );
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return { decrypted };
  } catch (error: any) {
    logger.error("Decryption error:", { error: error.message });
    throw error;
  }
}
