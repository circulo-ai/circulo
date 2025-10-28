import { initializeSizPay } from "@/lib/sizpay/client";
import { PaymentService } from "@/services/payment-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const token = searchParams.get("token");
  const status = searchParams.get("status");

  if (!token) {
    return NextResponse.redirect(
      new URL("/wallet?payment=error&message=missing_token", req.url),
    );
  }

  // If payment was cancelled by user
  if (status === "NOK") {
    return NextResponse.redirect(new URL("/wallet?payment=cancelled", req.url));
  }

  try {
    // Initialize services
    const sizpayClient = initializeSizPay({
      merchantId: process.env.SIZPAY_MERCHANT_ID!,
      terminalId: process.env.SIZPAY_TERMINAL_ID!,
      username: process.env.SIZPAY_USERNAME!,
      password: process.env.SIZPAY_PASSWORD!,
      signKey: process.env.SIZPAY_SIGN_KEY!,
    });

    const paymentService = new PaymentService(sizpayClient);

    // Verify payment
    const result = await paymentService.verifyPayment(token);

    if (result.success) {
      return NextResponse.redirect(
        new URL(
          `/wallet?payment=success&amount=${result.payment.amount}`,
          req.url,
        ),
      );
    } else {
      return NextResponse.redirect(
        new URL(
          `/wallet?payment=failed&message=${encodeURIComponent(result.message || "Payment verification failed")}`,
          req.url,
        ),
      );
    }
  } catch (error) {
    console.error("Payment callback error:", error);
    return NextResponse.redirect(
      new URL("/wallet?payment=error&message=verification_failed", req.url),
    );
  }
}
