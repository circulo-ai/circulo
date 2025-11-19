import { db } from "@/db";
import { invoices } from "@/db/schema/billing";
import { api, notFound, success } from "@/lib/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = api(
  {
    auth: true,
    params: z.object({
      invoiceId: z.coerce.number(),
    }),
  },
  async (req, ctx) => {
    const userId = ctx.user.id;
    const { invoiceId } = ctx.params;

    if (isNaN(invoiceId)) {
      return notFound();
    }

    const invoice = await db.query.invoices.findFirst({
      where: and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)),
      with: {
        lineItems: true,
      },
    });

    if (!invoice) {
      return notFound();
    }

    return success({ invoice });
  },
);
