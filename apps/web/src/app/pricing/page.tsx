import { FooterSection } from "@/components/footer-section";
import { Nav } from "@/components/nav";
import { PricingSection } from "@/components/pricing-section";

// The marketing nav resolves the current Better Auth session. Keep this page
// request-time rendered so a production build never blocks on a local DB.
export const dynamic = "force-dynamic";

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen pt-16">
        <PricingSection />
      </main>
      <FooterSection />
    </>
  );
}
