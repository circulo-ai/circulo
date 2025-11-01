import { db } from "@/db";
import { payment } from "@/db/schema";
import {
  ApiResponseBuilder,
  Errors,
  authMiddleware,
  createRoute,
  loggerMiddleware,
  parseQuery,
  rateLimitMiddleware,
} from "@/lib/server";
import { eq } from "drizzle-orm";

export const GET = createRoute({
  middleware: [
    loggerMiddleware,
    rateLimitMiddleware({
      maxRequests: 60,
      windowMs: 60000,
      keyPrefix: "payments-list",
      getIdentifier: (req) => {
        // Will use user ID after auth middleware
        return req.headers.get("x-forwarded-for") || "unknown";
      },
    }),
    authMiddleware,
  ] as const,
  handler: async (req, { session }) => {
    const query = parseQuery(req);
    const limitParam = query.limit;

    // Validate and sanitize limit parameter
    let limit = 20;
    if (limitParam) {
      const parsed = Number(limitParam);
      if (isNaN(parsed) || parsed < 1) {
        throw Errors.badRequest("limit must be a positive number");
      }
      limit = Math.min(Math.max(parsed, 1), 100);
    }

    const rows = await db.query.payment.findMany({
      where: eq(payment.userId, session.user.id),
      orderBy: (p, { desc }) => [desc(p.createdAt)],
      limit,
    });

    const formattedPayments = rows.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      cardNumber: p.cardNumber,
      gatewayUrl: p.gatewayUrl,
    }));

    return ApiResponseBuilder.success(formattedPayments, {
      count: formattedPayments.length,
      limit,
    });
  },
});
