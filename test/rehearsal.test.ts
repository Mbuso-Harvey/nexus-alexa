/**
 * Reliability gate: the recommended demo must complete cleanly across repeated runs with a
 * deterministic reset between runs. Reliability is part of the product — one lucky run is
 * not "ready".
 */

import { describe, expect, it } from "vitest";
import { rehearse } from "../src/rehearse.js";

describe("demo rehearsal", () => {
  it("passes >= 5 consecutive clean runs of the review-prep demo", async () => {
    const report = await rehearse({ runs: 5, required: 5 });
    expect(report.cleanRuns).toBe(5);
    expect(report.ready).toBe(true);
    // Every run must exercise the CONFIRM beat and pass all steps.
    for (const r of report.runs) {
      expect(r.ok).toBe(true);
      expect(r.confirmSeen).toBe(true);
      expect(r.stepsPassed).toBe(r.stepsTotal);
    }
  });
});
