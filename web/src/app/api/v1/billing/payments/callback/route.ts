import { db } from "@/db";
import { invoice, payment, subscription, wallet, transaction } from "@/db/schema";
import { initializeSizPay } from "@/lib/sizpay/client";
import SizpayProvider from "@/lib/billing/providers/sizpay-provider";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { irrToUsd, fetchUsdToIrrRate } from "@/lib/fx/rates";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const token = searchParams.get("token");
  const status = searchParams.get("status");

  if (!token) {
    return NextResponse.redirect(new URL("/billing?payment=error&message=missing_token", req.url));
  }

  if (status === "NOK") {
    // Mark payment as cancelled if present
    const existing = await db.query.payment.findFirst({ where: eq(payment.providerToken, token) });
    if (existing) {
      await db.update(payment).set({ status: "cancelled", updatedAt: new Date() }).where(eq(payment.id, existing.id));
    }
    return NextResponse.redirect(new URL("/billing?payment=cancelled", req.url));
  }

  try {
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
      const existing = await db.query.payment.findFirst({ where: eq(payment.providerToken, token) });
      if (existing) {
        await db.update(payment).set({ status: "failed", errorMessage: String(captured.raw?.message || "capture_failed"), updatedAt: new Date() }).where(eq(payment.id, existing.id));
      }
      return NextResponse.redirect(new URL("/billing?payment=failed", req.url));
    }

    const pay = await db.query.payment.findFirst({ where: eq(payment.providerToken, token) });
    if (!pay) {
      // No matching payment record — treat as soft error
      return NextResponse.redirect(new URL("/billing?payment=error&message=payment_not_found", req.url));
    }

    // Idempotency guard: if already processed, return appropriate redirect
    if (pay.status !== "awaiting_payment") {
      if (pay.status === "completed") {
        const meta = pay.metadata ? JSON.parse(pay.metadata) : {};
        const invoiceId = meta.invoiceId as string | undefined;
        return NextResponse.redirect(new URL(`/billing?payment=success${invoiceId ? `&invoice=${invoiceId}` : ""}`, req.url));
      }
      if (pay.status === "cancelled") {
        return NextResponse.redirect(new URL("/billing?payment=cancelled", req.url));
      }
      if (pay.status === "failed") {
        return NextResponse.redirect(new URL("/billing?payment=failed", req.url));
      }
      // For any other terminal state, treat as generic error
      return NextResponse.redirect(new URL("/billing?payment=error&message=already_processed", req.url));
    }

    const now = new Date();
    const meta = pay.metadata ? JSON.parse(pay.metadata) : {};
    const invoiceId = meta.invoiceId as string | undefined;
    const subscriptionId = meta.subscriptionId as string | undefined;

    // Wrap payment + invoice/subscription updates in a transaction for atomicity
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

      if (invoiceId) {
        await tx.update(invoice).set({ status: "paid", paidAt: now, updatedAt: now }).where(eq(invoice.id, invoiceId));
      }
      if (subscriptionId) {
        await tx.update(subscription).set({ status: "active", updatedAt: now }).where(eq(subscription.id, subscriptionId));
      }
    });

    // Wallet deposit crediting
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
          // Lock wallet row to prevent concurrent balance updates
          await tx.execute(sql`select id from "wallet" where id = ${pay.walletId} for update`);
          const w = await tx.query.wallet.findFirst({ where: eq(wallet.id, pay.walletId) });
          if (w) {
            const before = Number(w.balance);
            const after = Number((before + usdCredit).toFixed(2));
            const txId = captured.raw?.refNo ?? captured.raw?.traceNo ?? pay.id; // use provider ref/trace if available
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

        return NextResponse.redirect(new URL(`/billing?payment=success&amount=${usdCredit.toFixed(2)}`, req.url));
      } catch (e) {
        console.error("Wallet deposit crediting error:", e);
        // Even if wallet crediting fails, do not block user redirect; mark as error for manual review
        return NextResponse.redirect(new URL("/billing?payment=error&message=wallet_credit_failed", req.url));
      }
    }

    return NextResponse.redirect(new URL(`/billing?payment=success${invoiceId ? `&invoice=${invoiceId}` : ""}`, req.url));
  } catch (error) {
    console.error("BDK billing payment callback error:", error);
    return NextResponse.redirect(new URL("/billing?payment=error&message=verification_failed", req.url));
  }
}