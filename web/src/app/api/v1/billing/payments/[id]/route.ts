import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payment } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = params.id;
  const p = await db.query.payment.findFirst({ where: and(eq(payment.id, id), eq(payment.userId, session.user.id)) });
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    id: p.id,
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
    cardNumber: p.cardNumber,
    gatewayUrl: p.gatewayUrl,
    providerTransactionId: p.providerTransactionId,
  });
}