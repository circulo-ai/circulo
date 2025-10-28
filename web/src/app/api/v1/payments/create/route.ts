import { getSession } from "@/lib/auth";
import { initializeSizPay } from "@/lib/sizpay/client";
import { PaymentService } from "@/services/payment-service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createPaymentSchema = z.object({
  amount: z.number().positive().min(10000), // Minimum 10,000 Tomans
  metadata: z.record(z.string(), z.any()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await req.json();
    const validated = createPaymentSchema.parse(body);

    // Initialize SizPay client
    const sizpayClient = initializeSizPay({
      merchantId: process.env.SIZPAY_MERCHANT_ID!,
      terminalId: process.env.SIZPAY_TERMINAL_ID!,
      username: process.env.SIZPAY_USERNAME!,
      password: process.env.SIZPAY_PASSWORD!,
      signKey: process.env.SIZPAY_SIGN_KEY!,
    });

    // Create payment
    const paymentService = new PaymentService(sizpayClient);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const result = await paymentService.createPayment({
      userId: session.user.id,
      amount: validated.amount,
      callbackUrl: `${baseUrl}/api/payments/callback`,
      metadata: validated.metadata,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Payment creation error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 },
    );
  }
}
