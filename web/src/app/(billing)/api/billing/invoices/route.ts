import { db } from "@/db";
import { invoices } from "@/db/schema/billing";
import { api, success } from "@/lib/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = api(
  {
    auth: true,
    query: z.object({
      limit: z.int().optional().default(50),
      offset: z.int().optional().default(0),
    }),
  },
  async (req, ctx) => {
    const userId = ctx.user.id;
    const searchParams = ctx.query;
    const limit = Math.min(searchParams.limit, 100);
    const offset = searchParams.offset;

    const userInvoices = await db.query.invoices.findMany({
      where: eq(invoices.userId, userId),
      orderBy: [desc(invoices.createdAt)],
      limit,
      offset,
      with: {
        lineItems: true,
      },
    });

    return success({ invoices: userInvoices });
  },
);
