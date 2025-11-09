import { NextRequest, NextResponse } from "next/server";
import { handleChangellyWebhook } from "@/lib/billing/webhook-handlers";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    return await handleChangellyWebhook(req as unknown as Request);
  } catch (error) {
    console.error('Changelly webhook route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}