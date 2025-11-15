import {
  eq,
  InferInsertModel,
  InferSelectModel,
  SQL,
  sql,
  TablesRelationalConfig,
} from "drizzle-orm";
import { AnyPgTable } from "drizzle-orm/pg-core";
import {
  PostgresJsDatabase,
  PostgresJsTransaction,
} from "drizzle-orm/postgres-js";

type DrizzleExecutor<
  TFullSchema extends Record<string, unknown> = Record<string, unknown>,
> =
  | PostgresJsDatabase<TFullSchema>
  | PostgresJsTransaction<TFullSchema, TablesRelationalConfig>;

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
  type PK = keyof TModel;

  /** Cache the primary key name once resolved */
  let cachedPk: PK | undefined = options?.primaryKey as PK | undefined;

  const getPrimaryKey = (): PK => {
    if (cachedPk) return cachedPk;
    const pk = Object.keys(table).find((k) => (table as any)[k]?.primaryKey);
    if (!pk)
      throw new Error(
        "No primary key found for table. Provide options.primaryKey.",
      );
    cachedPk = pk as PK;
    return cachedPk;
  };

  type PaginateParams = {
    page?: number;
    pageSize?: number;
    where?: SQL;
    orderBy?: SQL | SQL[];
  };

  type PagedResult = {
    items: TModel[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };

  return {
    /** Create a single row and return it */
    async create(data: TInsert): Promise<TModel> {
      const rows = await db.insert(table).values(data).returning();
      return rows[0] as TModel;
    },

    /** Create multiple rows and return them */
    async createMany(rows: TInsert[]): Promise<TModel[]> {
      if (!rows.length) return [];
      const inserted = await db.insert(table).values(rows).returning();
      return inserted as TModel[];
    },

    /** Update one row by id and return it (or undefined if not found) */
    async update(
      id: TModel[PK],
      data: Partial<TInsert>,
    ): Promise<TModel | undefined> {
      const pk = getPrimaryKey();
      const rows = await db
        .update(table)
        .set(data)
        .where(eq((table as any)[pk], id))
        .returning();
      return (rows[0] as TModel | undefined) ?? undefined;
    },

    /** Delete one row by id and return it (or undefined if not found) */
    async delete(id: TModel[PK]): Promise<TModel | undefined> {
      const pk = getPrimaryKey();
      const rows = await db
        .delete(table)
        .where(eq((table as any)[pk], id))
        .returning();
      return (rows[0] as TModel | undefined) ?? undefined;
    },

    /** Find a row by primary key */
    async findById(id: TModel[PK]): Promise<TModel | undefined> {
      const pk = getPrimaryKey();
      const rows = await db
        .select()
        .from(table as AnyPgTable)
        .where(eq((table as any)[pk], id));
      return (rows[0] as TModel | undefined) ?? undefined;
    },

    /** Find many rows with optional filtering, ordering, limit, and offset */
    async findMany(params?: {
      where?: SQL;
      orderBy?: SQL | SQL[];
      limit?: number;
      offset?: number;
    }): Promise<TModel[]> {
      const q = db.select().from(table as AnyPgTable);
      if (params?.where) (q as any).where(params.where);
      if (params?.orderBy) (q as any).orderBy(params.orderBy);
      if (params?.limit != null) (q as any).limit(params.limit);
      if (params?.offset != null) (q as any).offset(params.offset);
      const rows = await (q as any);
      return rows as TModel[];
    },

    /** Count rows matching an optional condition */
    async count(where?: SQL): Promise<number> {
      const q = db
        .select({ value: sql<number>`count(*)` })
        .from(table as AnyPgTable);
      if (where) (q as any).where(where);
      const [{ value }] = await (q as any);
      return Number(value ?? 0);
    },

    /** Check existence of rows matching a condition */
    async exists(where: SQL): Promise<boolean> {
      const rows = await db
        .select({ value: sql<number>`1` })
        .from(table as AnyPgTable)
        .where(where)
        .limit(1);
      return rows.length > 0;
    },

    /** Paginate rows with total counts and navigation flags */
    async paginate(params?: PaginateParams): Promise<PagedResult> {
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
  return {
    with(executor: DrizzleExecutor<TSchema>) {
      const base = createRepository<TTable, TSchema>(executor, table, options);
      const extra = extend(base);
      return { ...base, ...extra } as ReturnType<
        typeof createRepository<TTable, TSchema>
      > &
        TExtra;
    },
  };
}
