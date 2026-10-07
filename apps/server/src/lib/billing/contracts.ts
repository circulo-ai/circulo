export type EntitlementValue = number | "unlimited" | boolean;

export type Entitlements = {
  planId: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "local";
  features: Record<string, EntitlementValue>;
};

export interface EntitlementProvider {
  getEntitlements(organizationId: string): Promise<Entitlements>;
  canUse(
    organizationId: string,
    feature: string,
    current?: number,
  ): Promise<boolean>;
}

export interface UsageMeter {
  record(event: {
    organizationId: string;
    userId?: string | null;
    requestId: string;
    feature: string;
    quantity: number;
    idempotencyKey: string;
  }): Promise<void>;
}

export interface BillingProvider {
  syncCustomer(organizationId: string): Promise<void>;
  createCheckoutUrl(organizationId: string, planId: string): Promise<string>;
  createPortalUrl(organizationId: string): Promise<string>;
}

export interface PlanCatalog {
  list(): readonly {
    id: string;
    name: string;
    monthlyPrice: number | null;
  }[];
}
