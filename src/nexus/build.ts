/**
 * Substrate builder — assemble the NexusSubstrate the server/orchestrator run against,
 * from a simple config. This is the single place where "which substrate is real vs
 * simulated" is decided, so bringing a substrate online is a one-line config change.
 *
 * Config sources (in priority order):
 *   1. A JSON config file path (NEXUS_ALEXA_CONFIG env or --config flag).
 *   2. Env: NEXUS_ALEXA_REAL="firefox,chrome" + NEXUS_CMD/NEXUS_ARGS for the Nexus server.
 *   3. Default: everything simulated (FakeNexusSubstrate over all manifest substrates).
 *
 * When a substrate is marked "real", it is served by a RealNexusSubstrate bound to a Nexus
 * MCP server launched via `nexus.command`/`nexus.args`. Everything else is simulated and
 * clearly labeled. Nothing upstream changes when a substrate flips real.
 */

import { readFileSync, existsSync } from "node:fs";
import type { Substrate } from "../types.js";
import { FakeNexusSubstrate, type NexusSubstrate } from "./substrate.js";
import { CompositeSubstrate, type Binding } from "./composite.js";
import { RealNexusSubstrate } from "./real.js";
import { manifestSubstrates } from "./manifest.js";

export interface NexusServerSpec {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SubstrateConfig {
  /** Substrates served by a real Nexus MCP server. */
  real?: Substrate[];
  /** How to launch the Nexus MCP server for the real substrates. */
  nexus?: NexusServerSpec;
  /** Restrict the simulated set (default: all manifest substrates not marked real). */
  simulated?: Substrate[];
}

export interface BuiltSubstrate {
  substrate: NexusSubstrate;
  composite: CompositeSubstrate;
  /** For teardown of any real adapters. */
  closables: Array<{ close(): Promise<void> }>;
}

export function loadConfig(configPath?: string): SubstrateConfig {
  const path = configPath ?? process.env.NEXUS_ALEXA_CONFIG;
  if (path && existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as SubstrateConfig;
    } catch {
      // fall through to env/default
    }
  }
  const realEnv = process.env.NEXUS_ALEXA_REAL;
  if (realEnv) {
    const real = realEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as Substrate[];
    const nexus: NexusServerSpec | undefined = process.env.NEXUS_CMD
      ? {
          command: process.env.NEXUS_CMD,
          args: process.env.NEXUS_ARGS ? process.env.NEXUS_ARGS.split(" ") : undefined,
        }
      : undefined;
    return { real, nexus };
  }
  return {};
}

export function buildSubstrate(config: SubstrateConfig): BuiltSubstrate {
  const all = manifestSubstrates();
  const real = new Set(config.real ?? []);
  const closables: Array<{ close(): Promise<void> }> = [];

  // One shared fake instance backs every simulated substrate (shared world state).
  const fake = new FakeNexusSubstrate({ ready: "all" });

  const bindings: Binding[] = all.map((substrate) => {
    if (real.has(substrate) && config.nexus) {
      const impl = new RealNexusSubstrate({
        command: config.nexus.command,
        args: config.nexus.args,
        env: config.nexus.env,
        substrate,
      });
      closables.push(impl);
      return { substrate, impl, backing: "real" };
    }
    return { substrate, impl: fake, backing: "fake" };
  });

  const composite = new CompositeSubstrate(bindings);
  return { substrate: composite, composite, closables };
}
