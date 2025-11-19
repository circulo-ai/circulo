import {
  eq,
  inArray,
  InferInsertModel,
  InferSelectModel,
  SQL,
  sql,
  TablesRelationalConfig,
} from "drizzle-orm";
import { AnyPgTable, getTableConfig } from "drizzle-orm/pg-core";
import {
  PostgresJsDatabase,
  PostgresJsTransaction,
} from "drizzle-orm/postgres-js";

/**
 * Type definition for a Drizzle executor (Database or Transaction).
 */
export type DrizzleExecutor<
  TFullSchema extends Record<string, unknown> = Record<string, unknown>,
> =
  | PostgresJsDatabase<TFullSchema>
  | PostgresJsTransaction<TFullSchema, TablesRelationalConfig>;

/**
 * Pagination Parameters
 */
export type PaginateParams = {
  page?: number;
  pageSize?: number;
  where?: SQL;
  orderBy?: SQL | SQL[];
};

/**
 * Pagination Result
 */
export type PagedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * Generic repository factory for Drizzle ORM tables.
 * Provides CRUD, pagination, and common utilities with strong typing.
 */
export function createRepository<
  TTable extends AnyPgTable,
  TFullSchema extends Record<string, unknown> = Record<string, unknown>,
>(
  db: DrizzleExecutor<TFullSchema>,
  table: TTable,
  options?: { primaryKey?: keyof InferSelectModel<TTable> },
) {
  type TModel = InferSelectModel<TTable>;
  type TInsert = InferInsertModel<TTable>;

  // We cast table to any to access columns by string key safely within internal logic
  // This is a necessary trade-off for generic repositories in Drizzle
  const tableAny = table as any;

  /**
   * Resolve the primary key.
   * Prioritizes options.primaryKey, then looks up Drizzle's table config.
   */
  const getPrimaryKey = (): string => {
    if (options?.primaryKey) return String(options.primaryKey);

    const config = getTableConfig(table);
    // Check for composite keys or single primary keys
    const pkColumn = config.primaryKeys[0];

    if (pkColumn?.columns?.[0]) {
      return pkColumn.columns[0].name;
    }

    // Fallback: search columns for "primary: true"
    const found = config.columns.find((c) => c.primary);
    if (found) return found.name;

    throw new Error(
      `No primary key found for table "${config.name}". Please provide options.primaryKey.`,
    );
  };

  // Cache the PK to avoid recalculating on every query
  const pkName = getPrimaryKey();
  const pkColumn = tableAny[pkName];

  return {
    /**
     * Create a single row and return it
     */
    async create(data: TInsert): Promise<TModel> {
      const rows = await db.insert(table).values(data).returning();
      return rows[0] as TModel;
    },

    /**
     * Create multiple rows and return them
     */
    async createMany(rows: TInsert[]): Promise<TModel[]> {
      if (!rows.length) return [];
      const inserted = await db.insert(table).values(rows).returning();
      return inserted as TModel[];
    },

    /**
     * Update one row by id and return it (or undefined if not found)
     */
    async update(
      id: TModel[keyof TModel] | string | number,
      data: Partial<TInsert>,
    ): Promise<TModel | undefined> {
      const rows = await db
        .update(table)
        .set(data)
        .where(eq(pkColumn, id))
        .returning();
      return (rows[0] as TModel | undefined) ?? undefined;
    },

    /**
     * Delete one row by id and return it (or undefined if not found)
     */
    async delete(
      id: TModel[keyof TModel] | string | number,
    ): Promise<TModel | undefined> {
      const rows = await db.delete(table).where(eq(pkColumn, id)).returning();
      return (rows[0] as TModel | undefined) ?? undefined;
    },

    /**
     * Delete multiple rows based on a condition
     */
    async deleteWhere(where: SQL): Promise<TModel[]> {
      return (await db.delete(table).where(where).returning()) as TModel[];
    },

    /**
     * Find a row by primary key
     */
    async findById(
      id: TModel[keyof TModel] | string | number,
    ): Promise<TModel | undefined> {
      const rows = await db
        .select()
        .from(table as any)
        .where(eq(pkColumn, id));
      return (rows[0] as TModel | undefined) ?? undefined;
    },

    /**
     * Find multiple rows by a list of IDs
     */
    async findByIds(ids: (string | number)[]): Promise<TModel[]> {
      if (ids.length === 0) return [];
      return (await db
        .select()
        .from(table as any)
        .where(inArray(pkColumn, ids))) as TModel[];
    },

    /**
     * Find many rows with optional filtering, ordering, limit, and offset
     */
    async findMany(params?: {
      where?: SQL;
      orderBy?: SQL | SQL[];
      limit?: number;
      offset?: number;
    }): Promise<TModel[]> {
      let query = db.select().from(table as any);

      if (params?.where) query = query.where(params.where) as any;
      if (params?.orderBy) {
        query = query.orderBy(
          ...(Array.isArray(params.orderBy)
            ? params.orderBy
            : [params.orderBy]),
        ) as any;
      }
      if (params?.limit) query = query.limit(params.limit) as any;
      if (params?.offset) query = query.offset(params.offset) as any;

      return (await query) as TModel[];
    },

    /**
     * Count rows matching an optional condition
     */
    async count(where?: SQL): Promise<number> {
      let query = db
        .select({ value: sql<number>`count(*)` })
        .from(table as any);

      if (where) query = query.where(where) as any;

      const [result] = await query;
      return Number(result?.value ?? 0);
    },

    /**
     * Check existence of rows matching a condition
     */
    async exists(where: SQL): Promise<boolean> {
      const result = await db
        .select({ value: sql<number>`1` })
        .from(table as any)
        .where(where)
        .limit(1);
      return result.length > 0;
    },

    /**
     * Paginate rows with total counts and navigation flags
     */
    async paginate(params?: PaginateParams): Promise<PagedResult<TModel>> {
      const page = Math.max(1, params?.page ?? 1);
      const pageSize = Math.max(1, Math.min(250, params?.pageSize ?? 20));
      const offset = (page - 1) * pageSize;

      const [items, total] = await Promise.all([
        this.findMany({
          where: params?.where,
          orderBy: params?.orderBy,
          limit: pageSize,
          offset,
        }),
        this.count(params?.where),
      ]);

      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return { items, page, pageSize, total, totalPages, hasNext, hasPrev };
    },
  };
}

/**
 * Generic factory to build a repository for a table, with optional extensions.
 * Avoids repeating db/transaction wiring across entity repositories.
 */
export function makeRepo<
  TTable extends AnyPgTable,
  TSchema extends Record<string, unknown>,
  TExtra extends Record<string, any> = {},
>(
  table: TTable,
  extend: (
    base: ReturnType<typeof createRepository<TTable, TSchema>>,
  ) => TExtra,
  options?: { primaryKey?: keyof InferSelectModel<TTable> },
) {
  type BaseRepo = ReturnType<typeof createRepository<TTable, TSchema>>;
  type FullRepo = BaseRepo & TExtra;

  return {
    with(executor: DrizzleExecutor<TSchema>): FullRepo {
      const base = createRepository<TTable, TSchema>(executor, table, options);
      const extra = extend(base);
      return { ...base, ...extra };
    },
  };
}
