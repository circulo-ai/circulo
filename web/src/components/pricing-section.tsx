import { getSubscriptionPlans } from "@/app/(billing)/actions/get-plans";

export async function PricingSection() {
  const plans = await getSubscriptionPlans();

  return <section id="pricing" className="main-section">
    {JSON.stringify(plans)}
  </section>;
}
