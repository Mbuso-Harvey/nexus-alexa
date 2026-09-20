/** Proves the complete web story through the genuine Nexus graph/BiDi MCP runtime. */
import { resolve } from "node:path";
import { buildSubstrateAsync } from "../src/nexus/build.js";
import { Orchestrator, directToolCaller } from "../src/orchestrator.js";
import { LiveWebPlanBuilder } from "../src/plan.js";

async function main() {
  const nexusRoot = resolve(process.argv[2] ?? "../_research_awg");
  const graph = resolve(process.argv[3] ?? "demo/nexus-graph");
  const baseUrl = process.argv[4] ?? "http://127.0.0.1:7312";
  const built = await buildSubstrateAsync({
    real: ["firefox"],
    nexus: {
      command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      args: ["run", "nexus", "serve", "--graph", graph],
      cwd: nexusRoot,
      baseUrl,
    },
  });
  try {
    const plan = new LiveWebPlanBuilder({ includeWindows: false }).build("set me up for review")!;
    const result = await new Orchestrator(directToolCaller(built.substrate)).run(plan, {
      confirm: async () => true,
      onEvent: (event) => {
        if (event.type === "step:done") console.log(`${event.pass ? "OK" : "XX"} ${event.step.say}`);
        if (event.type === "error") console.log(`ERROR ${event.message}`);
      },
    });
    const pass = result.ok && result.steps.length === 5 && built.closables.length === 1;
    console.log(pass ? "NEXUS WEB RUNTIME PROVEN" : "NEXUS WEB PROOF FAILED");
    process.exitCode = pass ? 0 : 1;
  } finally {
    for (const closable of built.closables) await closable.close().catch(() => undefined);
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
