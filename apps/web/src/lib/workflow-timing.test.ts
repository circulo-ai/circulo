import { expect, it } from "vitest";
import {
  formatWorkflowDuration,
  projectWorkflowTiming,
} from "./workflow-timing";

it("formats long durations and rejects invalid/negative values", () => {
  expect(formatWorkflowDuration(68262100)).toBe("18h 57m");
  expect(formatWorkflowDuration(61000)).toBe("1m 1s");
  expect(formatWorkflowDuration(1500)).toBe("1.5 s");
  expect(formatWorkflowDuration(NaN)).toBe("0 ms");
  expect(formatWorkflowDuration(-10)).toBe("0 ms");
});
it("freezes processing during an approval wait and does not depend on server clock skew", () => {
  const sample = {
    activeTimeMs: 3000,
    idleTimeMs: 10000,
    elapsedTimeMs: 13000,
    sampledAtMs: 9999999999,
    isActive: false,
  };
  expect(projectWorkflowTiming(sample, 8000, 5000, false)).toMatchObject({
    activeTimeMs: 3000,
    idleTimeMs: 13000,
    elapsedTimeMs: 16000,
  });
  expect(
    projectWorkflowTiming({ ...sample, isActive: true }, 8000, 5000, false)
      .activeTimeMs,
  ).toBe(6000);
  expect(projectWorkflowTiming(sample, 8000, 5000, true)).toEqual(sample);
  expect(projectWorkflowTiming(sample, 4000, 5000, false)).toEqual(sample);
});
