/**
 * Full live proof: exercise every real Firefox binding against the demo app.
 *   read theme -> extract tokens -> create ticket (EXECUTE) -> admin view (context-aware)
 *   -> reach delete-workspace (CONFIRM control) -> switch theme to dark -> verify.
 *
 * Run:  npx tsx scripts/live-firefox-full.ts [baseUrl]
 * Preconditions: geckodriver --port 4444 --allow-origins http://127.0.0.1:9222, demo app up.
 */

import { FirefoxSubstrate } from "../src/nexus/firefox.js";

async function main() {
  const baseUrl = process.argv[2] ?? "http://127.0.0.1:7311";
  const fx = new FirefoxSubstrate({ baseUrl });
  console.log(`[full] connecting to Firefox, target ${baseUrl} ...`);
  await fx.connect();
  let ok = true;
  const check = (label: string, pass: boolean, detail?: unknown) => {
    ok = ok && pass;
    console.log(`  ${pass ? "✅" : "❌"} ${label}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
  };

  try {
    const theme0 = await fx.read("firefox", "settings.theme");
    check("read theme", !!theme0?.state, theme0?.state);

    const tokens = await fx.read("firefox", "settings.tokens");
    check("extract design tokens", !!tokens?.state?.["color.accent"], tokens?.state);

    const ticket = await fx.invoke({
      substrate: "firefox",
      capabilityId: "tickets.create",
      inputs: { title: "Nexus test", severity: "high", body: "hello" },
    });
    check("create ticket (dialog open)", ticket.ok && ticket.observed?.state?.dialog === "open", ticket.observed?.state);

    const admin = await fx.read("firefox", "settings.adminView");
    check("admin view danger zone visible", admin?.state?.dangerZone === "visible", admin?.state);

    // The CONFIRM control: invoke without confirm should be BLOCKED (requireConfirm).
    const blocked = await fx.invoke({ substrate: "firefox", capabilityId: "settings.deleteWorkspace" });
    check("delete-workspace BLOCKED without confirm", !blocked.ok && blocked.requireConfirm && blocked.tier === "CONFIRM", {
      ok: blocked.ok,
      requireConfirm: blocked.requireConfirm,
      tier: blocked.tier,
    });

    // With confirm, it opens the dialog (safe — no backend delete).
    const confirmed = await fx.invoke({ substrate: "firefox", capabilityId: "settings.deleteWorkspace", confirm: true });
    check("delete-workspace opens confirm dialog when approved", confirmed.ok && confirmed.observed?.state?.dialog === "open", confirmed.observed?.state);

    const dark = await fx.invoke({ substrate: "firefox", capabilityId: "settings.theme", inputs: { theme: "dark" } });
    const ver = await fx.verify({ substrate: "firefox", capabilityId: "settings.theme", axId: "settings.theme", expected: { value: "dark" } });
    check("switch theme to dark + verify", dark.ok && ver.pass, ver.observed);

    console.log(ok ? "\n✅ FULL LIVE WEB STORY PROVEN" : "\n❌ some checks failed");
    process.exitCode = ok ? 0 : 1;
  } finally {
    await fx.close();
  }
}

main().catch((err) => {
  console.error("[full] error:", err);
  process.exit(1);
});
