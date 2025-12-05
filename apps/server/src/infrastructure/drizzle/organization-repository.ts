import { Identifier, type Repository } from "@circulo-ai/core";
import { eq } from "drizzle-orm";
import { organization as organizationTable } from "@/db/schema/auth";
import type { DbInstance } from "@/db";
import { Organization } from "@/domain/organization/organization";

function toDomain(row: typeof organizationTable.$inferSelect): Organization {
  return new Organization({
    id: Identifier.from(row.id),
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? undefined,
  });
}

function toRow(entity: Organization): typeof organizationTable.$inferInsert {
  const snap = entity.snapshot;
  return {
    id: snap.id.toString(),
    name: snap.name,
    createdAt: snap.createdAt,
    updatedAt: snap.updatedAt ?? new Date(),
  };
}

export class DrizzleOrganizationRepository implements Repository<Organization> {
  constructor(private readonly db: DbInstance) {}

  async getById(id: Identifier): Promise<Organization | null> {
    const row = await this.db.query.organization.findFirst({
      where: eq(organizationTable.id, id.toString()),
    });
    return row ? toDomain(row) : null;
  }

  async save(entity: Organization): Promise<Organization> {
    const row = toRow(entity);
    await this.db
      .insert(organizationTable)
      .values(row)
      .onConflictDoUpdate({
        target: organizationTable.id,
        set: {
          name: row.name,
          updatedAt: new Date(),
        },
      });
    return entity;
  }

  async deleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .delete(organizationTable)
      .where(eq(organizationTable.id, id.toString()));
    return "rowCount" in result ? (result as { rowCount: number }).rowCount > 0 : true;
  }
}
