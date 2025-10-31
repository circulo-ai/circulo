import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { invoice, subscription } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const invoices = await db.query.invoice.findMany({
      where: eq(invoice.userId, session.user.id),
      orderBy: (i, { desc }) => [desc(i.createdAt)],
    });

    // Optionally include subscription info
    const subIds = Array.from(new Set(invoices.map((i) => i.subscriptionId).filter(Boolean))) as string[];
    const subs = subIds.length
      ? await db.query.subscription.findMany({ where: (s, { inArray }) => inArray(s.id, subIds) })
      : [];
    const subById = new Map(subs.map((s) => [s.id, s] as const));

    return NextResponse.json(
      invoices.map((i) => ({
        id: i.id,
        number: i.number,
        status: i.status,
        subtotalAmount: Number(i.subtotalAmount),
        subtotalCurrency: i.subtotalCurrency,
        taxAmount: i.taxAmount ? Number(i.taxAmount) : undefined,
        taxCurrency: i.taxCurrency ?? undefined,
        totalAmount: Number(i.totalAmount),
        totalCurrency: i.totalCurrency,
        dueDate: i.dueDate ?? undefined,
        paidAt: i.paidAt ?? undefined,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        subscriptionId: i.subscriptionId ?? undefined,
        subscription: i.subscriptionId ? subById.get(i.subscriptionId) ?? undefined : undefined,
      }))
    );
  } catch (error) {
    console.error("List invoices error:", error);
    return NextResponse.json({ error: "Failed to list invoices" }, { status: 500 });
  }
}