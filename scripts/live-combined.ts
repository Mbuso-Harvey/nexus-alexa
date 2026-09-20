/** Proves one objective across Firefox and Windows through one genuine Nexus MCP process. */
import { resolve } from "node:path";
import { buildSubstrateAsync } from "../src/nexus/build.js";
import { Orchestrator, directToolCaller, type OrchestratorEvent } from "../src/orchestrator.js";
import { LiveWebPlanBuilder } from "../src/plan.js";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

async function main() {
  const nexusRoot = resolve(process.argv[2] ?? "../_research_awg");
  const graph = resolve(process.argv[3] ?? "demo/nexus-graph");
  const baseUrl = process.argv[4] ?? "http://127.0.0.1:7312";
  console.log("[proof] connecting Alexa to one Nexus runtime (Firefox + Windows) ...");
  const built = await buildSubstrateAsync({
    real: ["firefox", "windows"],
    nexus: {
      command,
      args: ["run", "nexus", "serve", "--graph", graph, "--desktop"],
      cwd: nexusRoot,
      baseUrl,
      desktopProcessName: "notepad",
    },
  });

  try {
    const plan = new LiveWebPlanBuilder({ includeWindows: true }).build(
      "set me up for the Acme review",
    )!;
    let confirmSeen = false;
    const result = await new Orchestrator(directToolCaller(built.substrate)).run(plan, {
      confirm: async () => {
        confirmSeen = true;
        return true;
      },
      onEvent: (event: OrchestratorEvent) => {
        if (event.type === "step:done") {
          console.log(`  ${event.pass ? "OK" : "XX"} [${event.step.substrate}] ${event.step.say}`);
        } else if (event.type === "confirm:required") {
          console.log(`  ~~ CONFIRM required: ${event.step.say}`);
        } else if (event.type === "error") {
          console.log(`  !! ${event.message}`);
        }
      },
    });
    const firefox = result.steps.filter((step) => step.step.substrate === "firefox");
    const windows = result.steps.filter((step) => step.step.substrate === "windows");
    const pass =
      built.composite.backingOf("firefox") === "real" &&
      built.composite.backingOf("windows") === "real" &&
      firefox.length === 5 &&
      firefox.every((step) => step.pass) &&
      windows.length === 1 &&
      windows.every((step) => step.pass) &&
      confirmSeen &&
      result.ok;
    console.log(JSON.stringify({
      oneNexusProcess: built.closables.length === 1,
      firefoxSteps: `${firefox.filter((step) => step.pass).length}/${firefox.length}`,
      windowsSteps: `${windows.filter((step) => step.pass).length}/${windows.length}`,
      confirmSeen,
      overall: result.ok,
    }, null, 2));
    console.log(pass ? "NEXUS-ONLY CROSS-SUBSTRATE DEMO PROVEN" : "NEXUS-ONLY PROOF FAILED");
    process.exitCode = pass ? 0 : 1;
  } finally {
    for (const closable of built.closables) await closable.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("[proof]", error);
  process.exit(1);
});
