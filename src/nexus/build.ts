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
  /**
   * Drive the `firefox` substrate as REAL via the direct WebDriver BiDi driver
   * (Nexus BiDi client + geckodriver) against this web app. Takes precedence over
   * a Nexus-MCP binding for firefox. Requires geckodriver on 4444 + Firefox.
   */
  webApp?: {
    baseUrl: string;
    webDriverBase?: string;
    bidiOrigin?: string;
  };
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
    const webApp = process.env.NEXUS_ALEXA_WEBAPP
      ? { baseUrl: process.env.NEXUS_ALEXA_WEBAPP }
      : undefined;
    return { real, nexus, webApp };
  }
  if (process.env.NEXUS_ALEXA_WEBAPP) {
    return { webApp: { baseUrl: process.env.NEXUS_ALEXA_WEBAPP } };
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

/**
 * Async builder that additionally supports driving `firefox` as a REAL web substrate via the
 * direct BiDi driver (dynamically imported so the core build/tests don't depend on it). When
 * `config.webApp` is set, firefox is bound to a live FirefoxSubstrate; everything else follows
 * the same rules as buildSubstrate.
 */
export async function buildSubstrateAsync(config: SubstrateConfig): Promise<BuiltSubstrate> {
  const base = buildSubstrate(config);
  if (!config.webApp) return base;

  // Dynamically import the real Firefox driver (excluded from the core tsconfig so the
  // hermetic build/tests never pull in the Nexus source it depends on). The import
  // specifier is built at runtime so tsc does not eagerly resolve it into the program.
  const mod: any = await import(["./", "firefox.js"].join(""));
  const FirefoxSubstrate = mod.FirefoxSubstrate as new (o: {
    baseUrl: string;
    webDriverBase?: string;
    bidiOrigin?: string;
  }) => import("./substrate.js").NexusSubstrate & { connect(): Promise<void>; close(): Promise<void> };
  const fx = new FirefoxSubstrate({
    baseUrl: config.webApp.baseUrl,
    webDriverBase: config.webApp.webDriverBase,
    bidiOrigin: config.webApp.bidiOrigin,
  });
  await fx.connect();

  // Rebuild bindings with firefox -> real BiDi driver.
  const all = manifestSubstrates();
  const fake = new FakeNexusSubstrate({ ready: "all" });
  const real = new Set(config.real ?? []);
  const closables: Array<{ close(): Promise<void> }> = [fx];

  const bindings: Binding[] = all.map((substrate) => {
    if (substrate === "firefox") {
      return { substrate, impl: fx, backing: "real" };
    }
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
