import { FaqSection } from "@/components/faq-section";
import { FooterSection } from "@/components/footer-section";
import { HeroSection } from "@/components/hero-section";
import { Nav } from "@/components/nav";
import { PricingSection } from "@/components/pricing-section";

export default function Home() {
  return (
    <>
      <Nav />
      <HeroSection />
      <PricingSection />
      <FaqSection />
      <FooterSection />
    </>
  );
}
