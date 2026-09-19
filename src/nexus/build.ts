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
  /**
   * Drive the `windows` substrate as REAL via NexusOS Semantic's Windows UIA bridge (operating a
   * native app such as Notepad). Requires Windows + PowerShell. When set, `windows` is bound to a
   * live WindowsSubstrate.
   */
  desktop?: {
    /** Native app to operate. Default: classic System32 Notepad. */
    appPath?: string;
    processName?: string;
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
    const desktop = process.env.NEXUS_ALEXA_DESKTOP === "1" ? {} : undefined;
    return { real, nexus, webApp, desktop };
  }
  const envWebApp = process.env.NEXUS_ALEXA_WEBAPP;
  const envDesktop = process.env.NEXUS_ALEXA_DESKTOP === "1";
  if (envWebApp || envDesktop) {
    return {
      webApp: envWebApp ? { baseUrl: envWebApp } : undefined,
      desktop: envDesktop ? {} : undefined,
    };
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
 * Async builder that additionally supports driving substrates as REAL:
 *   - `config.webApp`  -> firefox via the vendored Nexus BiDi client (live browser).
 *   - `config.desktop` -> windows via the vendored Nexus Windows UIA bridge (live native app).
 * Both drivers are dynamically imported (import specifier built at runtime) so the hermetic
 * build/tests never pull them in. Everything else follows the same rules as buildSubstrate.
 */
export async function buildSubstrateAsync(config: SubstrateConfig): Promise<BuiltSubstrate> {
  if (!config.webApp && !config.desktop) return buildSubstrate(config);

  const closables: Array<{ close(): Promise<void> }> = [];
  const realImpls = new Map<Substrate, NexusSubstrate>();

  if (config.webApp) {
    const mod: any = await import(["./", "firefox.js"].join(""));
    const FirefoxSubstrate = mod.FirefoxSubstrate as new (o: {
      baseUrl: string;
      webDriverBase?: string;
      bidiOrigin?: string;
    }) => NexusSubstrate & { connect(): Promise<void>; close(): Promise<void> };
    const fx = new FirefoxSubstrate({
      baseUrl: config.webApp.baseUrl,
      webDriverBase: config.webApp.webDriverBase,
      bidiOrigin: config.webApp.bidiOrigin,
    });
    await fx.connect();
    closables.push(fx);
    realImpls.set("firefox", fx);
  }

  if (config.desktop) {
    const mod: any = await import(["./", "windows.js"].join(""));
    const WindowsSubstrate = mod.WindowsSubstrate as new (o: {
      appPath?: string;
      processName?: string;
    }) => NexusSubstrate & { connect(): Promise<void>; close(): Promise<void> };
    const win = new WindowsSubstrate({
      appPath: config.desktop.appPath,
      processName: config.desktop.processName,
    });
    await win.connect();
    closables.push(win);
    realImpls.set("windows", win);
  }

  const all = manifestSubstrates();
  const fake = new FakeNexusSubstrate({ ready: "all" });
  const real = new Set(config.real ?? []);

  const bindings: Binding[] = all.map((substrate) => {
    const liveImpl = realImpls.get(substrate);
    if (liveImpl) {
      return { substrate, impl: liveImpl, backing: "real" };
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
