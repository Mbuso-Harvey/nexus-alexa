/**
 * Nexus capability manifest — the full cross-substrate vision with HONEST readiness labels.
 *
 * Each capability declares a `readiness` using four explicit, non-overlapping states so the
 * demo and docs never overstate what runs:
 *   - "live-demo"    : actually executes live in THIS submitted demo configuration, on this
 *                      machine, through real Nexus. (Firefox web + Windows native brief.)
 *   - "implemented"  : implemented in NexusOS Semantic and runnable on this machine, but NOT
 *                      part of the live demo path (e.g. Chrome/CDP — Nexus ships it; we simply
 *                      don't stand Chrome up in the recorded demo).
 *   - "roadmap"      : contract is fixed and modelled by the simulated substrate; the real
 *                      Nexus driver connects through the same seam as it lands. Shown as
 *                      clearly-labelled roadmap, never presented as working.
 *
 * TRUTHFULNESS RULE: only "live-demo" capabilities are ever presented as executing in the
 * video. "implemented" is described as "Nexus can, not shown live here"; "roadmap" as future.
 * The composite substrate independently reports per-substrate backing (real/fake) at runtime,
 * so on-screen labels reflect what is actually running.
 */

import type { SecurityTier, Substrate } from "../types.js";

export type Readiness = "live-demo" | "implemented" | "roadmap";

export interface CapabilitySpec {
  capabilityId: string;
  substrate: Substrate;
  /** Agent/voice-facing name. */
  name: string;
  /** ARIA-ish role used for tier classification + rendering. */
  role: string;
  /** Named inputs (drive PROPOSE classification and the client form/voice slots). */
  inputs?: string[];
  /** Explicit tier override; otherwise derived from role+name via security.ts. */
  tier?: SecurityTier;
  /** Where it lives (route / window / screen / app). */
  location?: string;
  /** Node the capability reads/writes, for verification. */
  axId: string;
  readiness: Readiness;
  /** Short "why this matters" line for the manifest/demo panel. */
  blurb?: string;
}

/**
 * The full manifest. Web + Desktop + Mobile, spanning the six Nexus environments.
 * Kept intentionally broad: this is the surface Alexa can eventually reach through Nexus.
 */
export const CAPABILITY_MANIFEST: CapabilitySpec[] = [
  // ------------------------------------------------------------------ Firefox (web)
  {
    capabilityId: "set_theme",
    substrate: "firefox",
    name: "Set appearance theme",
    role: "combobox",
    inputs: ["theme"],
    axId: "crm.theme.toggle",
    location: "/settings/appearance",
    readiness: "live-demo",
    blurb: "Semantic control: find + set a setting by intent, no pixel hunting.",
  },
  {
    capabilityId: "extract_design_tokens",
    substrate: "firefox",
    name: "Extract design tokens & layout",
    role: "region",
    axId: "ds.tokens",
    location: "/design-system",
    readiness: "live-demo",
    blurb: "Design intelligence: read a site's real DTCG tokens + layout, not a screenshot.",
  },
  {
    capabilityId: "enable_billing_alerts",
    substrate: "firefox",
    name: "Enable weekly billing alerts",
    role: "switch",
    inputs: ["enabled"],
    axId: "billing.alerts",
    location: "/settings/billing",
    readiness: "live-demo",
    blurb: "Safety boundary: billing keyword forces CONFIRM before Nexus proceeds.",
  },
  {
    capabilityId: "book_travel",
    substrate: "firefox",
    name: "Book travel / reservation",
    role: "button",
    inputs: ["destination", "date", "amount"],
    tier: "CONFIRM",
    axId: "travel.book",
    location: "/travel/checkout",
    readiness: "roadmap",
    blurb: "Purchasing with a hard human-approval gate: 'This will charge $416 — confirm?'",
  },

  // ------------------------------------------------------------------ Chrome (web, CDP)
  {
    capabilityId: "read_dashboard_figures",
    substrate: "chrome",
    name: "Read authenticated dashboard figures",
    role: "region",
    axId: "dash.figures",
    location: "authenticated tab",
    readiness: "implemented",
    blurb: "Nexus ships a Chrome CDP substrate; not stood up in this recorded demo.",
  },
  {
    capabilityId: "compose_email",
    substrate: "chrome",
    name: "Compose & queue an email",
    role: "textbox",
    inputs: ["to", "subject", "body"],
    axId: "mail.compose",
    location: "webmail",
    readiness: "roadmap",
    blurb: "Draft prepared semantically; sending is CONFIRM-gated.",
  },

  // ------------------------------------------------------------------ Windows (desktop, UIA)
  {
    capabilityId: "populate_brief",
    substrate: "windows",
    name: "Write the brief into the native editor",
    role: "textbox",
    inputs: ["text"],
    axId: "windows.brief",
    location: "Notepad (System32)",
    readiness: "live-demo",
    blurb: "Native desktop kinetics via Nexus UIA — the same semantic model as the web.",
  },
  {
    capabilityId: "open_app",
    substrate: "windows",
    name: "Open a desktop application",
    role: "button",
    inputs: ["app"],
    axId: "shell.launch",
    location: "OS shell",
    readiness: "roadmap",
    blurb: "Cross-app orchestration on the desktop, driven from one voice request.",
  },

  // ------------------------------------------------------------------ macOS (desktop, AX)
  {
    capabilityId: "macos_populate_note",
    substrate: "macos",
    name: "Add a note (macOS)",
    role: "textbox",
    inputs: ["text"],
    axId: "macos.notes.body",
    location: "Notes.app",
    readiness: "roadmap",
    blurb: "Same semantic contract on macOS AX — one model, every desktop.",
  },

  // ------------------------------------------------------------------ Android (mobile, UIAutomator2)
  {
    capabilityId: "android_set_reminder",
    substrate: "android",
    name: "Set a reminder on the phone",
    role: "button",
    inputs: ["text", "time"],
    axId: "android.reminder.save",
    location: "Clock/Calendar app",
    readiness: "roadmap",
    blurb: "Cross-device: the task follows you onto the phone.",
  },
  {
    capabilityId: "android_boarding_pass",
    substrate: "android",
    name: "Open boarding pass state",
    role: "button",
    axId: "android.wallet.pass",
    location: "Wallet app",
    readiness: "roadmap",
    blurb: "Verified mobile state, not a screenshot guess.",
  },

  // ------------------------------------------------------------------ iOS (mobile, WDA)
  {
    capabilityId: "ios_add_calendar",
    substrate: "ios",
    name: "Add a calendar event (iOS)",
    role: "button",
    inputs: ["title", "time"],
    axId: "ios.calendar.add",
    location: "Calendar.app",
    readiness: "roadmap",
    blurb: "Rounds out full six-substrate reach as WDA wiring lands.",
  },
];

/** Convenience: capabilities filtered by readiness. */
export function capabilitiesByReadiness(readiness: Readiness): CapabilitySpec[] {
  return CAPABILITY_MANIFEST.filter((c) => c.readiness === readiness);
}

/** All substrates that appear in the manifest. */
export function manifestSubstrates(): Substrate[] {
  return [...new Set(CAPABILITY_MANIFEST.map((c) => c.substrate))];
}

/** Substrates that run live in this demo configuration (Firefox + Windows). */
export function liveSubstrates(): Substrate[] {
  return [...new Set(capabilitiesByReadiness("live-demo").map((c) => c.substrate))];
}

