import { createHash } from "node:crypto";

export function hashSyncPairingToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
