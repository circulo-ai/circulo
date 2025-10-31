import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 100) : 20;
  const rows = await db.query.payment.findMany({
    where: eq(payment.userId, session.user.id),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    limit,
  });

  return NextResponse.json(
    rows.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      cardNumber: p.cardNumber,
      gatewayUrl: p.gatewayUrl,
    })),
  );
}