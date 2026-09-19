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
        target: "notes.body",
        capabilityId: "populate_brief",
        inputs: {
          text: "Acme review brief prepared by Nexus. See CRM notes + design tokens + latest figures.",
        },
        expected: {
          value:
            "Acme review brief prepared by Nexus. See CRM notes + design tokens + latest figures.",
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
 * LiveWebPlanBuilder — plans that target the REAL Firefox web substrate bindings
 * (`settings.theme`, `settings.tokens`) so the live demo exercises genuine execution end to
 * end: read the theme, extract real design tokens, switch the theme, verify by re-read. Use
 * this planner when firefox is bound to the real FirefoxSubstrate.
 */
export class LiveWebPlanBuilder implements PlanBuilder {
  build(objective: string): Plan | null {
    const o = objective.toLowerCase();
    const relevant =
      o.includes("dark") ||
      o.includes("theme") ||
      o.includes("design") ||
      o.includes("token") ||
      o.includes("ticket") ||
      o.includes("workspace") ||
      o.includes("admin") ||
      o.includes("set up") ||
      o.includes("set me up") ||
      o.includes("get me") ||
      o.includes("review");
    if (!relevant) return null;

    // The full live web story: read → design intelligence → real create → context-aware
    // admin read → destructive CONFIRM beat → theme switch. Every step runs on real Firefox.
    return {
      objective,
      intro:
        "On it. I'll read the app, pull its design tokens, file a ticket, check the admin view, and switch it to dark — and I'll ask before anything risky.",
      steps: [
        {
          id: "s1",
          say: "Read the current appearance theme",
          substrate: "firefox",
          kind: "read",
          target: "settings.theme",
        },
        {
          id: "s2",
          say: "Extract the app's live design tokens",
          substrate: "firefox",
          kind: "read",
          target: "settings.tokens",
        },
        {
          id: "s3",
          say: "File a support ticket in the app",
          substrate: "firefox",
          kind: "invoke",
          target: "tickets.create",
          capabilityId: "tickets.create",
          inputs: {
            title: "Prepared by Nexus for the review",
            severity: "medium",
            body: "Filed via Alexa+ through Nexus Semantic.",
          },
          expected: { dialog: "open" },
        },
        {
          id: "s4",
          say: "Switch to the administrator identity and read the admin-only view",
          substrate: "firefox",
          kind: "read",
          target: "settings.adminView",
        },
        {
          id: "s5",
          say: "Reach the destructive 'Delete workspace' control (sensitive — I'll confirm first)",
          substrate: "firefox",
          kind: "invoke",
          target: "settings.deleteWorkspace",
          capabilityId: "settings.deleteWorkspace",
          expected: { dialog: "open" },
          sensitive: true,
        },
        {
          id: "s6",
          say: "Switch the appearance theme to dark",
          substrate: "firefox",
          kind: "invoke",
          target: "settings.theme",
          capabilityId: "settings.theme",
          inputs: { theme: "dark" },
          expected: { value: "dark" },
        },
        {
          // The cross-substrate crossing: carry the web work into a REAL native Windows app.
          id: "s7",
          say: "Write the review brief into the native Windows editor",
          substrate: "windows",
          kind: "invoke",
          target: "windows.brief",
          capabilityId: "populate_brief",
          inputs: {
            text:
              "Acme review brief - prepared by Nexus.\r\n" +
              "Renewal due Q4; wants SSO + audit log; budget approved.\r\n" +
              "Theme set to dark; design tokens captured; ticket filed.",
          },
          expected: { dirty: true, hasEditor: true },
        },
      ],
      outro:
        "Done. I read the web app, captured its design tokens, filed a ticket, verified the admin view, paused for your approval on the destructive action, switched it to dark, and wrote the brief into the native Windows editor.",
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
