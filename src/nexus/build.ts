/**
 * Builds the Alexa-facing substrate switchboard.
 *
 * In live mode every real substrate is routed through one shared RealNexusSubstrate and therefore
 * one genuine Nexus MCP stdio process. There is intentionally no direct Firefox or UIA path in
 * this layer. Fake substrates remain available only for hermetic tests and the labeled offline
 * simulator.
 */

import { existsSync, readFileSync } from "node:fs";
import type { Substrate } from "../types.js";
import { CompositeSubstrate, type Binding } from "./composite.js";
import { manifestSubstrates } from "./manifest.js";
import { RealNexusSubstrate } from "./real.js";
import { FakeNexusSubstrate, type NexusSubstrate } from "./substrate.js";

export interface NexusServerSpec {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** Origin already represented by the graph passed to the Nexus process. */
  baseUrl: string;
  desktopProcessName?: string;
}

export interface SubstrateConfig {
  /** Substrates served by the one genuine Nexus process. */
  real?: Substrate[];
  nexus?: NexusServerSpec;
  /** Restrict the simulated set (default: all manifest substrates not marked real). */
  simulated?: Substrate[];
}

export interface BuiltSubstrate {
  substrate: NexusSubstrate;
  composite: CompositeSubstrate;
  closables: Array<{ close(): Promise<void> }>;
}

export function loadConfig(configPath?: string): SubstrateConfig {
  const path = configPath ?? process.env.NEXUS_ALEXA_CONFIG;
  if (path) {
    if (!existsSync(path)) throw new Error(`Nexus config does not exist: ${path}`);
    return JSON.parse(readFileSync(path, "utf8")) as SubstrateConfig;
  }

  const command = process.env.NEXUS_CMD;
  if (command) {
    const real = (process.env.NEXUS_ALEXA_REAL ?? "firefox,windows")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean) as Substrate[];
    const baseUrl = process.env.NEXUS_ALEXA_TARGET;
    if (!baseUrl) throw new Error("NEXUS_ALEXA_TARGET is required when NEXUS_CMD is set");
    return {
      real,
      nexus: {
        command,
        args: process.env.NEXUS_ARGS ? JSON.parse(process.env.NEXUS_ARGS) : [],
        env: process.env.NEXUS_ENV ? JSON.parse(process.env.NEXUS_ENV) : undefined,
        cwd: process.env.NEXUS_CWD,
        baseUrl,
        desktopProcessName: process.env.NEXUS_DESKTOP_PROCESS ?? "notepad",
      },
    };
  }
  return {};
}

function assemble(config: SubstrateConfig): BuiltSubstrate {
  const all = manifestSubstrates();
  const real = new Set(config.real ?? []);
  const unknown = [...real].filter((substrate) => !all.includes(substrate));
  if (unknown.length) throw new Error(`Unknown real substrates: ${unknown.join(", ")}`);
  if (real.size > 0 && !config.nexus) {
    throw new Error("Live substrates require a genuine Nexus MCP runtime configuration");
  }

  const fake = new FakeNexusSubstrate({ ready: config.simulated ?? "all" });
  const closables: Array<{ close(): Promise<void> }> = [];
  let runtime: RealNexusSubstrate | undefined;
  if (config.nexus && real.size > 0) {
    runtime = new RealNexusSubstrate({
      command: config.nexus.command,
      args: config.nexus.args,
      env: config.nexus.env,
      cwd: config.nexus.cwd,
      substrates: [...real],
      baseUrl: config.nexus.baseUrl,
      desktopProcessName: config.nexus.desktopProcessName,
    });
    closables.push(runtime);
  }

  const bindings: Binding[] = all.map((substrate) =>
    real.has(substrate)
      ? { substrate, impl: runtime!, backing: "real" }
      : { substrate, impl: fake, backing: "fake" },
  );
  const composite = new CompositeSubstrate(bindings);
  return { substrate: composite, composite, closables };
}

/** Synchronous assembly is used by fake-only rehearsals. Live connection is lazy. */
export function buildSubstrate(config: SubstrateConfig): BuiltSubstrate {
  return assemble(config);
}

/** Live serve path: connect at startup and fail closed if the product runtime is unavailable. */
export async function buildSubstrateAsync(config: SubstrateConfig): Promise<BuiltSubstrate> {
  const built = assemble(config);
  for (const closable of built.closables) {
    if (closable instanceof RealNexusSubstrate) await closable.connect();
  }
  return built;
}
