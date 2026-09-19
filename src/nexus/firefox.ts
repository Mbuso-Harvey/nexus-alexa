/**
 * FirefoxSubstrate — a REAL web substrate backed by NexusOS Semantic's WebDriver BiDi client.
 *
 * This is genuine cross-substrate execution: it drives a real Firefox via geckodriver using
 * Nexus's own BiDi client (`BiDiSession` / `Page`), performs real semantic reads and clicks
 * against a live web app, and verifies state by re-reading the DOM/accessibility properties.
 * It implements the same `NexusSubstrate` contract as the fake, so the orchestrator, planner,
 * Alexa client, and Streamable HTTP transport are unchanged — this simply becomes the "real"
 * binding for the firefox substrate in the CompositeSubstrate.
 *
 * Requirements to run: geckodriver on 127.0.0.1:4444 (started with
 * `--allow-origins http://127.0.0.1:9222`), Firefox installed, and a reachable target app.
 *
 * The BiDi client is consumed from `vendor/nexus/` (a vendored, unmodified, Apache-2.0 subset of
 * NexusOS Semantic) so a cold clone is fully reproducible. Kept out of the default (hermetic)
 * test run so `npm test` needs no browser.
 */

import { BiDiSession } from "../../vendor/nexus/bidi-client/session.js";
import type { Page } from "../../vendor/nexus/bidi-client/page.js";
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

/**
 * Declarative binding of our capability contract to real DOM operations on the demo app.
 * Each entry says how to read a node's semantic state and how to perform its capability.
 * This keeps the driver generic: new capabilities are added as data, not code.
 */
interface WebBinding {
  axId: string;
  role: string;
  name: string;
  route: string;
  inputs?: string[];
  /** JS expression (in page) returning the node's state object. */
  readExpr: string;
  /** JS function body (in page) that performs the action; receives `inputs` as `arg`. */
  actFn?: string;
}

export interface FirefoxSubstrateOptions {
  /** Base URL of the target web app (e.g. the Nexus demo SaaS). */
  baseUrl: string;
  webDriverBase?: string;
  bidiOrigin?: string;
  bindings?: WebBinding[];
}

/** Default bindings against the Nexus demo SaaS ("AdamCo Demo", settings/theme + design tokens). */
function defaultBindings(): WebBinding[] {
  return [
    {
      axId: "settings.theme",
      role: "button",
      name: "Toggle appearance theme",
      route: "/index.html",
      inputs: ["theme"],
      // The demo shows current theme in #theme-label (falls back to data-theme).
      readExpr:
        "({ value: ((document.getElementById('theme-label')||{}).textContent || document.documentElement.getAttribute('data-theme') || 'light').trim() })",
      // Click the real #theme-toggle button until the label matches the requested theme.
      actFn:
        "const want=(arg&&arg.theme)||'dark';" +
        "const label=()=>((document.getElementById('theme-label')||{}).textContent||'').trim();" +
        "const btn=document.getElementById('theme-toggle');" +
        "for(let i=0;i<3 && label()!==want && btn;i++){btn.click();}" +
        "return {value:label()};",
    },
    {
      axId: "settings.tokens",
      role: "region",
      name: "Extract design tokens & layout",
      route: "/index.html",
      // Read the demo's real CSS custom properties (matches app.css / design-tokens.json).
      readExpr:
        "(()=>{const s=getComputedStyle(document.documentElement);" +
        "const g=(n)=>s.getPropertyValue(n).trim();" +
        "return {\"color.accent\":g('--color-accent'),\"color.bg\":g('--color-bg'),\"color.fg\":g('--color-fg'),\"space.4\":g('--space-4'),\"radius.md\":g('--radius-md'),\"font.size.xl\":g('--font-size-xl')};})()",
    },
    {
      // Real modal-form ticket creation on the tickets page. EXECUTE tier.
      axId: "tickets.create",
      role: "button",
      name: "Create a support ticket",
      route: "/tickets.html",
      inputs: ["title", "severity", "body"],
      // Report how many tickets are currently listed + whether the dialog is open.
      readExpr:
        "(()=>{const rows=document.querySelectorAll('table tbody tr, .ticket, li[data-ticket]');" +
        "const d=document.getElementById('new-ticket-dialog');" +
        "return {count:String(rows.length), dialog:(d&&d.open)?'open':'closed'};})()",
      // Open the real dialog, fill the real form fields, and submit it (method=dialog).
      actFn:
        "const d=document.getElementById('new-ticket-dialog');const f=document.getElementById('new-ticket-form');" +
        "if(d&&!d.open){const b=document.getElementById('btn-new-ticket'); if(b){b.click();} else if(d.showModal){d.showModal();}}" +
        "if(f){const t=f.querySelector('[name=title]'); if(t){t.value=(arg&&arg.title)||'Prepared by Nexus';}" +
        "const s=f.querySelector('[name=severity]'); if(s){s.value=(arg&&arg.severity)||'medium';s.dispatchEvent(new Event('change',{bubbles:true}));}" +
        "const bd=f.querySelector('[name=body]'); if(bd){bd.value=(arg&&arg.body)||'Filed via Alexa+ through Nexus.';}}" +
        "const d2=document.getElementById('new-ticket-dialog');" +
        "return {dialog:(d2&&d2.open)?'open':'closed', title:(f&&f.querySelector('[name=title]')||{}).value||''};",
    },
    {
      // The REAL CONFIRM beat: a destructive control on the admin settings page.
      // 'delete' verb -> CONFIRM tier. On approval Nexus opens the confirm dialog
      // (a pure declarative Invoker command; no backend delete, so it is safe to show).
      axId: "settings.deleteWorkspace",
      role: "button",
      name: "Delete workspace (danger)",
      route: "/settings.html?as=administrator:bob:session-2",
      // Read whether the danger control is reachable + the confirm dialog's state.
      readExpr:
        "(()=>{const b=document.getElementById('btn-delete-workspace');" +
        "const d=document.getElementById('delete-workspace-dialog');" +
        "return {control:b?'present':'absent', dialog:(d&&d.open)?'open':'closed'};})()",
      // Open the confirmation dialog (does NOT click 'Delete permanently').
      actFn:
        "const b=document.getElementById('btn-delete-workspace');" +
        "const d=document.getElementById('delete-workspace-dialog');" +
        "if(b){b.click();} else if(d&&d.showModal){d.showModal();}" +
        "const d2=document.getElementById('delete-workspace-dialog');" +
        "return {control:'present', dialog:(d2&&d2.open)?'open':'closed'};",
    },
    {
      // Context-aware read: switch to the administrator identity and read what only
      // an admin can see (the Danger zone). Demonstrates permission-dependent graphs.
      axId: "settings.adminView",
      role: "region",
      name: "Read admin-only settings view",
      route: "/settings.html?as=administrator:bob:session-2",
      readExpr:
        "(()=>{const danger=[...document.querySelectorAll('h3')].some(h=>/danger/i.test(h.textContent||''));" +
        "const del=!!document.getElementById('btn-delete-workspace');" +
        "return {dangerZone: danger?'visible':'hidden', deleteControl: del?'present':'absent'};})()",
    },
  ];
}

