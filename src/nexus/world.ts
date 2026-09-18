/**
 * Deterministic in-memory world backing FakeNexusSubstrate.
 *
 * Seeded from the capability manifest so EVERY declared capability (live and coming) is
 * modeled with a real node + verifiable state transition. This lets us build and rehearse
 * the full cross-substrate experience offline; as real Nexus drivers land, a
 * RealNexusSubstrate replaces the fake per-substrate without touching the orchestrator,
 * planner, Alexa client, or visualizer.
 */

import type { AxNode, Substrate } from "../types.js";

export interface WorldNode extends AxNode {
  substrate: Substrate;
  capabilityId?: string;
  inputs?: string[];
}

/** Rich, believable content for the demo world across all six substrates. */
export function seedWorld(): WorldNode[] {
  return [
    // ---- Firefox
    {
      substrate: "firefox",
      axId: "crm.acme.notes",
      role: "region",
      name: "Acme account notes",
      state: {
        text: "Renewal due Q4. Wants SSO + audit log. Champion: R. Vale. Budget approved.",
        owner: "you",
        updated: "2 days ago",
      },
    },
    {
      substrate: "firefox",
      axId: "crm.theme.toggle",
      role: "combobox",
      name: "Set appearance theme",
      state: { value: "light" },
      capabilityId: "set_theme",
      inputs: ["theme"],
    },
    {
      substrate: "firefox",
      axId: "ds.tokens",
      role: "region",
      name: "Design tokens",
      state: {
        "color.primary": "#4F46E5",
        "color.surface": "#0B0B0F",
        "space.md": "16px",
        "radius.card": "12px",
        "type.scale": "1.250",
      },
    },
    {
      substrate: "firefox",
      axId: "billing.alerts",
      role: "switch",
      name: "Enable weekly billing alerts",
      state: { value: "off" },
      capabilityId: "enable_billing_alerts",
      inputs: ["enabled"],
    },
    {
      substrate: "firefox",
      axId: "travel.book",
      role: "button",
      name: "Book travel / reservation",
      state: { status: "unbooked", amount: "$416.00" },
      capabilityId: "book_travel",
      inputs: ["destination", "date", "amount"],
    },

    // ---- Chrome
    {
      substrate: "chrome",
      axId: "dash.figures",
      role: "region",
      name: "Review figures",
      state: { mrr: "$41,600", churn: "1.8%", nps: "62" },
    },
    {
      substrate: "chrome",
      axId: "mail.compose",
      role: "textbox",
      name: "Compose & queue an email",
      state: { to: "", subject: "", body: "", status: "empty" },
      capabilityId: "compose_email",
      inputs: ["to", "subject", "body"],
    },

    // ---- Windows
    {
      substrate: "windows",
      axId: "notes.body",
      role: "textbox",
      name: "Review brief body",
      state: { value: "" },
      capabilityId: "populate_brief",
      inputs: ["text"],
    },
    {
      substrate: "windows",
      axId: "shell.launch",
      role: "button",
      name: "Open a desktop application",
      state: { last: "" },
      capabilityId: "open_app",
      inputs: ["app"],
    },

    // ---- macOS
    {
      substrate: "macos",
      axId: "macos.notes.body",
      role: "textbox",
      name: "Add a note (macOS)",
      state: { value: "" },
      capabilityId: "macos_populate_note",
      inputs: ["text"],
    },

    // ---- Android
    {
      substrate: "android",
      axId: "android.reminder.save",
      role: "button",
      name: "Set a reminder on the phone",
      state: { status: "none", text: "", time: "" },
      capabilityId: "android_set_reminder",
      inputs: ["text", "time"],
    },
    {
      substrate: "android",
      axId: "android.wallet.pass",
      role: "button",
      name: "Open boarding pass state",
      state: { status: "closed" },
      capabilityId: "android_boarding_pass",
    },

    // ---- iOS
    {
      substrate: "ios",
      axId: "ios.calendar.add",
      role: "button",
      name: "Add a calendar event (iOS)",
      state: { status: "none", title: "", time: "" },
      capabilityId: "ios_add_calendar",
      inputs: ["title", "time"],
    },
  ];
}

/** Apply a capability's deterministic effect to its node. */
export function applyEffect(
  n: WorldNode,
  inputs?: Record<string, string | number | boolean>,
): void {
  n.state = n.state ?? {};
  switch (n.capabilityId) {
    case "set_theme":
      n.state.value = String(inputs?.theme ?? "dark");
      break;
    case "populate_brief":
    case "macos_populate_note":
      n.state.value = String(inputs?.text ?? "");
      break;
    case "enable_billing_alerts":
      n.state.value = inputs?.enabled === false ? "off" : "on";
      break;
    case "book_travel":
      n.state.status = "booked";
      if (inputs?.amount != null) n.state.amount = String(inputs.amount);
      break;
    case "compose_email":
      n.state.to = String(inputs?.to ?? "");
      n.state.subject = String(inputs?.subject ?? "");
      n.state.body = String(inputs?.body ?? "");
      n.state.status = "queued";
      break;
    case "open_app":
      n.state.last = String(inputs?.app ?? "");
      break;
    case "android_set_reminder":
      n.state.status = "set";
      n.state.text = String(inputs?.text ?? "");
      n.state.time = String(inputs?.time ?? "");
      break;
    case "android_boarding_pass":
      n.state.status = "open";
      break;
    case "ios_add_calendar":
      n.state.status = "added";
      n.state.title = String(inputs?.title ?? "");
      n.state.time = String(inputs?.time ?? "");
      break;
    default:
      break;
  }
}

export function stripInternal(n: WorldNode): AxNode {
  return {
    axId: n.axId,
    role: n.role,
    name: n.name,
    state: n.state ? { ...n.state } : undefined,
  };
}
