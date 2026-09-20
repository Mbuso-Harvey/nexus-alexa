/**
 * Sole live execution adapter for the Alexa experience.
 *
 * One instance owns one official MCP stdio connection to one Nexus runtime process. Firefox
 * graph operations and Windows UIA operations share that process. The Alexa layer never opens a
 * BiDi session, invokes PowerShell/UIA, or mutates an application directly.
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
  /** Command that launches the genuine Nexus MCP stdio runtime. */
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** Substrates exposed by this one runtime process. */
  substrates: Substrate[];
  /** Canonical origin already present in the trusted Nexus graph. */
  baseUrl: string;
  /** Native process selected through Nexus desktop_list_windows. */
  desktopProcessName?: string;
}

function parse(raw: any): any {
  const text = raw?.content?.find?.((part: any) => part.type === "text")?.text;
  if (typeof text === "string") {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  return raw;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/\n+$/g, "");
}

function flattenDtcg(
  value: unknown,
  prefix = "",
  output: Record<string, string | number | boolean | null> = {},
): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object") return output;
  const node = value as Record<string, unknown>;
  if ("$value" in node && ["string", "number", "boolean"].includes(typeof node.$value)) {
    output[prefix] = node.$value as string | number | boolean;
    return output;
  }
  for (const [key, child] of Object.entries(node)) {
    if (!key.startsWith("$")) flattenDtcg(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

export class RealNexusSubstrate implements NexusSubstrate {
  private client?: Client;
  private readonly substrates: Substrate[];
  private readonly baseUrl: string;
  private readonly desktopProcessName: string;
  private capabilityCache?: any[];

  constructor(private readonly opts: RealNexusOptions) {
    this.substrates = [...new Set(opts.substrates)];
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.desktopProcessName = (opts.desktopProcessName ?? "notepad").toLowerCase();
  }

  async connect(): Promise<void> {
    if (this.client) return;
    const client = new Client({ name: "alexa-nexus-bridge", version: "0.1.0" });
    const transport = new StdioClientTransport({
      command: this.opts.command,
      args: this.opts.args ?? [],
      env: this.opts.env,
      cwd: this.opts.cwd,
      stderr: "inherit",
    });
    await client.connect(transport);
    this.client = client;

    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    const required: string[] = [];
    if (this.substrates.includes("firefox")) {
      required.push(
        "graph_query",
        "graph_tool",
        "graph_invoke",
        "graph_live_read",
        "export_dtcg_tokens",
      );
    }
    if (this.substrates.includes("windows")) {
      required.push("desktop_list_windows", "desktop_read_text", "desktop_replace_text");
    }
    const missing = required.filter((name) => !names.has(name));
    if (missing.length) {
      await client.close().catch(() => undefined);
      this.client = undefined;
      throw new Error(`Nexus runtime is missing required tools: ${missing.join(", ")}`);
    }
  }

  async close(): Promise<void> {
    await this.client?.close().catch(() => undefined);
    this.client = undefined;
    this.capabilityCache = undefined;
  }

  private async tool(name: string, args: Record<string, unknown>): Promise<any> {
    if (!this.client) await this.connect();
    const raw = await this.client!.callTool({ name, arguments: args });
    const value = parse(raw);
    if (raw?.isError) {
      throw new Error(value?.raw ?? value?.error ?? `${name} failed`);
    }
    return value;
  }

  private page(pathname = "/index.html"): string {
    return `${this.baseUrl}${pathname}`;
  }

  private async productCapabilities(): Promise<any[]> {
    if (!this.capabilityCache) {
      const result = await this.tool("graph_tool", {});
      this.capabilityCache = result?.capabilities ?? result?.tools ?? [];
    }
    return this.capabilityCache!;
  }

  private async resolveWebCapability(kind: "theme" | "sensitive"): Promise<any> {
    const capabilities = await this.productCapabilities();
    const pageId = `page:${this.page()}`;
    const onPage = capabilities.filter((capability) => capability.pageId === pageId);
    const exactSelector = kind === "theme" ? "#theme-toggle" : "#btn-sensitive-signout";
    const match =
      onPage.find((capability) => capability.binding?.selector === exactSelector) ??
      onPage.find((capability) =>
        kind === "theme" ? capability.name === "toggle-theme" : capability.name === "sign-out",
      );
    if (!match) throw new Error(`Nexus graph has no ${kind} capability for ${pageId}`);
    return match;
  }

  private async liveRead(selector: string): Promise<any> {
    return this.tool("graph_live_read", { pageUrl: this.page(), selector });
  }

  private async desktopWindow(): Promise<any> {
    const windows = await this.tool("desktop_list_windows", {});
    const list = Array.isArray(windows) ? windows : windows ? [windows] : [];
    const match = list.find((window) =>
      String(window.processName ?? "").toLowerCase().includes(this.desktopProcessName),
    );
    if (!match) {
      throw new Error(
        `Nexus could not find a ${this.desktopProcessName} window; open the native editor before the run`,
      );
    }
    return match;
  }

  async availableSubstrates(): Promise<Substrate[]> {
    return [...this.substrates];
  }

  async query(q: GraphQuery): Promise<AxNode[]> {
    if (q.substrate === "windows") {
      const window = await this.desktopWindow();
      const result = await this.tool("desktop_scrape_window", { windowId: window.windowId });
      return [{
        axId: `windows:${window.windowId}`,
        role: "window",
        name: result.title ?? window.title ?? "Native window",
        state: { elementCount: Number(result.elementCount ?? 0) },
      }];
    }
    const where: Record<string, unknown> = {};
    if (q.role) where.role = q.role;
    if (q.find) where.name = q.find;
    const result = await this.tool("graph_query", { select: "ax-node", where, limit: 50 });
    const hits: any[] = result?.hits ?? [];
    return hits.map((hit) => nexusNodeToAx(hit.node ?? hit));
  }

  async read(substrate: Substrate, axId: string): Promise<AxNode | null> {
    if (substrate === "windows" && axId === "windows.brief") {
      const window = await this.desktopWindow();
      const result = await this.tool("desktop_read_text", { windowId: window.windowId });
      return {
        axId,
        role: "textbox",
        name: "Native editor",
        state: {
          value: normalizeText(result.text),
          windowId: String(result.windowId ?? window.windowId),
          method: String(result.method ?? "UIAutomation"),
        },
      };
    }
    if (substrate !== "firefox") return null;

    if (axId === "nexus.graph") {
      const result = await this.tool("graph_query", {
        select: "ax-node",
        where: {},
        limit: 50,
      });
      return {
        axId,
        role: "region",
        name: "Semantic application graph",
        state: { nodeCount: Number(result?.hits?.length ?? 0) },
      };
    }
    if (axId === "settings.tokens") {
      const bundle = await this.tool("export_dtcg_tokens", {});
      return {
        axId,
        role: "region",
        name: "W3C design tokens",
        state: flattenDtcg(bundle),
      };
    }
    if (axId === "settings.theme") {
      const result = await this.liveRead("#theme-toggle");
      return {
        axId,
        role: result.element?.role ?? "button",
        name: result.element?.name ?? "Toggle theme",
        state: { value: result.document?.theme ?? "light" },
      };
    }
    if (axId === "safety.dialog") {
      const result = await this.liveRead("#confirm-signout");
      return {
        axId,
        role: "dialog",
        name: result.element?.name ?? "Sensitive account confirmation",
        state: { dialog: result.element?.open === true ? "open" : "closed" },
      };
    }
    return null;
  }

  async capabilities(substrate: Substrate, find?: string): Promise<Capability[]> {
    if (substrate === "windows") {
      const capability: Capability = {
        capabilityId: "populate_brief",
        substrate,
        name: "Replace text in an explicitly selected native editor",
        role: "textbox",
        tier: "PROPOSE",
        inputs: ["text"],
      };
      return !find || capability.name.toLowerCase().includes(find.toLowerCase())
        ? [capability]
        : [];
    }
    const list = await this.productCapabilities();
    return list
      .filter((capability) =>
        find ? String(capability.name ?? "").toLowerCase().includes(find.toLowerCase()) : true,
      )
      .map((capability) => ({
        capabilityId: capability.id,
        substrate: "firefox" as Substrate,
        name: capability.name ?? "",
        role: capability.role ?? "button",
        tier: (capability.security ?? "READ") as SecurityTier,
        inputs: Object.keys(capability.inputSchema?.properties ?? {}),
        location: capability.pageId,
      }));
  }

  async invoke(opts: {
    substrate: Substrate;
    capabilityId: string;
    inputs?: Record<string, string | number | boolean>;
    confirm?: boolean;
  }): Promise<InvokeResult> {
    if (opts.substrate === "windows") {
      if (opts.capabilityId !== "populate_brief") {
        return {
          ok: false,
          requireConfirm: false,
          reason: `Nexus desktop capability not found: ${opts.capabilityId}`,
          tier: "READ",
        };
      }
      const text = normalizeText(opts.inputs?.text);
      if (!text.trim()) {
        return {
          ok: false,
          requireConfirm: false,
          reason: "populate_brief requires non-empty text",
          tier: "PROPOSE",
        };
      }
      const window = await this.desktopWindow();
      const before = await this.tool("desktop_read_text", { windowId: window.windowId });
      const result = await this.tool("desktop_replace_text", {
        windowId: window.windowId,
        expectedCurrentText: normalizeText(before.text),
        text,
      });
      const observedText = normalizeText(result.text);
      return {
        ok: result.decision?.ok === true && observedText === text,
        requireConfirm: Boolean(result.decision?.requireConfirm),
        reason: observedText === text ? "ok" : "Nexus native read-back did not match requested text",
        tier: "PROPOSE",
        observed: {
          axId: "windows.brief",
          role: "textbox",
          name: "Native editor",
          state: { value: observedText },
        },
      };
    }

    let productCapability: any;
    if (opts.capabilityId === "set_theme") {
      const current = await this.read("firefox", "settings.theme");
      if (current?.state?.value === "dark") {
        return {
          ok: true,
          requireConfirm: false,
          reason: "already dark",
          tier: "EXECUTE",
          observed: current,
        };
      }
      productCapability = await this.resolveWebCapability("theme");
    } else if (opts.capabilityId === "open_sensitive_dialog") {
      productCapability = await this.resolveWebCapability("sensitive");
    } else {
      return {
        ok: false,
        requireConfirm: false,
        reason: `Nexus web capability not mapped: ${opts.capabilityId}`,
        tier: "READ",
      };
    }

    const result = await this.tool("graph_invoke", {
      capabilityId: productCapability.id,
      input: opts.inputs ?? {},
      confirm: opts.confirm === true,
    });
    const decision = result.decision ?? {};
    const requireConfirm = Boolean(decision.requireConfirm);
    const ok = result.ok === true && decision.ok !== false && !requireConfirm;
    return {
      ok,
      requireConfirm,
      reason: ok
        ? "ok"
        : result.observe?.error ?? decision.reason ?? "blocked",
      tier: (result.tier ?? decision.preview?.tier ?? productCapability.security ?? "READ") as SecurityTier,
      observed: {
        axId: opts.capabilityId,
        role: productCapability.role ?? "button",
        name: productCapability.name ?? opts.capabilityId,
        state: {
          url: String(result.observe?.url ?? ""),
          elapsedMs: Number(result.observe?.elapsedMs ?? 0),
        },
      },
    };
  }

  async verify(opts: {
    substrate: Substrate;
    capabilityId: string;
    axId: string;
    expected: Record<string, string | number | boolean | null>;
  }): Promise<Verification> {
    const node = await this.read(opts.substrate, opts.axId);
    const observed = node?.state ?? null;
    const pass =
      observed != null &&
      Object.entries(opts.expected).every(([key, value]) => String(observed[key]) === String(value));
    return {
      capabilityId: opts.capabilityId,
      substrate: opts.substrate,
      expected: opts.expected,
      observed,
      pass,
      detail: pass
        ? "Nexus live read-back matches expected state"
        : "Nexus live read-back does not match expected state",
    };
  }
}

function nexusNodeToAx(node: any): AxNode {
  const state: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(node.states ?? node.state ?? {})) {
    if (value == null || ["string", "number", "boolean"].includes(typeof value)) {
      state[key] = value as string | number | boolean | null;
    }
  }
  const valueText = node.properties?.valueText;
  if (valueText != null) state.value = String(valueText);
  return {
    axId: node.id ?? node.axId ?? "",
    role: node.role ?? "",
    name: node.name ?? node.computedName ?? "",
    state: Object.keys(state).length ? state : undefined,
  };
}
