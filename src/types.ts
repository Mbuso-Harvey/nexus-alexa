/**
 * Core domain types for Nexus-for-Alexa+.
 *
 * These describe the seam between the Alexa-facing gateway/orchestrator and the
 * NexusOS Semantic substrate. The substrate itself is reached through the
 * `NexusSubstrate` interface (see `nexus/substrate.ts`), which has a real
 * implementation (backed by the Nexus graph + kinetic engine) and a deterministic
 * in-memory fake used for hermetic tests and offline demos.
 */

/** Security tiers, mirroring NexusOS Semantic `src/graph/security.ts`. */
export type SecurityTier = "DISCOVER" | "READ" | "PROPOSE" | "EXECUTE" | "CONFIRM";

/** The digital environments Nexus can operate. */
export type Substrate = "firefox" | "chrome" | "windows" | "macos" | "android" | "ios";

/** A single semantic element resolved from a substrate's accessibility graph. */
export interface AxNode {
  axId: string;
  role: string;
  name: string;
  /** Free-form state flags (e.g. { checked: true, expanded: false, value: "dark" }). */
  state?: Record<string, string | number | boolean | null>;
}

/** A discoverable, executable capability bound to a place in the interface. */
export interface Capability {
  capabilityId: string;
  substrate: Substrate;
  /** Human/agent-facing name, e.g. "set_theme" or "Enable weekly billing alerts". */
  name: string;
  role: string;
  tier: SecurityTier;
  /** Named inputs the capability accepts, if any. */
  inputs?: string[];
  /** Where this capability lives (route / window / screen). */
  location?: string;
}

/** A query against the semantic graph. */
export interface GraphQuery {
  substrate: Substrate;
  /** Natural-ish search term ("dark mode", "billing alerts") or a role filter. */
  find?: string;
  role?: string;
}

/** Result of a capability invocation attempt. */
export interface InvokeResult {
  ok: boolean;
  /** True when the action was blocked pending human confirmation. */
  requireConfirm: boolean;
  reason: string;
  /** The security decision that gated this call. */
  tier: SecurityTier;
  /** Observed post-state, when the action executed. */
  observed?: AxNode | null;
}

/** A verification check: did the substrate actually reach the expected state? */
export interface Verification {
  capabilityId: string;
  substrate: Substrate;
  expected: Record<string, string | number | boolean | null>;
  observed: Record<string, string | number | boolean | null> | null;
  pass: boolean;
  detail: string;
}
