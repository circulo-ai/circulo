import { getActiveOrganizationId, getSession } from "@/lib/auth";
import { autumnHandler } from "autumn-js/next";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const session = await getSession();

    return {
      customerId: await getActiveOrganizationId(),
      customerData: {
        userId: session?.user.id,
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
});
