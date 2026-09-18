/**
 * Orchestrator + planner tests (hermetic, in-process via directToolCaller).
 *
 * Proves: one objective -> cross-substrate plan -> execution with per-step semantic
 * verification -> CONFIRM pause -> grant/deny -> completed outcome. This is the product
 * thesis, tested end-to-end without any browser/driver.
 */

import { describe, expect, it } from "vitest";
import { FakeNexusSubstrate } from "../src/nexus/substrate.js";
import { ScenarioPlanBuilder } from "../src/plan.js";
import {
  Orchestrator,
  directToolCaller,
  type OrchestratorEvent,
} from "../src/orchestrator.js";

function newRun() {
  const substrate = new FakeNexusSubstrate({ ready: "all" });
  const orch = new Orchestrator(directToolCaller(substrate));
  const planner = new ScenarioPlanBuilder();
  return { substrate, orch, planner };
}

describe("planner", () => {
  it("builds a cross-substrate review-prep plan", () => {
    const plan = new ScenarioPlanBuilder().build("Alexa, get me set up for the Acme review at 3");
    expect(plan).not.toBeNull();
    const subs = [...new Set(plan!.steps.map((s) => s.substrate))];
    expect(subs).toContain("firefox");
    expect(subs).toContain("chrome");
    expect(subs).toContain("windows");
    expect(plan!.steps.some((s) => s.sensitive)).toBe(true);
  });

  it("returns null for an unrecognised objective", () => {
    expect(new ScenarioPlanBuilder().build("what's the weather")).toBeNull();
  });
});

describe("orchestrator", () => {
  it("runs the review plan and PAUSES at the CONFIRM step, denying by default", async () => {
    const { orch, planner } = newRun();
    const plan = planner.build("get me set up for the Acme review")!;
    const result = await orch.run(plan); // default confirm handler denies
    const confirmReq = result.events.find((e) => e.type === "confirm:required");
    expect(confirmReq).toBeTruthy();
    const denied = result.events.find((e) => e.type === "confirm:denied");
    expect(denied).toBeTruthy();
    // The sensitive step fails (denied), so overall not-ok — but the non-sensitive
    // steps executed and verified.
    const sensitiveStep = result.steps.find((s) => s.step.sensitive);
    expect(sensitiveStep?.pass).toBe(false);
    const briefStep = result.steps.find((s) => s.step.capabilityId === "populate_brief");
    expect(briefStep?.pass).toBe(true);
  });

  it("completes fully when CONFIRM is granted, with real verification", async () => {
    const { substrate, orch, planner } = newRun();
    const plan = planner.build("get me set up for the Acme review")!;
    const result = await orch.run(plan, { confirm: async () => true });
    expect(result.ok).toBe(true);
    const granted = result.events.find((e) => e.type === "confirm:granted");
    expect(granted).toBeTruthy();
    // Prove the billing state actually changed in the world.
    const billing = await substrate.read("firefox", "billing.alerts");
    expect(billing?.state?.value).toBe("on");
    // Prove the desktop brief was populated + verified.
    const notes = await substrate.read("windows", "notes.body");
    expect(String(notes?.state?.value)).toContain("Acme review brief");
  });

  it("emits verification events proving observed==expected (not assumed success)", async () => {
    const { orch, planner } = newRun();
    const plan = planner.build("set the theme to dark and enable billing alerts")!;
    const verifiedEvents: OrchestratorEvent[] = [];
    await orch.run(plan, {
      confirm: async () => true,
      onEvent: (e) => {
        if (e.type === "step:verified") verifiedEvents.push(e);
      },
    });
    const themeVerify = verifiedEvents.find(
      (e) => e.type === "step:verified" && e.step.capabilityId === "set_theme",
    );
    expect(themeVerify).toBeTruthy();
    if (themeVerify && themeVerify.type === "step:verified") {
      expect(themeVerify.verification.pass).toBe(true);
      expect(String(themeVerify.verification.observed?.value)).toBe("dark");
    }
  });
});
