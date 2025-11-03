import { db, payment } from "@/db";
import { authMiddleware } from "@/lib/server";
import { Errors } from "@/lib/server/errors";
import { createRoute } from "@/lib/server/handler";
import { getParam } from "@/lib/server/request-helpers";
import { ApiResponseBuilder } from "@/lib/server/response";
import { and, eq } from "drizzle-orm";

export const GET = createRoute({
  middleware: [authMiddleware] as const,
  handler: async (req, context) => {
    const session = context.session;
    const id = getParam(context, "id");
    const p = await db.query.payment.findFirst({
      where: and(eq(payment.id, id), eq(payment.userId, session.user.id)),
    });
    if (!p) return ApiResponseBuilder.error(Errors.notFound());

    return ApiResponseBuilder.success({
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      cardNumber: p.cardNumber,
      gatewayUrl: p.gatewayUrl,
      providerTransactionId: p.providerTransactionId,
    });
  },
});
