/**
 * Live proof: the Windows substrate operates a REAL native app (classic Notepad) using ONLY
 * NexusOS Semantic's shipped Windows UIA capabilities (list / scrape / focus / click / type),
 * and verifies via a real signal Nexus reads back from the substrate.
 *
 * Proof shape:  ACTION (Nexus focus+click-element+type) -> EXPECTED (native window dirty) ->
 *               OBSERVED (Nexus scrape/list) -> PASS
 *
 * Run:  npx tsx scripts/live-windows.ts
 * Preconditions: Windows, powershell.exe, classic C:\Windows\System32\notepad.exe.
 */

import { WindowsSubstrate } from "../src/nexus/windows.js";

async function main() {
  const win = new WindowsSubstrate();
  let ok = true;
  const check = (label: string, pass: boolean, detail?: unknown) => {
    ok = ok && pass;
    console.log(`  ${pass ? "OK" : "XX"} ${label}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
  };

  console.log("[win] launching/finding native Notepad via Nexus desktop_list_windows ...");
  await win.connect();

  // Baseline: read the native state through Nexus before acting.
  const before = await win.read("windows", "windows.brief");
  console.log("  baseline:", JSON.stringify(before?.state));

  const brief = "Acme review brief - prepared by Nexus. Renewal Q4; wants SSO + audit log.";
  const inv = await win.invoke({ substrate: "windows", capabilityId: "populate_brief", inputs: { text: brief } });
  check("invoke populate_brief (tier-gated)", inv.ok, { tier: inv.tier });

  // OBSERVED via Nexus scrape/list: the native window is now dirty (unsaved-changes marker).
  const ver = await win.verify({
    substrate: "windows",
    capabilityId: "populate_brief",
    axId: "windows.brief",
    expected: { dirty: true, hasEditor: true },
  });
  check("verify native window dirty via Nexus scrape", ver.pass, ver.observed);

  const bad = await win.invoke({ substrate: "windows", capabilityId: "nope" });
  check("unknown capability fails cleanly", !bad.ok, { reason: bad.reason });

  console.log(ok ? "\nLIVE WINDOWS SUBSTRATE PROVEN (Nexus-only)" : "\nSOME CHECKS FAILED");
  await win.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[win] error:", err);
  process.exit(1);
});
