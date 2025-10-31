import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { initializeSizPay } from "@/lib/sizpay/client";
import SizpayProvider from "@/lib/billing/providers/sizpay-provider";
import DrizzlePaymentService from "@/lib/billing/services/payment-service";
import { fetchUsdToIrrRate, irrToUsd, fxExpiry } from "@/lib/fx/rates";

const bodySchema = z.object({
  amount: z.number().min(100000), // IRR amount (Rial) minimum
  currency: z.enum(["IRR", "USD"]).default("IRR"),
  description: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
    }
    const { amount, currency, description } = parsed.data;

    // Fetch USD→IRR rate and pre-compute USD credit at init
    const { rate, source } = await fetchUsdToIrrRate();
    // We charge in IRR via SizPay; USD credit is derived for wallet
    const irrAmount = currency === "IRR" ? amount : Math.round(amount * rate);
    const usdCreditAtInit = irrToUsd(irrAmount, rate);
    const expiresAt = fxExpiry(30);

    const sizpayClient = initializeSizPay({
      merchantId: process.env.SIZPAY_MERCHANT_ID!,
      terminalId: process.env.SIZPAY_TERMINAL_ID!,
      username: process.env.SIZPAY_USERNAME!,
      password: process.env.SIZPAY_PASSWORD!,
      signKey: process.env.SIZPAY_SIGN_KEY!,
    });
    const provider = new SizpayProvider(sizpayClient);
    const paymentService = new DrizzlePaymentService(provider);

    const payment = await paymentService.process(
      session.user.id,
      { amount: irrAmount, currency: "IRR" },
      "sizpay_redirect",
      {
        description: description ?? "Wallet deposit",
        captureMethod: "automatic",
        metadata: {
          source: "wallet_deposit",
          callbackUrl: "/api/v1/billing/payments/callback",
          fx: {
            rate,
            source,
            fetchedAt: new Date().toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
          usdCreditAtInit,
          irrAmount,
        },
      },
    );

    const gatewayUrl = String(payment.metadata?.gatewayUrl || "");
    return NextResponse.json({ paymentId: payment.id, gatewayUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}