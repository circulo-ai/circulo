export interface UnitOfWork<TScope = unknown> {
  /**
   * Runs the callback inside a transactional boundary.
   */
  transaction<TResult>(
    work: (scope: TScope) => Promise<TResult>,
  ): Promise<TResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
