import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payment, wallet, transaction } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { initializeSizPay } from "@/lib/sizpay/client";
import SizpayProvider from "@/lib/billing/providers/sizpay-provider";
import { irrToUsd, fetchUsdToIrrRate } from "@/lib/fx/rates";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const token: string | undefined = body?.token;
    if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

    const sizpayClient = initializeSizPay({
      merchantId: process.env.SIZPAY_MERCHANT_ID!,
      terminalId: process.env.SIZPAY_TERMINAL_ID!,
      username: process.env.SIZPAY_USERNAME!,
      password: process.env.SIZPAY_PASSWORD!,
      signKey: process.env.SIZPAY_SIGN_KEY!,
    });
    const provider = new SizpayProvider(sizpayClient);

    const captured = await provider.capturePayment(token);
    if (!captured.success) {
      // Mark as failed if payment exists
      const existing = await db.query.payment.findFirst({ where: eq(payment.providerToken, token) });
      if (existing) {
        await db
          .update(payment)
          .set({ status: "failed", errorMessage: String(captured.raw?.message || "capture_failed"), updatedAt: new Date() })
          .where(eq(payment.id, existing.id));
      }
      return NextResponse.json({ error: "verification_failed", details: captured.raw }, { status: 400 });
    }

    const pay = await db.query.payment.findFirst({ where: eq(payment.providerToken, token) });
    if (!pay) return NextResponse.json({ error: "payment_not_found" }, { status: 404 });
    if (pay.userId !== session.user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    // Idempotency: if already processed, return current payment snapshot
    if (pay.status !== "awaiting_payment") {
      return NextResponse.json({
        id: pay.id,
        amount: Number(pay.amount),
        currency: pay.currency,
        status: pay.status,
        provider: pay.provider,
        createdAt: pay.createdAt,
        paidAt: pay.paidAt,
        cardNumber: pay.cardNumber,
        gatewayUrl: pay.gatewayUrl,
        providerTransactionId: pay.providerTransactionId,
      });
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(payment)
        .set({
          status: "completed",
          providerTransactionId: String(captured.providerTransactionId || token),
          paidAt: now,
          updatedAt: now,
          cardNumber: captured.raw?.cardNumber || pay.cardNumber,
          providerRefNo: captured.raw?.refNo || pay.providerRefNo,
          providerTraceNo: captured.raw?.traceNo || pay.providerTraceNo,
          metadata: JSON.stringify({ ...(pay.metadata ? JSON.parse(pay.metadata) : {}), confirm: captured.raw }),
        })
        .where(and(eq(payment.id, pay.id), eq(payment.status, "awaiting_payment")));
    });

    // Wallet deposit crediting if applicable (USD wallet balance updated; FX TTL respected)
    const meta = pay.metadata ? JSON.parse(pay.metadata) : {};
    if (meta.source === "wallet_deposit") {
      try {
        const irrAmount: number | undefined = meta.irrAmount;
        const fx = meta.fx as { rate: number; expiresAt?: string } | undefined;
        const usdInit: number | undefined = meta.usdCreditAtInit;
        let usdCredit = 0;
        if (irrAmount && fx?.rate && fx?.expiresAt && new Date() <= new Date(fx.expiresAt) && typeof usdInit === "number") {
          usdCredit = usdInit;
        } else if (irrAmount) {
          const { rate } = await fetchUsdToIrrRate();
          usdCredit = irrToUsd(irrAmount, rate);
        }
        usdCredit = Number(usdCredit.toFixed(2));

        await db.transaction(async (tx) => {
          await tx.execute(sql`select id from "wallet" where id = ${pay.walletId} for update`);
          const w = await tx.query.wallet.findFirst({ where: eq(wallet.id, pay.walletId) });
          if (w) {
            const before = Number(w.balance);
            const after = Number((before + usdCredit).toFixed(2));
            const txId = captured.raw?.refNo ?? captured.raw?.traceNo ?? pay.id;
            const inserted = await tx
              .insert(transaction)
              .values({
                id: txId,
                userId: pay.userId,
                walletId: w.id,
                type: "deposit",
                status: "completed",
                amount: usdCredit.toFixed(4),
                balanceBefore: before.toFixed(2),
                balanceAfter: after.toFixed(2),
                description: "Wallet deposit via SizPay",
                metadata: { paymentId: pay.id, irrAmount, fx },
                createdAt: now,
              })
              .onConflictDoNothing()
              .returning();

            if (inserted.length > 0) {
              await tx.update(wallet).set({ balance: after.toFixed(2), updatedAt: now }).where(eq(wallet.id, w.id));
              await tx.update(payment).set({ transactionId: inserted[0]?.id, updatedAt: now }).where(eq(payment.id, pay.id));
            }
          }
        });
      } catch (e) {
        console.error("Wallet deposit crediting error (verify):", e);
        // Do not fail verification response; return payment snapshot with error marker
      }
    }

    const updated = await db.query.payment.findFirst({ where: eq(payment.id, pay.id) });
    return NextResponse.json({
      id: updated!.id,
      amount: Number(updated!.amount),
      currency: updated!.currency,
      status: updated!.status,
      provider: updated!.provider,
      createdAt: updated!.createdAt,
      paidAt: updated!.paidAt,
      cardNumber: updated!.cardNumber,
      gatewayUrl: updated!.gatewayUrl,
      providerTransactionId: updated!.providerTransactionId,
    });
  } catch (error) {
    console.error("BDK billing payment verify error:", error);
    return NextResponse.json({ error: "verification_failed" }, { status: 500 });
  }
}