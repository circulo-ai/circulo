import type {
  IdempotencyClaim,
  IdempotencyStore,
  WorkflowRunReference,
} from "../models";

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<
    string,
    {
      reference: WorkflowRunReference;
      expiresAt?: number | undefined;
      fingerprint?: string | undefined;
    }
  >();

  async claim(
    key: string,
    reference: WorkflowRunReference,
    expiresAt?: number,
    fingerprint?: string,
  ): Promise<IdempotencyClaim> {
    await this.clearExpired();
    const existing = this.entries.get(key);
    if (existing) {
      return {
        claimed: false,
        reference: structuredClone(existing.reference),
        ...(fingerprint !== undefined &&
        existing.fingerprint !== undefined &&
        fingerprint !== existing.fingerprint
          ? { conflict: true }
          : {}),
      };
    }
    this.entries.set(key, {
      reference: structuredClone(reference),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      ...(fingerprint === undefined ? {} : { fingerprint }),
    });
    return { claimed: true, reference: structuredClone(reference) };
  }

  async release(
    key: string,
    reference: WorkflowRunReference,
  ): Promise<boolean> {
    const existing = this.entries.get(key);
    if (!existing || !sameReference(existing.reference, reference))
      return false;
    this.entries.delete(key);
    return true;
  }

  async clearExpired(now = Date.now()): Promise<number> {
    let cleared = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        this.entries.delete(key);
        cleared += 1;
      }
    }
    return cleared;
  }
}

function sameReference(
  left: WorkflowRunReference,
  right: WorkflowRunReference,
): boolean {
  return (
    left.workflowId === right.workflowId &&
    left.runId === right.runId &&
    left.tenantId === right.tenantId
  );
}
