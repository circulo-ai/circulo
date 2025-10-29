import { HeroSection } from "@/components/hero-section";
import { Nav } from "@/components/nav";

export default function Home() {
  return (
    <>
      <Nav />
      <HeroSection />
      <div className="h-screen-fix" />
    </>
  );
}
