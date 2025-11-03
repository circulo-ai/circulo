import { getSession } from "@/lib/auth";
import { paymentService } from "@/lib/payment/payment";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const token: string | undefined = body?.token;
    if (!token)
      return NextResponse.json({ error: "missing_token" }, { status: 400 });

    // TODO
    const paymentId = ""
    const updated = await paymentService.retry(paymentId);
    console.log("Payment updated:", updated);
  } catch (error) {
    console.error("BDK billing payment verify error:", error);
    return NextResponse.json({ error: "verification_failed" }, { status: 500 });
  }
}
