import {
  type CustomerFeature,
  type CustomerProduct,
  Autumn,
  ProductStatus,
} from "autumn-js";

// Initialize the Autumn client with your secret key
const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY!,
});

export type SubscriptionInfo = {
  plan: string | null;
  status: ProductStatus | null;
  products: CustomerProduct[];
  features: Record<string, CustomerFeature>;
};

/**
 * Get subscription information for an organization
 * Since we're using customerScope: "organization" in our Autumn config,
 * the customer_id should be the organization ID
 */
export async function getSubscriptionForOrg(
  organizationId: string,
): Promise<SubscriptionInfo | null> {
  try {
    const getCustomer = await autumn.customers.get(organizationId);
    const customer = getCustomer.data;

    if (!customer) {
      return null;
    }

    // Extract the active product (plan)
    const activeProduct = customer.products?.find((p) => p.status === "active");

    return {
      plan: activeProduct?.id ?? null, // e.g., "free", "pro", "team"
      status: activeProduct?.status ?? null,
      products: customer.products ?? [],
      features: customer.features,
    };
  } catch (error) {
    console.error("Failed to get subscription for org:", organizationId, error);
    return null;
  }
}

/**
 * Check if an organization has a specific plan or higher
 */
export async function orgHasPlan(
  organizationId: string,
  requiredPlans: string[],
): Promise<boolean> {
  const subscription = await getSubscriptionForOrg(organizationId);
  if (!subscription || !subscription.plan) return false;
  return requiredPlans.includes(subscription.plan);
}

/**
 * Check if organization can create team organizations
 * (requires pro plan or higher on their personal org)
 */
export async function canCreateTeamOrg(
  personalOrgId: string,
): Promise<boolean> {
  return orgHasPlan(personalOrgId, ["pro", "team", "enterprise"]);
}
