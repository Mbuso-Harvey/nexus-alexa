/**
 * Plan model + intent parsing.
 *
 * A "plan" is the ordered sequence of substrate steps Nexus will execute to satisfy one
 * spoken objective. Intent parsing is deliberately deterministic (keyword/scenario based)
 * so the demo is repeatable; an LLM/Bedrock NLU can be slotted in behind the same
 * `PlanBuilder` interface later without changing the orchestrator or client.
 */

import type { Substrate } from "./types.js";

export type StepKind = "read" | "query" | "invoke" | "verify";

export interface PlanStep {
  id: string;
  /** One-line human/voice description ("Read the Acme account notes"). */
  say: string;
  substrate: Substrate;
  kind: StepKind;
  /** For query/read/verify: the target node. For invoke: the capability. */
  target: string;
  find?: string;
  capabilityId?: string;
  inputs?: Record<string, string | number | boolean>;
  /** Expected post-state for verification steps. */
  expected?: Record<string, string | number | boolean | null>;
  /** True if this step is expected to hit the CONFIRM gate. */
  sensitive?: boolean;
}

export interface Plan {
  objective: string;
  /** Short spoken framing of what Nexus is about to do. */
  intro: string;
  steps: PlanStep[];
  /** Spoken summary template on success. */
  outro: string;
}

export interface PlanBuilder {
  build(objective: string): Plan | null;
}

/**
 * Deterministic scenario planner for the demo world (see FakeNexusSubstrate / the live
 * demo SaaS). Recognises the "get me set up for the review" family of requests and any
 * request mentioning theme/billing. Falls back to null when it cannot form a plan.
 */
export class ScenarioPlanBuilder implements PlanBuilder {
  constructor(private readonly opts: { windowsLive?: boolean } = {}) {}

  build(objective: string): Plan | null {
    const o = objective.toLowerCase();

    const wantsReview =
      /(set|get).*(up|ready)/.test(o) ||
      o.includes("review") ||
      o.includes("meeting") ||
      o.includes("acme");
    const wantsTheme = o.includes("dark") || o.includes("theme");
    const wantsBilling = o.includes("billing") || o.includes("alert");

    if (wantsReview) {
      return this.reviewPrepPlan(objective, { includeBilling: wantsBilling || true });
    }
    if (wantsTheme || wantsBilling) {
      return this.settingsPlan(objective, { theme: wantsTheme, billing: wantsBilling });
    }
    return null;
  }

  private reviewPrepPlan(objective: string, opts: { includeBilling: boolean }): Plan {
    const steps: PlanStep[] = [
      {
        id: "s1",
        say: "Open the CRM and read the Acme account notes",
        substrate: "firefox",
        kind: "read",
        target: "crm.acme.notes",
      },
      {
        id: "s2",
        say: "Extract the design system's tokens and layout",
        substrate: "firefox",
        kind: "read",
        target: "ds.tokens",
      },
      {
        id: "s3",
        say: "Read the current review figures from the dashboard",
        substrate: "chrome",
        kind: "read",
        target: "dash.figures",
      },
      {
        id: "s4",
        say: "Populate the review brief in the desktop editor",
        substrate: "windows",
        kind: "invoke",
        target: this.opts.windowsLive ? "windows.brief" : "notes.body",
        capabilityId: "populate_brief",
        inputs: {
          text: "Acme review brief prepared by Nexus. See CRM notes, design tokens, and latest figures.",
        },
        expected: this.opts.windowsLive
          ? {
              value: "Acme review brief prepared by Nexus. See CRM notes, design tokens, and latest figures.",
              dirty: true,
              hasEditor: true,
            }
          : {
              value: "Acme review brief prepared by Nexus. See CRM notes, design tokens, and latest figures.",
            },
      },
    ];

    if (opts.includeBilling) {
      steps.push({
        id: "s5",
        say: "Enable weekly billing alerts (sensitive — will ask to confirm)",
        substrate: "firefox",
        kind: "invoke",
        target: "billing.alerts",
        capabilityId: "enable_billing_alerts",
        inputs: { enabled: true },
        expected: { value: "on" },
        sensitive: true,
      });
    }

    return {
      objective,
      intro:
        "On it. I'll get you set up for the Acme review across your browser, dashboard, and desktop.",
      steps,
      outro: "You're set for the Acme review.",
    };
  }

