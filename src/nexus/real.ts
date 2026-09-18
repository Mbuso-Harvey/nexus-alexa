/**
 * RealNexusSubstrate — binds the Alexa gateway to a running NexusOS Semantic MCP server.
 *
 * This is the adapter that "just connects" as the user brings more Nexus functionality
 * online. It speaks to Nexus over its native MCP transport (stdio today; the same client
 * works if Nexus later exposes Streamable HTTP) using the official MCP client, and maps
 * our semantic contract (query / read / capabilities / invoke / verify) onto Nexus's real
 * tools (graph_query, graph_tool, graph_act, graph_invoke, graph_explain).
 *
 * Because the contract is stable, nothing upstream (orchestrator, planner, Alexa client,
 * Streamable HTTP gateway) changes when we flip from FakeNexusSubstrate to this. And because
 * the mapping is thin, new Nexus capabilities appear automatically through nexus_capabilities.
 *
 * NOTE: Nexus's graph tools operate on a single active web (BiDi) graph in the current build;
 * the `substrate` argument is carried through for forward-compatibility with Nexus's
 * desktop / mobile / chrome tools as they are wired. Until a given substrate is live in
 * Nexus, prefer FakeNexusSubstrate for that substrate (see CompositeSubstrate).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  AxNode,
  Capability,
  GraphQuery,
  InvokeResult,
  SecurityTier,
  Substrate,
  Verification,
} from "../types.js";
import type { NexusSubstrate } from "./substrate.js";

export interface RealNexusOptions {
  /** Command to launch the Nexus MCP server (stdio). e.g. { command: "nexus", args: ["serve", ...] }. */
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** Which substrate this adapter represents (default "firefox"). */
  substrate?: Substrate;
}

function parse(raw: any): any {
  const text = raw?.content?.find?.((c: any) => c.type === "text")?.text;
  if (typeof text === "string") {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  return raw;
}

export class RealNexusSubstrate implements NexusSubstrate {
  private client?: Client;
  private readonly substrateName: Substrate;

  constructor(private readonly opts: RealNexusOptions) {
    this.substrateName = opts.substrate ?? "firefox";
  }

  /** Connect (lazily) to the Nexus MCP server over stdio. */
  async connect(): Promise<void> {
    if (this.client) return;
    const client = new Client({ name: "nexus-alexa-bridge", version: "0.1.0" });
    const transport = new StdioClientTransport({
      command: this.opts.command,
      args: this.opts.args ?? [],
      env: this.opts.env,
    });
    await client.connect(transport);
    this.client = client;
  }

  async close(): Promise<void> {
    await this.client?.close().catch(() => undefined);
    this.client = undefined;
  }

  private async tool(name: string, args: Record<string, unknown>): Promise<any> {
    if (!this.client) await this.connect();
    return this.client!.callTool({ name, arguments: args });
  }

  async availableSubstrates(): Promise<Substrate[]> {
    // Nexus's web graph is the reachable substrate for this adapter instance.
    return [this.substrateName];
  }

  async query(q: GraphQuery): Promise<AxNode[]> {
    // Map to Nexus graph_query. Prefer role filter; fall back to name contains.
    const where: Record<string, unknown> = {};
    if (q.role) where.role = q.role;
    if (q.find) where.name = q.find;
    const res = parse(
      await this.tool("graph_query", { select: "ax-node", where, limit: 50 }),
    );
    const hits: any[] = res?.hits ?? res?.nodes ?? res ?? [];
    return hits.map(nexusNodeToAx);
  }

  async read(_substrate: Substrate, axId: string): Promise<AxNode | null> {
    // graph_explain returns the node + neighborhood; use it as a read.
    const res = parse(await this.tool("graph_explain", { id: axId }));
    if (!res || res.isError) return null;
    const node = res.node ?? res.center ?? res;
    return node ? nexusNodeToAx(node) : null;
  }

  async capabilities(_substrate: Substrate, find?: string): Promise<Capability[]> {
    const args: Record<string, unknown> = {};
    if (find) args.name = find;
    const res = parse(await this.tool("graph_tool", args));
    const list: any[] = res?.tools ?? res?.capabilities ?? res ?? [];
    return list.map((t) => ({
      capabilityId: t.capabilityId ?? t.id,
      substrate: this.substrateName,
      name: t.name ?? t.label ?? "",
      role: t.role ?? "",
      tier: (t.security ?? t.tier ?? "READ") as SecurityTier,
      inputs: t.inputKeys ?? t.inputs,
    }));
  }

  async invoke(opts: {
    substrate: Substrate;
    capabilityId: string;
    inputs?: Record<string, string | number | boolean>;
    confirm?: boolean;
  }): Promise<InvokeResult> {
    // Nexus graph_invoke gates + executes on the live page. It expects `input` with a
    // `text` field for text roles; pass inputs through.
    const res = parse(
      await this.tool("graph_invoke", {
        capabilityId: opts.capabilityId,
        input: opts.inputs ?? {},
        confirm: opts.confirm,
      }),
    );
    // Nexus returns either an InvokeResult (decision+binding+observe) or a decision-only
    // ActResult (from graph_act). Normalise both.
    const decision = res?.decision ?? res;
    const ok = decision?.ok ?? res?.ok ?? false;
    const requireConfirm = decision?.requireConfirm ?? res?.requireConfirm ?? false;
    const tier = (decision?.preview?.tier ?? res?.tier ?? "READ") as SecurityTier;
    return {
      ok: Boolean(ok) && !requireConfirm,
      requireConfirm: Boolean(requireConfirm),
      reason: decision?.reason ?? res?.reason ?? (ok ? "ok" : "blocked"),
      tier,
      observed: res?.observe ? nexusObserveToAx(res.observe) : null,
    };
  }

  async verify(opts: {
    substrate: Substrate;
    capabilityId: string;
    axId: string;
    expected: Record<string, string | number | boolean | null>;
  }): Promise<Verification> {
    // Semantic re-read via graph_explain and compare expected keys.
    const node = await this.read(opts.substrate, opts.axId);
    const observed = node?.state ?? null;
    let pass = observed != null;
    if (observed) {
      for (const [k, v] of Object.entries(opts.expected)) {
        if (String(observed[k]) !== String(v)) {
          pass = false;
          break;
        }
      }
    }
    return {
      capabilityId: opts.capabilityId,
      substrate: opts.substrate,
      expected: opts.expected,
      observed,
      pass,
      detail: pass ? "observed state matches expected" : "observed state does not match expected",
    };
  }
}

function nexusNodeToAx(n: any): AxNode {
  return {
    axId: n.axId ?? n.id ?? "",
    role: n.role ?? "",
    name: n.name ?? n.computedName ?? "",
    state: n.state ?? extractState(n),
  };
}

function nexusObserveToAx(observe: any): AxNode | null {
  if (!observe) return null;
  return {
    axId: observe.axId ?? "",
    role: observe.role ?? "",
    name: observe.name ?? "",
    state: { url: observe.url ?? "", elapsedMs: observe.elapsedMs ?? 0 },
  };
}

function extractState(n: any): Record<string, string | number | boolean | null> | undefined {
  const s: Record<string, string | number | boolean | null> = {};
  for (const k of ["checked", "expanded", "value", "selected", "disabled", "pressed"]) {
    if (n[k] != null) s[k] = n[k];
  }
  return Object.keys(s).length ? s : undefined;
}