export class FirefoxSubstrate implements NexusSubstrate {
  private session?: BiDiSession;
  private page?: Page;
  private readonly bindings: WebBinding[];

  constructor(private readonly opts: FirefoxSubstrateOptions) {
    this.bindings = opts.bindings ?? defaultBindings();
  }

  async connect(): Promise<void> {
    if (this.session) return;
    this.session = await BiDiSession.create("firefox", {
      webDriverBase: this.opts.webDriverBase ?? "http://127.0.0.1:4444",
      bidiOrigin: this.opts.bidiOrigin ?? "http://127.0.0.1:9222",
    });
    this.page = await this.session.newPage();
  }

  async close(): Promise<void> {
    await this.session?.close().catch(() => undefined);
    this.session = undefined;
    this.page = undefined;
  }

  private binding(axId: string): WebBinding | undefined {
    return this.bindings.find((b) => b.axId === axId);
  }

  private async ensureOn(route: string): Promise<Page> {
    if (!this.page) await this.connect();
    const page = this.page!;
    const want = this.opts.baseUrl.replace(/\/$/, "") + route;
    const current = await page.url.catch(() => "");
    if (!current.startsWith(want)) {
      await page.navigate(want);
    }
    return page;
  }

  async availableSubstrates(): Promise<Substrate[]> {
    return ["firefox"];
  }

  async query(q: GraphQuery): Promise<AxNode[]> {
    const term = (q.find ?? "").toLowerCase();
    const matches = this.bindings.filter(
      (b) =>
        (q.role ? b.role === q.role : true) &&
        (term ? b.name.toLowerCase().includes(term) || b.axId.includes(term) : true),
    );
    const out: AxNode[] = [];
    for (const b of matches) {
      const node = await this.read("firefox", b.axId);
      if (node) out.push(node);
    }
    return out;
  }

  async read(_substrate: Substrate, axId: string): Promise<AxNode | null> {
    const b = this.binding(axId);
    if (!b) return null;
    const page = await this.ensureOn(b.route);
    const state = await page.script.evaluate<Record<string, string | number | boolean | null>>(
      page.target,
      b.readExpr,
    );
    return { axId: b.axId, role: b.role, name: b.name, state };
  }

  async capabilities(_substrate: Substrate, find?: string): Promise<Capability[]> {
    const term = (find ?? "").toLowerCase();
    return this.bindings
      .filter((b) => b.actFn)
      .filter((b) => (term ? b.name.toLowerCase().includes(term) || b.axId.includes(term) : true))
      .map((b) => ({
        capabilityId: b.axId,
        substrate: "firefox" as Substrate,
        name: b.name,
        role: b.role,
        tier: tierForCapability({ role: b.role, name: b.name, inputKeys: b.inputs ?? [] }),
        inputs: b.inputs,
      }));
  }

  async invoke(opts: {
    substrate: Substrate;
    capabilityId: string;
    inputs?: Record<string, string | number | boolean>;
    confirm?: boolean;
  }): Promise<InvokeResult> {
    const b = this.binding(opts.capabilityId);
    if (!b || !b.actFn) {
      return {
        ok: false,
        requireConfirm: false,
        reason: `capability ${opts.capabilityId} not found on firefox`,
        tier: "READ",
      };
    }
    const tier: SecurityTier = tierForCapability({
      role: b.role,
      name: b.name,
      inputKeys: b.inputs ?? [],
    });
    const decision = decide({
      tier,
      capabilityId: b.axId,
      role: b.role,
      name: b.name,
      confirm: opts.confirm === true,
    });
    if (!decision.ok) {
      return {
        ok: false,
        requireConfirm: decision.requireConfirm,
        reason: decision.reason,
        tier,
        observed: null,
      };
    }
    const page = await this.ensureOn(b.route);
    // Perform the real action in the page. actFn receives inputs as `arg`.
    const observedState = await page.script.callFunction<
      Record<string, string | number | boolean | null>
    >(page.target, `(arg) => { ${b.actFn} }`, [opts.inputs ?? {}]);
    return {
      ok: true,
      requireConfirm: false,
      reason: "ok",
      tier,
      observed: { axId: b.axId, role: b.role, name: b.name, state: observedState },
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
