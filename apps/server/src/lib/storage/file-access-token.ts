import { createHmac, timingSafeEqual } from "node:crypto";

function getSigningSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (!secret) throw new Error("INTERNAL_API_SECRET is not configured");
  return secret;
}

function getPayload(key: string, context: string): string {
  return `${context}:${key}`;
}

export function createFileAccessToken(key: string, context: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(getPayload(key, context))
    .digest("base64url");
}

export function verifyFileAccessToken(
  key: string,
  context: string,
  token: string | null | undefined,
): boolean {
  if (!token) return false;

  try {
    const expected = Buffer.from(createFileAccessToken(key, context));
    const received = Buffer.from(token);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  } catch {
    return false;
  }
}
