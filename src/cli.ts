#!/usr/bin/env node
/**
 * nexus-alexa CLI.
 *
 *   nexus-alexa serve [--port N] [--host H] [--token T] [--client]
 *       Start the MCP 2025-11-25 Streamable HTTP server (the required track technology).
 *       --client also serves the simulated Alexa+ web client at /.
 *
 *   nexus-alexa demo "<objective>" [--confirm] [--json]
 *       Run the orchestration headless (offline fake substrate) for rehearsal/CI.
 *
 *   nexus-alexa capabilities [--json]
 *       Print the capability manifest with readiness (live/coming) per substrate.
 */

import { startHttpServer } from "./mcp/http.js";
import { ScenarioPlanBuilder } from "./plan.js";
import { Orchestrator, directToolCaller } from "./orchestrator.js";
import { CAPABILITY_MANIFEST } from "./nexus/manifest.js";
import { startClientServer } from "./client/server.js";
import { buildSubstrate, buildSubstrateAsync, loadConfig, type SubstrateConfig } from "./nexus/build.js";
import { rehearse } from "./rehearse.js";
import { BedrockPlanBuilder } from "./plan-bedrock.js";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}
function has(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (cmd === "serve") {
    const port = Number(flag(argv, "port") ?? 8391);
    const host = flag(argv, "host") ?? "127.0.0.1";
    const token = flag(argv, "token");
    const cfg: SubstrateConfig = loadConfig(flag(argv, "config"));
    const webAppUrl = flag(argv, "web-app");
    if (webAppUrl) cfg.webApp = { baseUrl: webAppUrl };
    if (has(argv, "desktop")) cfg.desktop = cfg.desktop ?? {};
    const built = await buildSubstrateAsync(cfg);
    const running = await startHttpServer({
      substrate: built.substrate,
      port,
      host,
      bearerToken: token,
    });
    // eslint-disable-next-line no-console
    console.error(`[nexus-alexa] MCP Streamable HTTP (2025-11-25) at ${running.url}`);
    for (const s of await built.composite.availableSubstrates()) {
      console.error(`[nexus-alexa]   ${s}: ${built.composite.backingOf(s)}`);
    }
    if (token) console.error(`[nexus-alexa] bearer auth required`);

    if (has(argv, "client")) {
      const clientPort = Number(flag(argv, "client-port") ?? port + 1);
      const backing: Record<string, "real" | "fake"> = {};
      for (const s of await built.composite.availableSubstrates()) {
        const b = built.composite.backingOf(s);
        if (b) backing[s] = b;
      }
      const cs = await startClientServer({
        port: clientPort,
        host,
        mcpUrl: running.url,
        bearerToken: token,
        backing,
      });
      console.error(`[nexus-alexa] Alexa+ simulator at ${cs.url}`);
      const bedrockOn = BedrockPlanBuilder.credentialsPresent();
      console.error(
        `[nexus-alexa]   planner: ${bedrockOn ? "Amazon Bedrock (AWS Builder) + deterministic fallback" : "deterministic (set AWS creds to enable Bedrock)"}`,
      );
    }

    const shutdown = async () => {
      await running.close();
      for (const c of built.closables) await c.close().catch(() => undefined);
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    await new Promise(() => undefined);
    return;
  }

  if (cmd === "demo") {
    const objective = argv[1] ?? "Alexa, get me set up for the Acme review at 3";
    const plan = new ScenarioPlanBuilder().build(objective);
    if (!plan) {
      console.error(`[nexus-alexa] no plan for objective: "${objective}"`);
      process.exit(2);
    }
    const built = buildSubstrate(loadConfig(flag(argv, "config")));
    const orch = new Orchestrator(directToolCaller(built.substrate));
    const grant = has(argv, "confirm");
    const result = await orch.run(plan, {
      confirm: async () => grant,
      onEvent: (e) => {
        if (has(argv, "json")) return;
        switch (e.type) {
          case "intro":
            console.log(`\n🗣  "${e.objective}"`);
            console.log(`🤖 ${e.say}  [${e.substrates.join(", ")}]\n`);
            break;
          case "step:start":
            console.log(`  ${e.index + 1}/${e.total} → [${e.step.substrate}] ${e.step.say}`);
            break;
          case "confirm:required":
            console.log(`      ⚠ CONFIRM required: ${e.preview.reason}`);
            break;
          case "confirm:granted":
            console.log(`      ✔ confirmed`);
            break;
          case "confirm:denied":
            console.log(`      ✖ denied — skipped safely`);
            break;
          case "step:verified":
            console.log(
              `      ${e.verification.pass ? "✅ verified" : "❌ mismatch"}: ${e.verification.detail}`,
            );
            break;
          case "step:done":
            if (!e.step.expected) console.log(`      ${e.pass ? "✅" : "❌"}`);
            break;
          case "outro":
            console.log(`\n🤖 ${e.say}  (${e.pass ? "all steps passed" : "with unmet steps"})\n`);
            break;
          case "error":
            console.log(`      ❌ ${e.message}`);
            break;
        }
      },
    });
    if (has(argv, "json")) console.log(JSON.stringify(result, null, 2));
    for (const c of built.closables) await c.close().catch(() => undefined);
    process.exit(result.ok ? 0 : 1);
  }

  if (cmd === "rehearse") {
    const runs = Number(flag(argv, "runs") ?? 5);
    const required = Number(flag(argv, "required") ?? 5);
    const objective = argv[1] && !argv[1].startsWith("--") ? argv[1] : undefined;
    const report = await rehearse({ objective, runs, required });
    for (const r of report.runs) {
      console.log(
        `  run ${r.index}: ${r.ok ? "PASS" : "FAIL"}  ${r.stepsPassed}/${r.stepsTotal} steps  ${r.ms}ms  ${r.confirmSeen ? "confirm✓" : ""}`,
      );
    }
    console.log(
      `\n${report.ready ? "✅ READY" : "❌ NOT READY"}: ${report.cleanRuns}/${report.required} clean runs required\n`,
    );
    process.exit(report.ready ? 0 : 1);
  }

  if (cmd === "capabilities") {
    if (has(argv, "json")) {
      console.log(JSON.stringify(CAPABILITY_MANIFEST, null, 2));
      return;
    }
    const bySub = new Map<string, typeof CAPABILITY_MANIFEST>();
    for (const c of CAPABILITY_MANIFEST) {
      const list = bySub.get(c.substrate) ?? [];
      list.push(c);
      bySub.set(c.substrate, list);
    }
    for (const [sub, caps] of bySub) {
      console.log(`\n${sub}`);
      for (const c of caps) {
        const mark = c.readiness === "live-demo" ? "●" : c.readiness === "implemented" ? "◐" : "○";
        console.log(`  ${mark} ${c.name}  [${c.readiness}]`);
      }
    }
    console.log("\n● live in this demo   ◐ implemented in Nexus   ○ roadmap\n");
    return;
  }

  console.error(
    [
      "nexus-alexa — Alexa+ -> Nexus Semantic -> cross-substrate execution",
      "",
      "  serve [--port 8391] [--host 127.0.0.1] [--token T] [--client] [--client-port N] [--web-app <url>] [--desktop] [--config <path>]",
      "  demo \"<objective>\" [--confirm] [--json]",
      "  rehearse [\"<objective>\"] [--runs 5] [--required 5]",
      "  capabilities [--json]",
    ].join("\n"),
  );
  process.exit(cmd ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
