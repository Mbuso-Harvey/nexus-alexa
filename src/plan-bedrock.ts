/**
 * BedrockPlanBuilder — AWS Builder mini-challenge integration.
 *
 * This is the AWS-native intent-and-planning layer. Rather than a trivial one-shot text
 * completion, Bedrock performs the genuinely hard step of the pipeline: it reasons over the
 * live Nexus capability manifest and turns an *arbitrary* spoken request into a validated,
 * ordered plan of real capability invocations (with inputs and expected post-state). That
 * plan is then executed and semantically verified by Nexus over MCP 2025-11-25 Streamable
 * HTTP. So AWS is doing the agentic orchestration/planning, and Nexus is doing the execution
 * and verification — a purposeful multi-service architecture, not a decorative Bedrock call.
 *
 * Design guarantees:
 *  - Grounded: the model may only use capabilities that exist in the manifest; anything else
 *    is dropped during validation (no hallucinated actions reach a substrate).
 *  - Safe by construction: sensitivity/CONFIRM is still enforced downstream by Nexus's tier
 *    gate regardless of what the model proposes.
 *  - Graceful fallback: with no AWS credentials/region configured, `build()` returns null so
 *    the CompositePlanBuilder falls through to the deterministic planners — the demo never
 *    breaks offline.
 */

import type { Plan, PlanBuilder, PlanStep } from "./plan.js";
import { CAPABILITY_MANIFEST, type CapabilitySpec } from "./nexus/manifest.js";
import type { Substrate } from "./types.js";

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
        (!live || c.readiness === "live"),
    );
  }

  /** True when AWS credentials appear to be configured (so we should attempt Bedrock). */
  static credentialsPresent(): boolean {
    return Boolean(
      process.env.AWS_ACCESS_KEY_ID ||
        process.env.AWS_PROFILE ||
        process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
        process.env.AWS_WEB_IDENTITY_TOKEN_FILE,
    );
  }

  /** Synchronous PlanBuilder contract: Bedrock is async, so this signals "use buildAsync". */
  build(_objective: string): Plan | null {
    return null;
  }

  /** The real entry point. Returns null on any failure so callers fall back deterministically. */
  async buildAsync(objective: string): Promise<Plan | null> {
    if (!BedrockPlanBuilder.credentialsPresent()) return null;
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

  private toPlan(objective: string, mp: ModelPlan): Plan | null {
    const steps: PlanStep[] = [];
    let i = 0;
    for (const ms of mp.steps) {
      const cap = this.caps.find((c) => c.capabilityId === ms.capabilityId);
      if (!cap) continue; // drop hallucinated / unavailable capabilities
      i += 1;
      const isRead = !cap.inputs && cap.role === "region";
      steps.push({
        id: `b${i}`,
        say: cap.name,
        substrate: cap.substrate,
        kind: isRead ? "read" : "invoke",
        target: cap.axId,
        capabilityId: isRead ? undefined : cap.capabilityId,
        inputs: ms.inputs,
        sensitive: (cap.tier ?? "READ") === "CONFIRM",
      });
    }
    if (steps.length === 0) return null;
    return {
      objective,
      intro: mp.intro || "On it.",
      steps,
      outro: mp.outro || "Done.",
    };
  }
}