  private settingsPlan(
    objective: string,
    opts: { theme: boolean; billing: boolean },
  ): Plan {
    const steps: PlanStep[] = [];
    if (opts.theme) {
      steps.push({
        id: "s1",
        say: "Switch the app theme to dark",
        substrate: "firefox",
        kind: "invoke",
        target: "crm.theme.toggle",
        capabilityId: "set_theme",
        inputs: { theme: "dark" },
        expected: { value: "dark" },
      });
    }
    if (opts.billing) {
      steps.push({
        id: `s${steps.length + 1}`,
        say: "Enable weekly billing alerts (sensitive — will ask to confirm)",
        substrate: "firefox",
        kind: "invoke",
        target: "billing.alerts",
        capabilityId: "enable_billing_alerts",
        inputs: { enabled: true },
        expected: { value: "on" },
        sensitive: true,
      });
    }
    return {
      objective,
      intro: "Sure. Let me take care of that in the app.",
      steps,
      outro: "Done.",
    };
  }
}

/**
 * Live plan for the genuine Nexus product runtime. The Alexa layer names only semantic goals;
 * RealNexusSubstrate resolves them through Nexus graph, live-read, safety, and desktop tools.
 */
export class LiveWebPlanBuilder implements PlanBuilder {
  constructor(private readonly opts: { includeWindows?: boolean } = {}) {}

  build(objective: string): Plan | null {
    const o = objective.toLowerCase();
    const relevant =
      o.includes("dark") ||
      o.includes("theme") ||
      o.includes("design") ||
      o.includes("token") ||
      o.includes("set up") ||
      o.includes("set me up") ||
      o.includes("get me") ||
      o.includes("review");
    if (!relevant) return null;

    const brief =
      "Acme review brief - prepared from live application context.\n" +
      "Design tokens captured and appearance verified.\n" +
      "Sensitive actions remain human-approved.";
    const steps: PlanStep[] = [
      {
        id: "s1",
        say: "Map the app's semantic controls",
        substrate: "firefox",
        kind: "query",
        target: "Toggle theme",
        find: "Toggle theme",
        capabilityId: "map_app_semantics",
      },
      {
        id: "s2",
        say: "Extract the app's design-token system",
        substrate: "firefox",
        kind: "read",
        target: "settings.tokens",
        capabilityId: "extract_design_tokens",
      },
      {
        id: "s3",
        say: "Read the current appearance from the live page",
        substrate: "firefox",
        kind: "read",
        target: "settings.theme",
        capabilityId: "read_current_theme",
      },
      {
        id: "s4",
        say: "Switch the appearance to dark and prove the result",
        substrate: "firefox",
        kind: "invoke",
        target: "settings.theme",
        capabilityId: "set_theme",
        expected: { value: "dark" },
      },
      {
        id: "s5",
        say: "Open a sensitive account dialog (I'll ask before acting)",
        substrate: "firefox",
        kind: "invoke",
        target: "safety.dialog",
        capabilityId: "open_sensitive_dialog",
        expected: { dialog: "open" },
        sensitive: true,
      },
    ];

    if (this.opts.includeWindows ?? true) {
      steps.push({
        id: "s6",
        say: "Carry the verified result into the native Windows editor",
        substrate: "windows",
        kind: "invoke",
        target: "windows.brief",
        capabilityId: "populate_brief",
        inputs: { text: brief },
        expected: { value: brief },
      });
    }

    return {
      objective,
      intro:
        "On it. I'll understand the app, verify the change, pause before anything sensitive, and carry the result into your desktop editor.",
      steps,
      outro: (this.opts.includeWindows ?? true)
        ? "Done. I understood the live app, extracted its design system, verified the appearance change, paused for your approval, and carried the result into the native editor."
        : "Done. I understood the live app, extracted its design system, verified the appearance change, and paused for your approval.",
    };
  }
}

/** Tries each builder in order; returns the first non-null plan. */
export class CompositePlanBuilder implements PlanBuilder {
  constructor(private readonly builders: PlanBuilder[]) {}
  build(objective: string): Plan | null {
    for (const b of this.builders) {
      const p = b.build(objective);
      if (p) return p;
    }
    return null;
  }
}

/** A planner that may do async work (e.g. call Bedrock). */
export interface AsyncPlanBuilder {
  buildAsync(objective: string): Promise<Plan | null>;
}

/**
 * Async composite: try an async planner (Bedrock) first for open-ended NL understanding, then
 * fall back to the deterministic sync planners so the demo works with or without AWS.
 * Also exposes which planner produced the plan (for truthful "planned by" labels).
 */
export class AsyncCompositePlanBuilder {
  constructor(
    private readonly asyncFirst: AsyncPlanBuilder | null,
    private readonly syncFallback: PlanBuilder,
    private readonly asyncLabel = "bedrock",
    private readonly syncLabel = "deterministic",
  ) {}

  async build(objective: string): Promise<{ plan: Plan | null; plannedBy: string }> {
    if (this.asyncFirst) {
      try {
        const p = await this.asyncFirst.buildAsync(objective);
        if (p) return { plan: p, plannedBy: this.asyncLabel };
      } catch {
        // fall through
      }
    }
    return { plan: this.syncFallback.build(objective), plannedBy: this.syncLabel };
  }
}
