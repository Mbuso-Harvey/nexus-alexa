/**
 * Demo rehearsal harness — treat reliability as part of the product.
 *
 * Runs the recommended demo objective end-to-end N times with a FRESH substrate world each
 * run (deterministic reset between runs), asserting every run completes with all steps
 * passing. Reports per-run timing and a pass/fail summary. The demo is not "ready" on one
 * lucky execution — the default threshold is 5 consecutive clean runs.
 *
 * Used by both the CLI (`nexus-alexa rehearse`) and a vitest reliability test.
 */

import { FakeNexusSubstrate } from "./nexus/substrate.js";
import { ScenarioPlanBuilder } from "./plan.js";
import { Orchestrator, directToolCaller } from "./orchestrator.js";

export interface RehearsalRun {
  index: number;
  ok: boolean;
  ms: number;
  stepsPassed: number;
  stepsTotal: number;
  confirmSeen: boolean;
}

export interface RehearsalReport {
  objective: string;
  runs: RehearsalRun[];
  cleanRuns: number;
  required: number;
  ready: boolean;
}

export async function rehearse(opts?: {
  objective?: string;
  runs?: number;
  required?: number;
}): Promise<RehearsalReport> {
  const objective = opts?.objective ?? "Alexa, get me set up for the Acme review at 3";
  const total = opts?.runs ?? 5;
  const required = opts?.required ?? 5;
  const planner = new ScenarioPlanBuilder();

  const runs: RehearsalRun[] = [];
  for (let i = 0; i < total; i++) {
    // Fresh world each run == deterministic reset between runs.
    const substrate = new FakeNexusSubstrate({ ready: "all" });
    const orch = new Orchestrator(directToolCaller(substrate));
    const plan = planner.build(objective)!;
    let confirmSeen = false;
    const t0 = Date.now();
    const result = await orch.run(plan, {
      confirm: async () => {
        confirmSeen = true;
        return true;
      },
    });
    const ms = Date.now() - t0;
    runs.push({
      index: i + 1,
      ok: result.ok,
      ms,
      stepsPassed: result.steps.filter((s) => s.pass).length,
      stepsTotal: result.steps.length,
      confirmSeen,
    });
  }

  const cleanRuns = runs.filter((r) => r.ok).length;
  return { objective, runs, cleanRuns, required, ready: cleanRuns >= required };
}
