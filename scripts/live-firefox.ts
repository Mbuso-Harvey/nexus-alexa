/**
 * Live proof: drive a REAL Firefox (via geckodriver + Nexus BiDi client) against the demo app.
 *
 * Preconditions:
 *   - geckodriver on 127.0.0.1:4444 started with `--allow-origins http://127.0.0.1:9222`
 *   - Firefox installed
 *   - the target app reachable (default: the Nexus demo SaaS at http://127.0.0.1:7311)
 *
 * Run:  npx tsx scripts/live-firefox.ts [baseUrl]
 *
 * This is intentionally NOT a vitest test (it needs a live browser). It proves the firefox
 * substrate performs real semantic reads, a real theme change, and real verification.
 */

import { FirefoxSubstrate } from "../src/nexus/firefox.js";

async function main() {
  const baseUrl = process.argv[2] ?? "http://127.0.0.1:7311";
  const fx = new FirefoxSubstrate({ baseUrl });
  console.log(`[live] connecting to Firefox via geckodriver, target ${baseUrl} ...`);
  await fx.connect();

  try {
    console.log("[live] reading theme before ...");
    const before = await fx.read("firefox", "settings.theme");
    console.log("  before:", JSON.stringify(before?.state));

    console.log("[live] extracting design tokens ...");
    const tokens = await fx.read("firefox", "settings.tokens");
    console.log("  tokens:", JSON.stringify(tokens?.state));

    console.log("[live] invoking set_theme -> dark ...");
    const inv = await fx.invoke({
      substrate: "firefox",
      capabilityId: "settings.theme",
      inputs: { theme: "dark" },
    });
    console.log("  invoke:", JSON.stringify(inv));

    console.log("[live] verifying theme == dark ...");
    const ver = await fx.verify({
      substrate: "firefox",
      capabilityId: "settings.theme",
      axId: "settings.theme",
      expected: { value: "dark" },
    });
    console.log("  verify:", JSON.stringify(ver));

    console.log(ver.pass ? "\n✅ LIVE WEB SUBSTRATE PROVEN" : "\n❌ verification failed");
    process.exitCode = ver.pass ? 0 : 1;
  } finally {
    await fx.close();
  }
}

main().catch((err) => {
  console.error("[live] error:", err);
  process.exit(1);
});
