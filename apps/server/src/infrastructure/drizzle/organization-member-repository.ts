import { Identifier, type Repository } from "@circulo-ai/core";
import { eq, and } from "drizzle-orm";
import { member as memberTable } from "@/db/schema/auth";
import type { DbInstance } from "@/db";
import { OrganizationMember } from "@/domain/organization/member";

function toDomain(row: typeof memberTable.$inferSelect): OrganizationMember {
  return new OrganizationMember({
    id: Identifier.from(row.id),
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role,
    createdAt: row.createdAt,
  });
}

function toRow(entity: OrganizationMember): typeof memberTable.$inferInsert {
  const snap = entity.snapshot;
  return {
    id: snap.id.toString(),
    organizationId: snap.organizationId,
    userId: snap.userId,
    role: snap.role,
    createdAt: snap.createdAt,
  };
}

export class DrizzleOrganizationMemberRepository implements Repository<OrganizationMember> {
  constructor(private readonly db: DbInstance) {}

  async getById(id: Identifier): Promise<OrganizationMember | null> {
    const row = await this.db.query.member.findFirst({
      where: eq(memberTable.id, id.toString()),
    });
    return row ? toDomain(row) : null;
  }

  async save(entity: OrganizationMember): Promise<OrganizationMember> {
    const row = toRow(entity);
    await this.db
      .insert(memberTable)
      .values(row)
      .onConflictDoUpdate({
        target: memberTable.id,
        set: { role: row.role },
      });
    return entity;
  }

  async deleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .delete(memberTable)
      .where(eq(memberTable.id, id.toString()));
    return "rowCount" in result
      ? (result as { rowCount: number }).rowCount > 0
      : true;
  }

  async findByUserAndOrg(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMember | null> {
    const row = await this.db.query.member.findFirst({
      where: and(
        eq(memberTable.userId, userId),
        eq(memberTable.organizationId, organizationId),
      ),
    });
    return row ? toDomain(row) : null;
  }
}
