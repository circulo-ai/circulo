import { generateRandomPath, Step } from "@/lib/border-walk";
import { PricingBackground } from "./pricing-background";

const starts: Step[] = [
  { x: 2, y: 0, border: "bottom", direction: "forward" },
  { x: 4, y: 11, border: "bottom", direction: "backward" },
  { x: 0, y: 6, border: "right", direction: "backward" },
  { x: 7, y: 4, border: "right", direction: "forward" },
];

const paths = starts.map((start, index) =>
  generateRandomPath({
    rows: 8,
    cols: 12,
    start,
    maxSteps: 128,
    seed: index + 3,
    avoidPerimeter: true,
    forwardBias: 0.75,
  }),
);

export function PricingSection() {
  return (
    <section id="pricing" className="main-section relative">
      <PricingBackground paths={paths} />
    </section>
  );
}
