/**
 * Nexus capability manifest — the full cross-substrate vision, decoupled from wiring status.
 *
 * This is the single source of truth for WHAT Nexus can do across every substrate. Each
 * capability declares a `readiness`:
 *   - "live"    : wired to a real Nexus driver and demoable now.
 *   - "coming"  : contract is fixed and the fake substrate models it; the real Nexus
 *                 driver is being merged. Flip to "live" when connected — no other code
 *                 changes, because everything upstream (orchestrator, planner, Alexa client,
 *                 visualizer) is driven off this manifest and the NexusSubstrate interface.
 *
 * Design intent (per product direction): plan and build for the FULL breadth now. As real
 * Nexus functionality lands, capabilities flip live and the demo/story widen automatically.
 * The video only ever PRESENTS "live" capabilities as working; "coming" capabilities are
 * shown as clearly-labeled roadmap, never faked.
 */

import type { SecurityTier, Substrate } from "../types.js";

export type Readiness = "live" | "coming";

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
    readiness: "live",
    blurb: "Semantic control: find + set a setting by intent, no pixel hunting.",
  },
  {
    capabilityId: "extract_design_tokens",
    substrate: "firefox",
    name: "Extract design tokens & layout",
    role: "region",
    axId: "ds.tokens",
    location: "/design-system",
    readiness: "live",
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
    readiness: "live",
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
    readiness: "coming",
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
    readiness: "live",
    blurb: "CDP read on a logged-in tab — reach content vision agents can't reliably parse.",
  },
  {
    capabilityId: "compose_email",
    substrate: "chrome",
    name: "Compose & queue an email",
    role: "textbox",
    inputs: ["to", "subject", "body"],
    axId: "mail.compose",
    location: "webmail",
    readiness: "coming",
    blurb: "Draft prepared semantically; sending is CONFIRM-gated.",
  },

  // ------------------------------------------------------------------ Windows (desktop, UIA)
  {
    capabilityId: "populate_brief",
    substrate: "windows",
    name: "Populate a brief in the desktop editor",
    role: "textbox",
    inputs: ["text"],
    axId: "notes.body",
    location: "Notes.exe",
    readiness: "live",
    blurb: "Native desktop kinetics via UIA — the same semantic model as the web.",
  },
  {
    capabilityId: "open_app",
    substrate: "windows",
    name: "Open a desktop application",
    role: "button",
    inputs: ["app"],
    axId: "shell.launch",
    location: "OS shell",
    readiness: "coming",
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
    readiness: "coming",
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
    readiness: "coming",
    blurb: "Cross-device: the task follows you onto the phone.",
  },
  {
    capabilityId: "android_boarding_pass",
    substrate: "android",
    name: "Open boarding pass state",
    role: "button",
    axId: "android.wallet.pass",
    location: "Wallet app",
    readiness: "coming",
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
    readiness: "coming",
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

/** Substrates that have at least one live capability. */
export function liveSubstrates(): Substrate[] {
  return [...new Set(capabilitiesByReadiness("live").map((c) => c.substrate))];
}
