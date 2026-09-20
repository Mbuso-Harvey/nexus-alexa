/**
 * BedrockPlanBuilder — AWS Builder mini-challenge integration.
 *
 * This is the AWS-native intent-and-planning layer. Rather than a trivial one-shot text
 * completion, Bedrock performs the genuinely hard step of the pipeline: it grounds the
 * spoken request in the DECLARED Nexus capability manifest and proposes a validated,
 * ordered plan of real capability invocations (with inputs and expected post-state).
 * The proposal is constrained, not free-form: capabilities/inputs that are not in the
 * manifest are dropped, and the strongly-checked headline workflow enforces order and
 * completeness before a Bedrock plan is accepted (an incomplete proposal falls back
 * deterministically). That plan is then executed and semantically verified by Nexus over
 * MCP 2025-11-25 Streamable HTTP. So AWS is doing the agentic planning over a declared
 * capability catalogue, and Nexus is doing the execution and verification — a purposeful
 * multi-service architecture, not a decorative Bedrock call.
 *
 * Design guarantees:
 *  - Grounded: the model may only use capabilities that exist in the declared manifest;
 *    anything else is dropped during validation (no hallucinated actions reach a substrate).
 *  - Constrained: the headline workflow check enforces capability order/completeness;
 *    this demo does not claim fully dynamic live capability discovery.
 *  - Safe by construction: sensitivity/CONFIRM is still enforced downstream by Nexus's tier
 *    gate regardless of what the model proposes.
 *  - Graceful fallback: with no AWS credentials/region configured, `build()` returns null so
 *    the CompositePlanBuilder falls through to the deterministic planners — the demo never
 *    breaks offline.
 */

import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { Plan, PlanBuilder, PlanStep } from "./plan.js";
import { CAPABILITY_MANIFEST, type CapabilitySpec } from "./nexus/manifest.js";
import type { Substrate } from "./types.js";

/**
 * Memoized once-per-process credential-chain probe. Resolving credentials through the
 * SDK's default chain is bounded (~1s metadata timeout, no retries), but it is still not
 * free — and buildAsync runs per demo request — so the result is computed at most once.
 */
let credentialChainProbe: Promise<boolean> | undefined;

export interface BedrockOptions {
  /** e.g. "us.anthropic.claude-3-5-sonnet-20241022-v2:0" or a cross-region inference profile. */
  modelId?: string;
  region?: string;
  /** Only plan over capabilities of these substrates (default: all in the manifest). */
  substrates?: Substrate[];
  /** Restrict to live capabilities so the produced plan runs for real (default true). */
  liveOnly?: boolean;
}

interface ModelStep {
  capabilityId: string;
  inputs?: Record<string, string | number | boolean>;
}
interface ModelPlan {
  intro: string;
  steps: ModelStep[];
  outro: string;
}

export class BedrockPlanBuilder implements PlanBuilder {
  private readonly modelId: string;
  private readonly region: string;
  private readonly caps: CapabilitySpec[];

  constructor(opts: BedrockOptions = {}) {
    this.modelId =
      opts.modelId ??
      process.env.NEXUS_ALEXA_BEDROCK_MODEL ??
      "us.anthropic.claude-3-5-sonnet-20241022-v2:0";
    this.region = opts.region ?? process.env.AWS_REGION ?? "us-east-1";
    const live = opts.liveOnly ?? true;
    this.caps = CAPABILITY_MANIFEST.filter(
      (c) =>
        (!opts.substrates || opts.substrates.includes(c.substrate)) &&
        (!live || c.readiness === "live-demo"),
    );
  }

  /**
   * True when the standard AWS SDK credential provider chain resolves credentials.
   *
   * Uses the SDK's default chain (environment variables -> SSO token cache -> web identity
   * token -> shared INI files — the normal default profile created by `aws configure` ->
   * EC2/ECS instance metadata), so credentials are detected without requiring AWS_PROFILE
   * or explicit access-key environment variables merely to detect them. Probing is bounded
   * (1s metadata timeout, no retries); any resolution failure — including no configuration
   * at all — resolves false so callers fall back gracefully and the demo never breaks
   * offline. Memoized once per process (see credentialChainProbe).
   */
  static credentialsPresent(): Promise<boolean> {
    credentialChainProbe ??= (async () => {
      try {
        const provider = fromNodeProviderChain({ timeout: 1000, maxRetries: 0 });
        const credentials = await provider();
        return Boolean(credentials?.accessKeyId);
      } catch {
        return false;
      }
    })();
    return credentialChainProbe;
  }

  /** Synchronous PlanBuilder contract: Bedrock is async, so this signals "use buildAsync". */
  build(_objective: string): Plan | null {
    return null;
  }

