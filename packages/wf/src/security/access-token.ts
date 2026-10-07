import type {
  TokenRevocationStore,
  WorkflowAccessClaims,
  WorkflowAccessScope,
  WorkflowAccessTokenOptions,
} from "../models";
import { generateId } from "../utils/id";

interface TokenEnvelope {
  version: 1;
  issuer?: string | undefined;
  claims: WorkflowAccessClaims;
}

const MAX_TOKEN_LENGTH = 16 * 1024;
const MAX_CLAIM_VALUE_LENGTH = 256;
const MAX_WORKFLOW_IDS = 1000;
const ACCESS_SCOPES: readonly WorkflowAccessScope[] = [
  "workflow:read",
  "workflow:stream",
  "workflow:control",
];

export class WorkflowAccessTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowAccessTokenError";
  }
}

export class WorkflowAccessTokenSigner {
  constructor(
    private readonly secret: string,
    private readonly defaults: WorkflowAccessTokenOptions = {},
    private readonly revocations?: TokenRevocationStore,
  ) {
    if (secret.trim().length < 32) {
      throw new Error(
        "Workflow access token secret must be at least 32 characters",
      );
    }
    validateTokenOptions(defaults);
  }

  async issue(
    input: Omit<WorkflowAccessClaims, "issuedAt" | "expiresAt" | "tokenId"> &
      Partial<Pick<WorkflowAccessClaims, "issuedAt" | "expiresAt" | "tokenId">>,
    options: WorkflowAccessTokenOptions = {},
  ): Promise<string> {
    const issuedAt = input.issuedAt ?? Date.now();
    const expiresInMs = options.expiresInMs ?? this.defaults.expiresInMs;
    const expiresAt =
      input.expiresAt ?? issuedAt + (expiresInMs ?? 5 * 60 * 1000);
    validateTokenOptions(options);
    if (
      !Number.isFinite(issuedAt) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= issuedAt
    ) {
      throw new RangeError(
        "Workflow access token expiration must be in the future",
      );
    }
    const claims: WorkflowAccessClaims = {
      ...input,
      issuedAt,
      expiresAt,
      tokenId: input.tokenId ?? generateId("token"),
    };
    validateClaims(claims);
    const envelope: TokenEnvelope = {
      version: 1,
      ...((options.issuer ?? this.defaults.issuer)
        ? { issuer: options.issuer ?? this.defaults.issuer }
        : {}),
      claims,
    };
    const encoded = encodeJson(envelope);
    const signature = await sign(this.secret, encoded);
    return `${encoded}.${signature}`;
  }

  async verify(token: string): Promise<WorkflowAccessClaims> {
    if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
      throw new WorkflowAccessTokenError("Malformed access token");
    }
    const parts = token.split(".");
    if (parts.length !== 2)
      throw new WorkflowAccessTokenError("Malformed access token");
    const encoded = parts[0];
    const signature = parts[1];
    if (!encoded || !signature)
      throw new WorkflowAccessTokenError("Malformed access token");
    let validSignature = false;
    try {
      validSignature = await safeEqual(
        signature,
        await sign(this.secret, encoded),
      );
    } catch {
      validSignature = false;
    }
    if (!validSignature) {
      throw new WorkflowAccessTokenError("Invalid access token signature");
    }
    let envelope: TokenEnvelope;
    try {
      envelope = decodeJson<TokenEnvelope>(encoded);
    } catch {
      throw new WorkflowAccessTokenError("Invalid access token payload");
    }
    if (!isRecord(envelope) || envelope["version"] !== 1) {
      throw new WorkflowAccessTokenError("Unsupported access token version");
    }
    if (!isTokenEnvelope(envelope)) {
      throw new WorkflowAccessTokenError("Invalid access token claims");
    }
    if (this.defaults.issuer && envelope.issuer !== this.defaults.issuer) {
      throw new WorkflowAccessTokenError("Access token issuer is invalid");
    }
    validateClaims(envelope.claims);
    if (envelope.claims.expiresAt <= Date.now()) {
      throw new WorkflowAccessTokenError("Access token has expired");
    }
    if (await this.revocations?.isRevoked(envelope.claims.tokenId)) {
      throw new WorkflowAccessTokenError("Access token has been revoked");
    }
    return envelope.claims;
  }

  async revoke(claims: WorkflowAccessClaims): Promise<void> {
    if (!this.revocations) {
      throw new Error("No token revocation store is configured");
    }
    await this.revocations.revoke(claims.tokenId, claims.expiresAt);
  }

  authorize(
    claims: WorkflowAccessClaims,
    workflowId: string,
    scope: WorkflowAccessScope,
    tenantId?: string,
  ): void {
    validateClaims(claims);
    if (!claims.scopes.includes(scope)) {
      throw new WorkflowAccessTokenError(`Access token lacks ${scope} scope`);
    }
    if (
      !claims.workflowIds.includes("*") &&
      !claims.workflowIds.includes(workflowId)
    ) {
      throw new WorkflowAccessTokenError(
        "Access token cannot access this workflow",
      );
    }
    if (claims.tenantId !== undefined && claims.tenantId !== tenantId) {
      throw new WorkflowAccessTokenError(
        "Access token tenant does not match workflow",
      );
    }
  }
}

