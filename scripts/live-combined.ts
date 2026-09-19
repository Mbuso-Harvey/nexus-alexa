/**
 * Combined live proof: ONE objective crossing REAL Firefox -> REAL Windows, executed and verified
 * entirely through Nexus, orchestrated over the same path the Alexa client uses.
 *
 * It builds the composite substrate with firefox=real (vendored Nexus BiDi) and windows=real
 * (vendored Nexus UIA), then runs the LiveWebPlanBuilder's cross-substrate plan through the
 * Orchestrator with the CONFIRM gate granted. Every step is verified from real substrate state.
 *
 * Run:  npx tsx scripts/live-combined.ts [webAppUrl]
 * Preconditions: geckodriver on 4444 (fresh), demo app up, classic Notepad available.
 */

import { buildSubstrateAsync } from "../src/nexus/build.js";
import { LiveWebPlanBuilder } from "../src/plan.js";
import { Orchestrator, directToolCaller, type OrchestratorEvent } from "../src/orchestrator.js";

async function main() {
  const baseUrl = process.argv[2] ?? "http://127.0.0.1:7311";
  console.log("[combined] building composite: firefox=real, windows=real ...");
  const built = await buildSubstrateAsync({ webApp: { baseUrl }, desktop: {} });

  const backing = {
    firefox: built.composite.backingOf("firefox"),
    windows: built.composite.backingOf("windows"),
  };
  console.log("[combined] backing:", JSON.stringify(backing));

  const plan = new LiveWebPlanBuilder().build("set me up for the Acme review")!;
  const orch = new Orchestrator(directToolCaller(built.substrate));

  let confirmSeen = false;
  const result = await orch.run(plan, {
    confirm: async () => {
      confirmSeen = true;
      return true;
    },
    onEvent: (e: OrchestratorEvent) => {
      if (e.type === "step:done") {
        console.log(`  ${e.pass ? "OK" : "XX"} [${e.step.substrate}] ${e.step.say}`);
      } else if (e.type === "confirm:required") {
        console.log(`  ~~ CONFIRM required: ${e.step.say}`);
      }
    },
  });

  const windowsStep = result.steps.find((s) => s.step.substrate === "windows");
  const firefoxSteps = result.steps.filter((s) => s.step.substrate === "firefox");

  console.log("\n[combined] summary:");
  console.log("  backing firefox=real:", backing.firefox === "real");
  console.log("  backing windows=real:", backing.windows === "real");
  console.log("  firefox steps passed:", firefoxSteps.every((s) => s.pass), `(${firefoxSteps.length})`);
  console.log("  windows step passed:", windowsStep?.pass);
  console.log("  CONFIRM beat exercised:", confirmSeen);
  console.log("  overall ok:", result.ok);

  const pass =
    backing.firefox === "real" &&
    backing.windows === "real" &&
    result.ok &&
    confirmSeen &&
    Boolean(windowsStep?.pass);

  console.log(pass ? "\nFIREFOX -> WINDOWS CROSS-SUBSTRATE LIVE DEMO PROVEN" : "\nSOME CHECKS FAILED");

  for (const c of built.closables) await c.close().catch(() => undefined);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[combined] error:", err);
  process.exit(1);
});
