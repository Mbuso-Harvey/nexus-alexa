/**
 * NexusSubstrate — the seam between the Alexa gateway/orchestrator and NexusOS Semantic.
 *
 * The real implementation (`RealNexusSubstrate`) is backed by the Nexus graph engine and
 * kinetic drivers (BiDi / CDP / UIA / UIAutomator2). The `FakeNexusSubstrate` here is a
 * deterministic in-memory world used for hermetic tests and fully-offline demo dry-runs.
 * Both honour the same semantic contract: discover → query → read → invoke → verify.
 */

import type {
  AxNode,
  Capability,
  GraphQuery,
  InvokeResult,
  Substrate,
  Verification,
} from "../types.js";
import { decide, tierForCapability } from "./security.js";

export interface NexusSubstrate {
  /** Which substrates are currently reachable/ready. */
  availableSubstrates(): Promise<Substrate[]>;
  /** Semantic search over a substrate's accessibility graph. */
  query(q: GraphQuery): Promise<AxNode[]>;
  /** Read the current state of a single node (for verification). */
  read(substrate: Substrate, axId: string): Promise<AxNode | null>;
  /** Discover executable capabilities, optionally scoped/filtered. */
  capabilities(substrate: Substrate, find?: string): Promise<Capability[]>;
  /**
   * Invoke a capability. `confirm` must be true for CONFIRM-tier actions or the
   * call is blocked (requireConfirm=true) and NO substrate contact occurs.
   */
  invoke(opts: {
    substrate: Substrate;
    capabilityId: string;
    inputs?: Record<string, string | number | boolean>;
    confirm?: boolean;
  }): Promise<InvokeResult>;
  /** Verify a node reached an expected state via semantic re-read. */
  verify(opts: {
    substrate: Substrate;
    capabilityId: string;
    axId: string;
    expected: Record<string, string | number | boolean | null>;
  }): Promise<Verification>;
}

// ---------------------------------------------------------------------------
// Deterministic in-memory world
// ---------------------------------------------------------------------------

interface FakeNode extends AxNode {
  substrate: Substrate;
  capabilityId?: string;
  inputs?: string[];
}

/**
 * A small but realistic multi-app world:
 *  - firefox: a CRM (Acme account + notes) and a design-system page (tokens)
 *  - chrome:  a review dashboard (figures)
 *  - windows: a desktop notes/editor app (populate a brief)
 * plus a billing toggle that is intentionally CONFIRM-tier.
 */
function seedWorld(): FakeNode[] {
  return [
    // Firefox — CRM
    {
      substrate: "firefox",
      axId: "crm.acme.notes",
      role: "region",
      name: "Acme account notes",
      state: { text: "Renewal due Q4. Wants SSO + audit log. Champion: R. Vale." },
    },
    {
      substrate: "firefox",
      axId: "crm.theme.toggle",
      role: "switch",
      name: "Appearance theme",
      state: { value: "light" },
      capabilityId: "set_theme",
      inputs: ["theme"],
    },
    // Firefox — design system
    {
      substrate: "firefox",
      axId: "ds.tokens",
      role: "region",
      name: "Design tokens",
      state: {
        "color.primary": "#4F46E5",
        "color.surface": "#0B0B0F",
        "space.md": "16px",
        "radius.card": "12px",
      },
    },
    // Chrome — review dashboard
    {
      substrate: "chrome",
      axId: "dash.figures",
      role: "region",
      name: "Review figures",
      state: { mrr: "$41,600", churn: "1.8%", nps: "62" },
    },
    // Windows — desktop notes/editor
    {
      substrate: "windows",
      axId: "notes.body",
      role: "textbox",
      name: "Review brief body",
      state: { value: "" },
      capabilityId: "populate_brief",
      inputs: ["text"],
    },
    // Firefox — billing (CONFIRM tier via keyword)
    {
      substrate: "firefox",
      axId: "billing.alerts",
      role: "switch",
      name: "Enable weekly billing alerts",
      state: { value: "off" },
      capabilityId: "enable_billing_alerts",
      inputs: ["enabled"],
    },
  ];
}

export class FakeNexusSubstrate implements NexusSubstrate {
  private nodes: FakeNode[];
  private ready: Substrate[];

  constructor(opts?: { ready?: Substrate[] }) {
    this.nodes = seedWorld();
    this.ready = opts?.ready ?? ["firefox", "chrome", "windows"];
  }

  async availableSubstrates(): Promise<Substrate[]> {
    return [...this.ready];
  }

  async query(q: GraphQuery): Promise<AxNode[]> {
    const term = (q.find ?? "").toLowerCase();
    return this.nodes
      .filter((n) => n.substrate === q.substrate)
      .filter((n) => (q.role ? n.role === q.role : true))
      .filter((n) =>
        term
          ? n.name.toLowerCase().includes(term) ||
            n.axId.toLowerCase().includes(term)
          : true,
      )
      .map(stripInternal);
  }

  async read(substrate: Substrate, axId: string): Promise<AxNode | null> {
    const n = this.nodes.find((x) => x.substrate === substrate && x.axId === axId);
    return n ? stripInternal(n) : null;
  }

  async capabilities(substrate: Substrate, find?: string): Promise<Capability[]> {
    const term = (find ?? "").toLowerCase();
    return this.nodes
      .filter((n) => n.substrate === substrate && n.capabilityId)
      .filter((n) =>
        term ? n.name.toLowerCase().includes(term) || n.capabilityId!.includes(term) : true,
      )
      .map((n) => ({
        capabilityId: n.capabilityId!,
        substrate: n.substrate,
        name: n.name,
        role: n.role,
        tier: tierForCapability({
          role: n.role,
          name: n.name,
          inputKeys: n.inputs ?? [],
        }),
        inputs: n.inputs,
      }));
  }

  async invoke(opts: {
    substrate: Substrate;
    capabilityId: string;
    inputs?: Record<string, string | number | boolean>;
    confirm?: boolean;
  }): Promise<InvokeResult> {
    const n = this.nodes.find(
      (x) => x.substrate === opts.substrate && x.capabilityId === opts.capabilityId,
    );
    if (!n) {
      return {
        ok: false,
        requireConfirm: false,
        reason: `capability ${opts.capabilityId} not found on ${opts.substrate}`,
        tier: "READ",
      };
    }
    const tier = tierForCapability({
      role: n.role,
      name: n.name,
      inputKeys: n.inputs ?? [],
    });
    // The gate runs BEFORE any state mutation — mirrors invokeCapability() in Nexus.
    const decision = decide({
      tier,
      capabilityId: n.capabilityId!,
      role: n.role,
      name: n.name,
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
    // Passed the gate — apply the deterministic state change.
    applyEffect(n, opts.inputs);
    return {
      ok: true,
      requireConfirm: false,
      reason: "ok",
      tier,
      observed: stripInternal(n),
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
      detail: pass
        ? "observed state matches expected"
        : "observed state does not match expected",
    };
  }
}

function applyEffect(
  n: FakeNode,
  inputs?: Record<string, string | number | boolean>,
): void {
  n.state = n.state ?? {};
  switch (n.capabilityId) {
    case "set_theme":
      n.state.value = String(inputs?.theme ?? "dark");
      break;
    case "populate_brief":
      n.state.value = String(inputs?.text ?? "");
      break;
    case "enable_billing_alerts":
      n.state.value = inputs?.enabled === false ? "off" : "on";
      break;
    default:
      break;
  }
}

function stripInternal(n: FakeNode): AxNode {
  return {
    axId: n.axId,
    role: n.role,
    name: n.name,
    state: n.state ? { ...n.state } : undefined,
  };
}
