import { db } from "@/db";
import { invoices } from "@/db/schema/billing";
import { api, notFound, success } from "@/lib/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
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

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { invoiceId } = ctx.params;

    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: "Invalid invoice ID" },
        { status: 400 },
      );
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