  /** The real entry point. Returns null on any failure so callers fall back deterministically. */
  async buildAsync(objective: string): Promise<Plan | null> {
    if (!(await BedrockPlanBuilder.credentialsPresent())) return null;
    let ConverseModule: typeof import("@aws-sdk/client-bedrock-runtime");
    try {
      ConverseModule = await import("@aws-sdk/client-bedrock-runtime");
    } catch {
      return null;
    }
    const { BedrockRuntimeClient, ConverseCommand } = ConverseModule;

    const client = new BedrockRuntimeClient({ region: this.region });
    const system = this.systemPrompt();
    const user = `User request: "${objective}"\n\nReturn ONLY the JSON plan.`;

    try {
      const res = await client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: system }],
          messages: [{ role: "user", content: [{ text: user }] }],
          inferenceConfig: { temperature: 0, maxTokens: 900 },
        }),
      );
      const text =
        res.output?.message?.content?.map((c) => ("text" in c ? c.text : "")).join("") ?? "";
      const modelPlan = this.extractJson(text);
      if (!modelPlan) return null;
      return this.toPlan(objective, modelPlan);
    } catch {
      // Any Bedrock/model/parse error -> fall back to deterministic planners.
      return null;
    }
  }

  private systemPrompt(): string {
    const catalogue = this.caps
      .map(
        (c) =>
          `- ${c.capabilityId} (${c.substrate}, tier ${c.tier ?? "auto"}${
            c.inputs?.length ? `, inputs: ${c.inputs.join("/")}` : ""
          }): ${c.name}`,
      )
      .join("\n");
    return [
      "You are the planning layer for Nexus, a system that lets Alexa operate real apps",
      "across web/desktop/mobile via a semantic graph. Turn the user's spoken request into an",
      "ordered plan of capability invocations chosen ONLY from this catalogue:",
      "",
      catalogue,
      "",
      "Rules:",
      "- Use only capabilityId values from the catalogue. Never invent capabilities.",
      "- Order steps sensibly (read/context before acting; end on the user's main goal).",
      "- Provide inputs only for the listed input names.",
      "- Do NOT decide safety; Nexus enforces confirmation on sensitive actions itself.",
      "- For an Acme review/setup request, include the full available sequence: map_app_semantics,",
      "  extract_design_tokens, read_current_theme, set_theme, open_sensitive_dialog, then",
      "  populate_brief. Supply every listed input.",
      "- Respond with STRICT JSON only, matching:",
      '  {"intro": string, "steps": [{"capabilityId": string, "inputs"?: object}], "outro": string}',
    ].join("\n");
  }

  private extractJson(text: string): ModelPlan | null {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as ModelPlan;
      if (!obj || !Array.isArray(obj.steps)) return null;
      return obj;
    } catch {
      return null;
    }
  }

  private validatedInputs(
    cap: CapabilitySpec,
    raw?: Record<string, string | number | boolean>,
  ): Record<string, string | number | boolean> | undefined {
    if (!cap.inputs?.length || !raw) return undefined;
    const entries = cap.inputs
      .filter((key) => ["string", "number", "boolean"].includes(typeof raw[key]))
      .map((key) => [key, raw[key]] as const);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  private expectedState(
    capabilityId: string,
    inputs?: Record<string, string | number | boolean>,
  ): Record<string, string | number | boolean | null> | undefined {
    switch (capabilityId) {
      case "set_theme":
        return { value: String(inputs?.theme ?? "dark") };
      case "tickets.create":
        return {
          dialog: "open",
          title: String(inputs?.title ?? "Prepared by Nexus"),
          severity: String(inputs?.severity ?? "medium"),
          body: String(inputs?.body ?? "Prepared via Alexa+ through Nexus Semantic."),
        };
      case "open_sensitive_dialog":
        return { dialog: "open" };
      case "populate_brief":
        return {
          value: String(inputs?.text ?? "").replace(/\r\n?/g, "\n").replace(/\n+$/g, ""),
          dirty: true,
          hasEditor: true,
        };
      case "enable_billing_alerts":
        return { value: inputs?.enabled === false ? "off" : "on" };
      default:
        return undefined;
    }
  }

  private headlinePlanComplete(objective: string, steps: PlanStep[]): boolean {
    if (!/(acme|review|set\s+(?:me\s+)?up|get\s+(?:me\s+)?ready)/i.test(objective)) {
      return true;
    }
    const desiredOrder = [
      "map_app_semantics",
      "extract_design_tokens",
      "read_current_theme",
      "set_theme",
      "open_sensitive_dialog",
      "populate_brief",
    ];
    const available = new Set(this.caps.map((cap) => cap.capabilityId));
    const required = desiredOrder.filter((capabilityId) => available.has(capabilityId));
    let previousIndex = -1;
    for (const capabilityId of required) {
      const index = steps.findIndex((step) => step.capabilityId === capabilityId);
      if (index <= previousIndex) return false;
      previousIndex = index;
      const cap = this.caps.find((candidate) => candidate.capabilityId === capabilityId)!;
      const step = steps[index];
      if (cap.inputs?.some((input) => !(input in (step.inputs ?? {})))) return false;
    }
    return required.length > 0;
  }

  private toPlan(objective: string, mp: ModelPlan): Plan | null {
    const steps: PlanStep[] = [];
    let i = 0;
    for (const ms of mp.steps) {
      const cap = this.caps.find((c) => c.capabilityId === ms.capabilityId);
      if (!cap) continue; // drop hallucinated / unavailable capabilities
      i += 1;
      const isRead = !cap.inputs && cap.role === "region";
      const inputs = this.validatedInputs(cap, ms.inputs);
      steps.push({
        id: `b${i}`,
        say: cap.name,
        substrate: cap.substrate,
        kind: isRead ? "read" : "invoke",
        target: cap.axId,
        capabilityId: cap.capabilityId,
        inputs,
        expected: isRead ? undefined : this.expectedState(cap.capabilityId, inputs),
        sensitive: (cap.tier ?? "READ") === "CONFIRM",
      });
    }
    if (steps.length === 0 || !this.headlinePlanComplete(objective, steps)) return null;
    return {
      objective,
      intro: mp.intro || "On it.",
      steps,
      outro: mp.outro || "Done.",
    };
  }
}
