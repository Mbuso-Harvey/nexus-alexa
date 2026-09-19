/**
 * WindowsSubstrate — a REAL native desktop substrate driven ENTIRELY through NexusOS Semantic's
 * shipped Windows UI Automation capabilities. No new mechanisms: it uses only the operations the
 * Nexus Windows daemon exposes through its UIA bridge, exactly as Nexus calls them:
 *   - ListWindows      (Nexus desktop_list_windows)   — discover the native window
 *   - DumpTree         (Nexus desktop_scrape_window)  — semantic accessibility tree + geometry
 *   - Focus            (Nexus desktop_kinetic_action:focus)
 *   - Click (x,y)      (Nexus desktop_kinetic_action:click) — place the caret IN the scraped element
 *   - SendText         (Nexus desktop_kinetic_action:type)
 *
 * Element targeting is done the Nexus way: scrape the semantic tree, take the target element's
 * bounding rectangle, and click its center to place the caret before typing. This is why input
 * lands in the intended control rather than the focused foreground window.
 *
 * Verification uses a real signal Nexus reads back from the substrate: the window title's native
 * unsaved-changes marker (e.g. "Untitled - Notepad" -> "*Untitled - Notepad") plus the presence of
 * the edited document element in the scrape. Observed state comes from Nexus's own scrape/list, not
 * from the Alexa UI reporting success.
 *
 * Implements the same NexusSubstrate contract and routes every invocation through the same security
 * tier gate. Excluded from the hermetic build/tests (needs a real desktop); proven by
 * scripts/live-windows.ts and the combined live demo.
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
import { decide, tierForCapability } from "./security.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// The vendored NexusOS Semantic Windows UIA bridge — unmodified.
const NEXUS_UIA_BRIDGE = resolve(
  __dirname,
  "..",
  "..",
  "vendor",
  "nexus",
  "desktop",
  "windows",
  "scripts",
  "uia-bridge.ps1",
);

interface WinInfo {
  windowId: string;
  title: string;
  processName: string;
  processId: number;
  bounds: { x: number; y: number; width: number; height: number };
}
interface UiaNode {
  automationId?: string;
  name?: string;
  controlType?: string;
  className?: string;
  boundingRectangle?: { x: number; y: number; width: number; height: number };
  children?: UiaNode[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface WindowsSubstrateOptions {
  appPath?: string;
  processName?: string;
  powershellPath?: string;
  timeoutMs?: number;
}

export class WindowsSubstrate implements NexusSubstrate {
  private readonly appPath: string;
  private readonly processName: string;
  private readonly powershell: string;
  private readonly timeoutMs: number;

  constructor(opts: WindowsSubstrateOptions = {}) {
    this.appPath = opts.appPath ?? "C:\\Windows\\System32\\notepad.exe";
    this.processName = opts.processName ?? "notepad";
    this.powershell = opts.powershellPath ?? "powershell.exe";
    // 30s: absorbs PowerShell/UIA cold-start latency (a first ListWindows can take several
    // seconds on a cold or loaded system) so a single slow call does not fail the demo.
    this.timeoutMs = opts.timeoutMs ?? 30000;
  }

  /** Invoke the vendored Nexus UIA bridge (the exact invocation Nexus's WindowsUiaDaemon uses). */
  private runBridge(args: string[]): Promise<any> {
    return new Promise((res, rej) => {
      const child = spawn(
        this.powershell,
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", NEXUS_UIA_BRIDGE, ...args],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      let out = "";
      let err = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (c) => (out += c));
      child.stderr.on("data", (c) => (err += c));
      const timer = setTimeout(() => {
        child.kill();
        rej(new Error(`Nexus UIA bridge timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      child.on("close", (code) => {
        clearTimeout(timer);
        const t = out.trim();
        if (code !== 0 && !t) return rej(new Error(`UIA bridge error (${code}): ${err.trim()}`));
        try {
          res(t ? JSON.parse(t) : null);
        } catch {
          res({ raw: t });
        }
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        rej(e);
      });
    });
  }

  // --- Nexus desktop primitives -----------------------------------------

  private async listWindows(): Promise<WinInfo[]> {
    const raw = await this.runBridge(["-Action", "ListWindows"]);
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  }

  private async findWindow(): Promise<WinInfo | undefined> {
    const list = await this.listWindows();
    return list.find((w) => (w.processName ?? "").toLowerCase().includes(this.processName));
  }

  private async scrape(windowId: string): Promise<UiaNode> {
    return (await this.runBridge(["-Action", "DumpTree", "-MaxDepth", "8", "-WindowHandle", windowId])) as UiaNode;
  }

  private async focus(windowId: string): Promise<void> {
    await this.runBridge(["-Action", "Focus", "-WindowHandle", windowId]);
  }

  private async click(x: number, y: number): Promise<void> {
    await this.runBridge(["-Action", "Click", "-X", String(Math.round(x)), "-Y", String(Math.round(y))]);
  }

  private async type(text: string): Promise<void> {
    await this.runBridge(["-Action", "SendText", "-Text", text]);
  }

  /** Find the primary editable document/edit node in a scraped tree (by control type). */
  private findEditNode(node: UiaNode | undefined): UiaNode | undefined {
    if (!node) return undefined;
    const ct = (node.controlType ?? "").toLowerCase();
    const cls = (node.className ?? "").toLowerCase();
    if ((ct.includes("document") || ct.includes("edit") || cls === "edit") && node.boundingRectangle) {
      return node;
    }
    for (const c of node.children ?? []) {
      const hit = this.findEditNode(c);
      if (hit) return hit;
    }
    return undefined;
  }

  private async ensureWindow(): Promise<WinInfo> {
    let w = await this.findWindow();
    if (w) return w;
    spawn(this.appPath, [], { windowsHide: false, detached: true, stdio: "ignore" }).unref();
    for (let i = 0; i < 20; i++) {
      await sleep(400);
      w = await this.findWindow();
      if (w) return w;
    }
    throw new Error(`could not launch/find window for ${this.appPath}`);
  }

  // --- NexusSubstrate contract -------------------------------------------

  async connect(): Promise<void> {
    await this.ensureWindow();
  }

  async close(): Promise<void> {
    // Leave the app on screen so the typed result stays visible for the demo.
  }

  async availableSubstrates(): Promise<Substrate[]> {
    return ["windows"];
  }

  async query(q: GraphQuery): Promise<AxNode[]> {
    if (q.role && q.role !== "textbox") return [];
    const node = await this.read("windows", "windows.brief");
    return node ? [node] : [];
  }

  /** Observed state read from Nexus's own scrape/list: window title (+ dirty marker) and edit presence. */
  async read(_substrate: Substrate, axId: string): Promise<AxNode | null> {
    if (axId !== "windows.brief") return null;
    const w = await this.ensureWindow();
    const tree = await this.scrape(w.windowId);
    const edit = this.findEditNode(tree);
    // Re-read the (possibly changed) title via list.
    const fresh = (await this.listWindows()).find((x) => x.windowId === w.windowId) ?? w;
    return {
      axId: "windows.brief",
      role: "textbox",
      name: edit?.name ?? "Native editor",
      state: {
        windowTitle: fresh.title,
        dirty: fresh.title.trim().startsWith("*"),
        hasEditor: Boolean(edit),
        app: this.processName,
      },
    };
  }

  async capabilities(_substrate: Substrate, find?: string): Promise<Capability[]> {
    const term = (find ?? "").toLowerCase();
    const caps: Capability[] = [
      {
        capabilityId: "populate_brief",
        substrate: "windows",
        name: "Write the brief into the native editor",
        role: "textbox",
        tier: tierForCapability({ role: "textbox", name: "Write the brief", inputKeys: ["text"] }),
        inputs: ["text"],
      },
    ];
    return term ? caps.filter((c) => c.name.toLowerCase().includes(term) || c.capabilityId.includes(term)) : caps;
  }

  async invoke(opts: {
    substrate: Substrate;
    capabilityId: string;
    inputs?: Record<string, string | number | boolean>;
    confirm?: boolean;
  }): Promise<InvokeResult> {
    if (opts.capabilityId !== "populate_brief") {
      return { ok: false, requireConfirm: false, reason: `capability ${opts.capabilityId} not found on windows`, tier: "READ" };
    }
    const role = "textbox";
    const name = "Write the brief into the native editor";
    const tier: SecurityTier = tierForCapability({ role, name, inputKeys: ["text"] });
    // Tier gate BEFORE any native contact — same enforcement as every substrate. No bypass.
    const decision = decide({ tier, capabilityId: opts.capabilityId, role, name, confirm: opts.confirm === true });
    if (!decision.ok) {
      return { ok: false, requireConfirm: decision.requireConfirm, reason: decision.reason, tier, observed: null };
    }

    const text = String(opts.inputs?.text ?? "");
    const w = await this.ensureWindow();
    // A freshly-launched window needs a moment before it reliably accepts focus/input.
    await sleep(600);

    // The Nexus-native targeted-typing flow: focus -> scrape for the edit rect -> click its
    // center to place the caret in THAT element -> type. Retried once if the native state does
    // not reflect the edit (absorbs focus/foreground timing races on a loaded system).
    let observed = await this.typeIntoEditor(w.windowId, text);
    if (!observed?.state?.dirty) {
      await sleep(500);
      observed = await this.typeIntoEditor(w.windowId, text);
    }

    return {
      ok: true,
      requireConfirm: false,
      reason: "ok",
      tier,
      observed,
    };
  }

  /** One focus -> scrape -> click-element -> type pass, returning the observed native state. */
  private async typeIntoEditor(windowId: string, text: string): Promise<AxNode | null> {
    await this.focus(windowId);
    await sleep(500);
    const tree = await this.scrape(windowId);
    const edit = this.findEditNode(tree);
    if (edit?.boundingRectangle) {
      const r = edit.boundingRectangle;
      await this.click(r.x + r.width / 2, r.y + r.height / 2);
      await sleep(350);
    }
    // Re-assert foreground right before typing so keystrokes land in this window.
    await this.focus(windowId);
    await sleep(250);
    await this.type(text);
    await sleep(500);
    return this.read("windows", "windows.brief");
  }

  async verify(opts: {
    substrate: Substrate;
    capabilityId: string;
    axId: string;
    expected: Record<string, string | number | boolean | null>;
  }): Promise<Verification> {
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
      detail: pass
        ? "native window state matches expected (edit reflected by Nexus scrape)"
        : "native window state does not match expected",
    };
  }
}
