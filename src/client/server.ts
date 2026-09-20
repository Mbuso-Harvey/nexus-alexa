/**
 * Simulated Alexa+ web client server.
 *
 * Serves the static simulator UI and a small orchestration proxy. The browser posts an
 * objective (and confirmation decisions) here; the server runs the Orchestrator against the
 * REAL MCP 2025-11-25 Streamable HTTP server (as an MCP client) and streams execution events
 * back via SSE. This keeps the "Alexa+ is simulated, Nexus execution is real" boundary clean:
 * the presentation layer is simulated; every tool call is a real MCP call over Streamable HTTP.
 */

import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ScenarioPlanBuilder,
  LiveWebPlanBuilder,
  CompositePlanBuilder,
  AsyncCompositePlanBuilder,
} from "../plan.js";
import { BedrockPlanBuilder } from "../plan-bedrock.js";
import { Orchestrator, httpToolCaller, type OrchestratorEvent } from "../orchestrator.js";
import { CAPABILITY_MANIFEST } from "../nexus/manifest.js";
import type { Substrate } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ClientServerOptions {
  port: number;
  host?: string;
  /** URL of the running MCP Streamable HTTP server. */
  mcpUrl: string;
  bearerToken?: string;
  /** Per-substrate backing ("real" | "fake") for truthful live-vs-simulated labels. */
  backing?: Record<string, "real" | "fake">;
  /** Live graph statistics read from the trusted Nexus crawl artifact (for the reveal panel). */
  engineStats?: Record<string, string | number>;
  /** Enable the Bedrock (AWS Builder) planner when AWS credentials are present. Default true. */
  useBedrock?: boolean;
}

export interface RunningClientServer {
  server: Server;
  url: string;
  close(): Promise<void>;
}

async function connectMcp(mcpUrl: string, token?: string): Promise<Client> {
  const client = new Client({ name: "alexa-simulator", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: token ? { headers: { authorization: `Bearer ${token}` } } : undefined,
  });
  await client.connect(transport);
  return client;
}

export async function startClientServer(
  opts: ClientServerOptions,
): Promise<RunningClientServer> {
  const host = opts.host ?? "127.0.0.1";
  const html = readFileSync(join(__dirname, "ui.html"), "utf8");
  const backing = opts.backing ?? {};
  const firefoxLive = backing.firefox === "real";
  const windowsLive = backing.windows === "real";
  const realSubstrates = Object.entries(backing)
    .filter(([, mode]) => mode === "real")
    .map(([substrate]) => substrate as Substrate);

  // The deterministic plan must match the adapters actually backing this run. In the default
  // all-simulated quick start, use the seeded scenario contract; only select direct Firefox
  // bindings when Firefox is genuinely live. A partial Firefox-only run omits the Windows step.
  const deterministic = new CompositePlanBuilder(
    firefoxLive
      ? [new LiveWebPlanBuilder({ includeWindows: windowsLive }), new ScenarioPlanBuilder({ windowsLive })]
      : [new ScenarioPlanBuilder({ windowsLive })],
  );
  // Do not label a fake-substrate run as Bedrock-planned: its seeded capability IDs intentionally
  // differ from direct live adapters. Ground Bedrock only in substrates that are live right now.
  const bedrock =
    (opts.useBedrock ?? true) &&
    realSubstrates.length > 0 &&
    BedrockPlanBuilder.credentialsPresent()
      ? new BedrockPlanBuilder({ substrates: realSubstrates })
      : null;
  const planner = new AsyncCompositePlanBuilder(bedrock, deterministic);

  // Pending confirmation decisions keyed by run+step, resolved by the browser.
  const pendingConfirms = new Map<string, (grant: boolean) => void>();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);

      if (url.pathname === "/" || url.pathname === "/index.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (url.pathname === "/api/manifest") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(CAPABILITY_MANIFEST));
        return;
      }

      if (url.pathname === "/api/backing") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(opts.backing ?? {}));
        return;
      }

      if (url.pathname === "/api/enginestats") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(opts.engineStats ?? {}));
        return;
      }

      // Confirmation decision from the browser: /api/confirm?key=...&grant=true
      if (url.pathname === "/api/confirm") {
        const key = url.searchParams.get("key") ?? "";
        const grant = url.searchParams.get("grant") === "true";
        const resolve = pendingConfirms.get(key);
        if (resolve) {
          resolve(grant);
          pendingConfirms.delete(key);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "no pending confirm for key" }));
        }
        return;
      }

      // Run orchestration and stream events over SSE: /api/run?objective=...&autoConfirm=false
      if (url.pathname === "/api/run") {
        const objective =
          url.searchParams.get("objective") ??
          "Alexa, get me set up for the Acme review at 3";
        const autoConfirm = url.searchParams.get("autoConfirm") === "true";
        const runId = Math.random().toString(36).slice(2, 10);

        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);

        const { plan, plannedBy } = await planner.build(objective);
        send({ type: "planned", plannedBy, hasPlan: Boolean(plan) });

        if (!plan) {
          send({ type: "error", message: `I can't map "${objective}" to a task yet.` });
          res.end();
          return;
        }

        let client: Client | undefined;
        try {
          client = await connectMcp(opts.mcpUrl, opts.bearerToken);
          const orch = new Orchestrator(httpToolCaller(client));
          await orch.run(plan, {
            onEvent: (e: OrchestratorEvent) => send(e),
            confirm: async (step) => {
              if (autoConfirm) return true;
              const key = `${runId}:${step.id}`;
              send({ type: "confirm:prompt", key, step });
              return await new Promise<boolean>((resolve) => {
                pendingConfirms.set(key, resolve);
                // Safety timeout: deny if no decision within 60s.
                setTimeout(() => {
                  if (pendingConfirms.has(key)) {
                    pendingConfirms.delete(key);
                    resolve(false);
                  }
                }, 60_000);
              });
            },
          });
        } catch (err) {
          send({ type: "error", message: (err as Error).message });
        } finally {
          await client?.close().catch(() => undefined);
          res.end();
        }
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port, host, resolve));
  const url = `http://${host}:${opts.port}/`;
  return {
    server,
    url,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
