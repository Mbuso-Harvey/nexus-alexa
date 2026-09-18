/**
 * CompositeSubstrate — route each substrate to a real or fake backing.
 *
 * This is the switchboard that lets the demo present the full cross-substrate vision while
 * being truthful about what runs for real. Each substrate is bound to a NexusSubstrate
 * implementation:
 *   - a RealNexusSubstrate (backed by a live Nexus MCP server / driver), or
 *   - the FakeNexusSubstrate (deterministic in-memory), clearly flagged as simulated.
 *
 * As the user brings more Nexus functionality online, we move a substrate from the fake
 * binding to a real binding here — one line — and nothing else in the system changes. Each
 * routed result is tagged with `backing` ("real" | "fake") so the client/visualizer can show
 * a truthful "live vs simulated" indicator per step.
 */

import type {
  AxNode,
  Capability,
  GraphQuery,
  InvokeResult,
  Substrate,
  Verification,
} from "../types.js";
import type { NexusSubstrate } from "./substrate.js";

export type Backing = "real" | "fake";

export interface Binding {
  substrate: Substrate;
  impl: NexusSubstrate;
  backing: Backing;
}

export class CompositeSubstrate implements NexusSubstrate {
  private readonly map = new Map<Substrate, Binding>();

  constructor(bindings: Binding[]) {
    for (const b of bindings) this.map.set(b.substrate, b);
  }

  /** Which backing serves a substrate (for truthful "live vs simulated" labels). */
  backingOf(substrate: Substrate): Backing | null {
    return this.map.get(substrate)?.backing ?? null;
  }

  private impl(substrate: Substrate): NexusSubstrate {
    const b = this.map.get(substrate);
    if (!b) throw new Error(`no binding for substrate: ${substrate}`);
    return b.impl;
  }

  async availableSubstrates(): Promise<Substrate[]> {
    return [...this.map.keys()];
  }

  async query(q: GraphQuery): Promise<AxNode[]> {
    return this.impl(q.substrate).query(q);
  }

  async read(substrate: Substrate, axId: string): Promise<AxNode | null> {
    return this.impl(substrate).read(substrate, axId);
  }

  async capabilities(substrate: Substrate, find?: string): Promise<Capability[]> {
    return this.impl(substrate).capabilities(substrate, find);
  }

  async invoke(opts: {
    substrate: Substrate;
    capabilityId: string;
    inputs?: Record<string, string | number | boolean>;
    confirm?: boolean;
  }): Promise<InvokeResult> {
    return this.impl(opts.substrate).invoke(opts);
  }

  async verify(opts: {
    substrate: Substrate;
    capabilityId: string;
    axId: string;
    expected: Record<string, string | number | boolean | null>;
  }): Promise<Verification> {
    return this.impl(opts.substrate).verify(opts);
  }
}
