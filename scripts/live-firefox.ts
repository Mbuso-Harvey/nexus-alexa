/** Focused Nexus-owned web action: graph read -> graph invoke -> live verification. */
import { resolve } from "node:path";
import { buildSubstrateAsync } from "../src/nexus/build.js";

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
    const before = await built.substrate.read("firefox", "settings.theme");
    const invoke = await built.substrate.invoke({ substrate: "firefox", capabilityId: "set_theme" });
    const verification = await built.substrate.verify({
      substrate: "firefox",
      capabilityId: "set_theme",
      axId: "settings.theme",
      expected: { value: "dark" },
    });
    console.log(JSON.stringify({ before: before?.state, invoke, verification }, null, 2));
    const pass = invoke.ok && verification.pass && built.closables.length === 1;
    console.log(pass ? "NEXUS GRAPH INVOCATION PROVEN" : "NEXUS GRAPH INVOCATION FAILED");
    process.exitCode = pass ? 0 : 1;
  } finally {
    for (const closable of built.closables) await closable.close().catch(() => undefined);
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