export class InMemoryTokenRevocationStore implements TokenRevocationStore {
  private readonly revoked = new Map<string, number>();

  async revoke(tokenId: string, expiresAt: number): Promise<void> {
    this.revoked.set(tokenId, expiresAt);
  }

  async isRevoked(tokenId: string): Promise<boolean> {
    await this.clearExpired();
    return this.revoked.has(tokenId);
  }

  async clearExpired(now = Date.now()): Promise<number> {
    let cleared = 0;
    for (const [tokenId, expiresAt] of this.revoked) {
      if (expiresAt <= now) {
        this.revoked.delete(tokenId);
        cleared += 1;
      }
    }
    return cleared;
  }
}

export function validateClaims(claims: WorkflowAccessClaims): void {
  if (!isRecord(claims)) {
    throw new WorkflowAccessTokenError("Token claims are invalid");
  }
  if (
    typeof claims.subject !== "string" ||
    !claims.subject.trim() ||
    claims.subject.length > MAX_CLAIM_VALUE_LENGTH
  ) {
    throw new WorkflowAccessTokenError("Token subject is required");
  }
  if (
    !Array.isArray(claims.scopes) ||
    claims.scopes.length === 0 ||
    claims.scopes.some(
      (scope) =>
        typeof scope !== "string" ||
        !ACCESS_SCOPES.includes(scope as WorkflowAccessScope),
    )
  ) {
    throw new WorkflowAccessTokenError("Token scopes are invalid");
  }
  if (
    !Array.isArray(claims.workflowIds) ||
    claims.workflowIds.length === 0 ||
    claims.workflowIds.length > MAX_WORKFLOW_IDS ||
    claims.workflowIds.some(
      (workflowId) =>
        typeof workflowId !== "string" ||
        !workflowId.trim() ||
        workflowId.length > MAX_CLAIM_VALUE_LENGTH,
    )
  ) {
    throw new WorkflowAccessTokenError("Token workflow ids are invalid");
  }
  if (
    claims.tenantId !== undefined &&
    (typeof claims.tenantId !== "string" ||
      !claims.tenantId.trim() ||
      claims.tenantId.length > MAX_CLAIM_VALUE_LENGTH)
  ) {
    throw new WorkflowAccessTokenError("Token tenant id is invalid");
  }
  if (
    typeof claims.issuedAt !== "number" ||
    !Number.isFinite(claims.issuedAt) ||
    typeof claims.expiresAt !== "number" ||
    !Number.isFinite(claims.expiresAt) ||
    claims.expiresAt <= claims.issuedAt
  ) {
    throw new WorkflowAccessTokenError("Token timestamps are invalid");
  }
  if (
    typeof claims.tokenId !== "string" ||
    !claims.tokenId.trim() ||
    claims.tokenId.length > MAX_CLAIM_VALUE_LENGTH
  ) {
    throw new WorkflowAccessTokenError("Token id is invalid");
  }
}

function validateTokenOptions(options: WorkflowAccessTokenOptions): void {
  if (
    options.expiresInMs !== undefined &&
    (!Number.isFinite(options.expiresInMs) || options.expiresInMs <= 0)
  ) {
    throw new RangeError("Workflow access token expiresInMs must be positive");
  }
  if (
    options.issuer !== undefined &&
    (typeof options.issuer !== "string" ||
      !options.issuer.trim() ||
      options.issuer.length > MAX_CLAIM_VALUE_LENGTH)
  ) {
    throw new RangeError("Workflow access token issuer must be non-empty");
  }
}

function isTokenEnvelope(value: unknown): value is TokenEnvelope {
  if (
    !isRecord(value) ||
    value["version"] !== 1 ||
    !isRecord(value["claims"])
  ) {
    return false;
  }
  if (value["issuer"] !== undefined && typeof value["issuer"] !== "string") {
    return false;
  }
  try {
    validateClaims(value["claims"] as unknown as WorkflowAccessClaims);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as T;
}

async function sign(secret: string, value: string): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle)
    throw new Error("Web Crypto API is required for access tokens");
  const key = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await cryptoApi.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

async function safeEqual(left: string, right: string): Promise<boolean> {
  const leftBytes = base64UrlDecode(left);
  const rightBytes = base64UrlDecode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return mismatch === 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new Error("Invalid base64url value");
  }
  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") +
    "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
