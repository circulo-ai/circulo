import { describe, expect, it } from "vitest";
import { completedStepCost } from "./usage";
describe("multi-step usage accounting", () => {
  it("sums each completed provider request instead of using only the final step", () => {
    expect(
      completedStepCost([
        { providerMetadata: { openrouter: { usage: { cost: 0.1 } } } },
        { providerMetadata: { openrouter: { usage: { cost: 0.2 } } } },
      ]),
    ).toBeCloseTo(0.3);
  });
  it("falls back to total-token estimates if any step lacks authoritative cost", () => {
    expect(
      completedStepCost([
        { providerMetadata: { openrouter: { usage: { cost: 0.1 } } } },
        {},
      ]),
    ).toBeUndefined();
  });
});
