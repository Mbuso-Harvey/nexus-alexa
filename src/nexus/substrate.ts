/**
 * NexusSubstrate — the seam between the Alexa gateway/orchestrator and NexusOS Semantic.
 *
 * The real implementation (RealNexusSubstrate, added as Nexus drivers are merged) is backed
 * by the Nexus graph engine + kinetic drivers (BiDi / CDP / UIA / AX / UIAutomator2 / WDA).
 * The FakeNexusSubstrate here is a deterministic in-memory world (seeded from the capability
 * manifest) used for hermetic tests and fully-offline demo dry-runs. Both honour the same
 * contract: discover -> query -> read -> invoke (tier-gated) -> verify.
 *
 * Readiness: the fake can expose either just the "live" substrates or all manifest substrates,
 * so we can rehearse the full vision now and flip capabilities live as they connect.
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
import {
  CAPABILITY_MANIFEST,
  liveSubstrates,
  manifestSubstrates,
  type Readiness,
} from "./manifest.js";
import { applyEffect, seedWorld, stripInternal, type WorldNode } from "./world.js";

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
   * Invoke a capability. `confirm` must be true for CONFIRM-tier actions or the call is
   * blocked (requireConfirm=true) and NO substrate contact occurs.
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

/** Resolve the effective tier for a capability: explicit manifest override, else derived. */
function tierFor(capabilityId: string, role: string, name: string, inputs: string[]) {
  const spec = CAPABILITY_MANIFEST.find((c) => c.capabilityId === capabilityId);
  if (spec?.tier) return spec.tier;
  return tierForCapability({ role, name, inputKeys: inputs });
}

export interface FakeOptions {
  /**
   * "live"     -> only substrates that have a live manifest capability are available.
   * "all"      -> every manifest substrate is available (rehearse the full vision).
   * Substrate[]-> explicit set.
   */
  ready?: "live" | "all" | Substrate[];
}

export class FakeNexusSubstrate implements NexusSubstrate {
  private nodes: WorldNode[];
  private ready: Substrate[];

  constructor(opts?: FakeOptions) {
    this.nodes = seedWorld();
    const r = opts?.ready ?? "all";
    this.ready =
      r === "live" ? liveSubstrates() : r === "all" ? manifestSubstrates() : r;
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
          ? n.name.toLowerCase().includes(term) || n.axId.toLowerCase().includes(term)
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
        tier: tierFor(n.capabilityId!, n.role, n.name, n.inputs ?? []),
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
    const tier = tierFor(n.capabilityId!, n.role, n.name, n.inputs ?? []);
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

export { type Readiness };
