import { getSession } from "@/lib/auth";
import { initializeSizPay } from "@/lib/sizpay/client";
import { PaymentService } from "@/services/payment-service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const verifyPaymentSchema = z.object({
  token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = verifyPaymentSchema.parse(body);

    const sizpayClient = initializeSizPay({
      merchantId: process.env.SIZPAY_MERCHANT_ID!,
      terminalId: process.env.SIZPAY_TERMINAL_ID!,
      username: process.env.SIZPAY_USERNAME!,
      password: process.env.SIZPAY_PASSWORD!,
      signKey: process.env.SIZPAY_SIGN_KEY!,
    });

    const paymentService = new PaymentService(sizpayClient);
    const result = await paymentService.verifyPayment(validated.token);

    return NextResponse.json({
      success: result.success,
      data: result.payment,
      message: result.message,
    });
  } catch (error) {
    console.error("Payment verification error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to verify payment" },
      { status: 500 },
    );
  }
}
