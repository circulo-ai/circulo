import { handleChangellyWebhook } from '@/lib/billing/webhook-handlers';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  return handleChangellyWebhook(req);
}
