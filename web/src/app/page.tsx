import { HeroSection } from "@/components/hero-section";
import { Nav } from "@/components/nav";
import { PricingSection } from "@/components/pricing-section";

export default function Home() {
  return (
    <>
      <Nav />
      <HeroSection />
      <PricingSection />
    </>
  );
}
