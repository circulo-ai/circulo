import { BillingManager } from './billing-manager';
import { getProvider } from '.';
import crypto from 'crypto';

export async function handleChangellyWebhook(
  req: Request
): Promise<Response> {
  try {
    const signature = req.headers.get('X-Signature') || '';
    const payload = await req.json();

    const manager = new BillingManager(getProvider('changelly'));
    await manager.processWebhook(payload, signature);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Changelly webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function handleStripeWebhook(req: Request): Promise<Response> {
  try {
    const signature = req.headers.get('stripe-signature') || '';
    const payload = await req.text();

    const manager = new BillingManager(getProvider('stripe'));
    await manager.processWebhook(payload, signature);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
