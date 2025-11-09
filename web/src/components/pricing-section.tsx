import { getSubscriptionPlans } from "@/actions/subscription/get-plans";

export async function PricingSection() {
  const plans = await getSubscriptionPlans();

  return <section id="pricing" className="main-section">
    {JSON.stringify(plans)}
  </section>;
}
