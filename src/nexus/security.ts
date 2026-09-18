/**
 * Security tier logic.
 *
 * Behaviourally mirrors NexusOS Semantic `src/graph/security.ts` (verified during
 * investigation) so the CONFIRM boundary enforced at the Alexa gateway is identical
 * to the substrate's own enforcement. The gateway routes EVERY capability invocation
 * — including desktop/mobile kinetic actions, which the raw Nexus MCP tools do not yet
 * gate — through `decide()` before any substrate contact. This closes the investigation
 * gap R4 (ungated native dispatch).
 */

import type { SecurityTier } from "../types.js";

const TIER_RANK: Record<SecurityTier, number> = {
  DISCOVER: 0,
  READ: 1,
  PROPOSE: 2,
  EXECUTE: 3,
  CONFIRM: 4,
};

export function tierRank(t: SecurityTier): number {
  return TIER_RANK[t];
}

export function maxTier(a: SecurityTier, b: SecurityTier): SecurityTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

// Destructive verbs — conservative. Anything matching is forced to CONFIRM.
const DESTRUCTIVE_VERBS =
  /^(delete|remove|destroy|wipe|purge|terminate|cancel|drop|revoke|reset|clear|sign[ -]?out|log[ -]?out)\b/i;

// Billing / payment / production keywords — never demoted below CONFIRM.
const SENSITIVE_KEYWORDS =
  /\b(billing|payment|checkout|invoice|subscription|purchase|charge|production|prod[ -]?env|live[ -]?env|admin|owner|transfer|wire)\b/i;

/** Determine the security tier for a capability given its role, name, and inputs. */
export function tierForCapability(opts: {
  role: string;
  name: string;
  inputKeys: string[];
}): SecurityTier {
  const { role, name, inputKeys } = opts;
  if (DESTRUCTIVE_VERBS.test(name)) return "CONFIRM";
  if (SENSITIVE_KEYWORDS.test(name)) return "CONFIRM";
  if (inputKeys.length > 0 && role !== "link" && role !== "button") return "PROPOSE";
  if (
    role === "textbox" ||
    role === "searchbox" ||
    role === "combobox" ||
    role === "slider" ||
    role === "spinbutton"
  )
    return "PROPOSE";
  if (role === "checkbox" || role === "switch") return "EXECUTE";
  if (
    role === "button" ||
    role === "link" ||
    role === "menuitem" ||
    role === "tab" ||
    role === "option"
  )
    return "EXECUTE";
  if (role === "dialog" || role === "alertdialog") return "EXECUTE";
  return "READ";
}

export interface ActDecision {
  ok: boolean;
  requireConfirm: boolean;
  reason: string;
  preview?: { capabilityId: string; tier: SecurityTier; role: string; name: string };
}

/** Decide whether an invocation may proceed. */
export function decide(opts: {
  tier: SecurityTier;
  capabilityId: string;
  role: string;
  name: string;
  confirm: boolean;
}): ActDecision {
  if (opts.tier === "DISCOVER") {
    return {
      ok: false,
      requireConfirm: false,
      reason: "DISCOVER capabilities cannot be invoked",
    };
  }
  if (opts.tier === "CONFIRM" && !opts.confirm) {
    return {
      ok: false,
      requireConfirm: true,
      reason: `${opts.tier}: capability is destructive or sensitive — requires confirm:true`,
      preview: {
        capabilityId: opts.capabilityId,
        tier: opts.tier,
        role: opts.role,
        name: opts.name,
      },
    };
  }
  return { ok: true, requireConfirm: false, reason: "ok" };
}
