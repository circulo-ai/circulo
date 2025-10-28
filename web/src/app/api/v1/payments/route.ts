import { getSession } from "@/lib/auth";
import { initializeSizPay } from "@/lib/sizpay/client";
import { PaymentService } from "@/services/payment-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10");

    const sizpayClient = initializeSizPay({
      merchantId: process.env.SIZPAY_MERCHANT_ID!,
      terminalId: process.env.SIZPAY_TERMINAL_ID!,
      username: process.env.SIZPAY_USERNAME!,
      password: process.env.SIZPAY_PASSWORD!,
      signKey: process.env.SIZPAY_SIGN_KEY!,
    });

    const paymentService = new PaymentService(sizpayClient);
    const payments = await paymentService.getUserPayments(
      session.user.id,
      limit,
    );

    return NextResponse.json({
      success: true,
      data: payments,
    });
  } catch (error) {
    console.error("List payments error:", error);
    return NextResponse.json(
      { error: "Failed to list payments" },
      { status: 500 },
    );
  }
}
