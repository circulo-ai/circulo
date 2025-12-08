import { beginTransaction, getDb, type DbInstance } from "@/db";
import type { UnitOfWork } from "@circulo-ai/core";

type DbClient = DbInstance;

export type ManualUnitOfWork = {
  scope: DrizzleUnitOfWork;
  commit(): Promise<void>;
  rollback(): Promise<void>;
};

/**
 * Minimal Drizzle-based Unit of Work.
 *
 * Usage:
 *   const uow = resolve DI_TOKENS.UnitOfWork;
 *   await uow.transaction(async (ctx) => {
 *     const client = ctx.client; // transaction-bound db client
 *     // pass client to repositories that accept it, or run raw queries
 *   });
 */
export class DrizzleUnitOfWork implements UnitOfWork<DrizzleUnitOfWork> {
  private closed = false;

  constructor(
    readonly client: DbClient = getDb(),
    private readonly tx?: {
      commit(): Promise<void>;
      rollback(): Promise<void>;
    },
  ) {}

  /**
   * Starts a manual transaction with explicit commit/rollback controls.
   * This mirrors the ask in drizzle-orm#966 until native manual transactions land.
   */
  static async begin(): Promise<ManualUnitOfWork> {
    const { tx, db } = await beginTransaction();
    const scope = new DrizzleUnitOfWork(db as DbClient, tx);

    return {
      scope,
      commit: async () => {
        if (scope.closed) return;
        scope.closed = true;
        await tx.commit();
      },
      rollback: async () => {
        if (scope.closed) return;
        scope.closed = true;
        await tx.rollback();
      },
    };
  }

  async transaction<TResult>(
    work: (scope: DrizzleUnitOfWork) => Promise<TResult>,
  ): Promise<TResult> {
    // If already inside a manual transaction, reuse the same scope
    if (this.tx) {
      return await work(this);
    }

    return this.client.transaction(async (tx) => {
      const txScope = new DrizzleUnitOfWork(tx as unknown as DbClient);
      return await work(txScope);
    });
  }

  async commit(): Promise<void> {
    if (!this.tx || this.closed) return;
    this.closed = true;
    await this.tx.commit();
  }

  async rollback(): Promise<void> {
    if (!this.tx || this.closed) {
      throw new Error(
        "Rollback is only available on manual UnitOfWork.begin() transactions",
      );
    }
    this.closed = true;
    await this.tx.rollback();
  }
}
