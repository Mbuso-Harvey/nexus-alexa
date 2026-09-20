/** Proves native text replacement and exact UIA read-back through a genuine Nexus MCP process. */
import { resolve } from "node:path";
import { buildSubstrateAsync } from "../src/nexus/build.js";

async function main() {
  const nexusRoot = resolve(process.argv[2] ?? "../_research_awg");
  const graph = resolve(process.argv[3] ?? "demo/nexus-graph");
  const baseUrl = process.argv[4] ?? "http://127.0.0.1:7312";
  const text = "Native review brief written and read back through the Nexus desktop runtime.";
  const built = await buildSubstrateAsync({
    real: ["windows"],
    nexus: {
      command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      args: ["run", "nexus", "serve", "--no-bidi", "--graph", graph, "--desktop"],
      cwd: nexusRoot,
      baseUrl,
      desktopProcessName: "notepad",
    },
  });
  try {
    const before = await built.substrate.read("windows", "windows.brief");
    const invoke = await built.substrate.invoke({
      substrate: "windows",
      capabilityId: "populate_brief",
      inputs: { text },
    });
    const verification = await built.substrate.verify({
      substrate: "windows",
      capabilityId: "populate_brief",
      axId: "windows.brief",
      expected: { value: text },
    });
    console.log(JSON.stringify({ before: before?.state, invoke, verification }, null, 2));
    const pass = invoke.ok && verification.pass && built.closables.length === 1;
    console.log(pass ? "NEXUS WINDOWS RUNTIME PROVEN" : "NEXUS WINDOWS PROOF FAILED");
    process.exitCode = pass ? 0 : 1;
  } finally {
    for (const closable of built.closables) await closable.close().catch(() => undefined);
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
