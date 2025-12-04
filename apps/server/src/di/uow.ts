import type { UnitOfWork } from "@circulo/core";
import { db } from "@/db";

type DbClient = typeof db;

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
  constructor(readonly client: DbClient = db) {}

  async transaction<TResult>(
    work: (scope: DrizzleUnitOfWork) => Promise<TResult>,
  ): Promise<TResult> {
    return this.client.transaction(async (tx) => {
      const txScope = new DrizzleUnitOfWork(tx as unknown as DbClient);
      return await work(txScope);
    });
  }

  async commit(): Promise<void> {
    // Handled by Drizzle transaction boundary
  }

  async rollback(): Promise<void> {
    throw new Error("Rollback is managed by the transaction callback");
  }
}
