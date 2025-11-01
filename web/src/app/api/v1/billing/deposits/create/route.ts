import SizpayProvider from "@/lib/billing/providers/sizpay-provider";
import DrizzlePaymentService from "@/lib/billing/services/payment-service";
import { fetchUsdToIrrRate, fxExpiry, irrToUsd } from "@/lib/fx/rates";
import { Errors } from "@/lib/server/errors";
import { createRoute } from "@/lib/server/handler";
import { authMiddleware } from "@/lib/server/middlewares";
import { ApiResponseBuilder } from "@/lib/server/response";
import { initializeSizPay } from "@/lib/sizpay/client";
import { z } from "zod";

const bodySchema = z.object({
  amount: z.number().min(100000), // IRR amount (Rial) minimum
  currency: z.enum(["IRR", "USD"]).default("IRR"),
  description: z.string().optional(),
});

export const POST = createRoute({
  middleware: [authMiddleware] as const,
  handler: async (req, { session }) => {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return ApiResponseBuilder.error(Errors.badRequest("Invalid JSON"));
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
    return ApiResponseBuilder.success({ paymentId: payment.id, gatewayUrl });
  },
});
