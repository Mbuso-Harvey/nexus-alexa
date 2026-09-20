/**
 * Orchestrator — turns one objective into cross-substrate execution with verification.
 *
 * Flow per the product thesis:
 *   objective -> plan -> for each step: (query/read | invoke) -> semantic verify
 *             -> pause at CONFIRM for human approval -> resume -> completed outcome
 *
 * It calls tools through a transport-agnostic `ToolCaller`, so the exact same orchestration
 * runs (a) in-process against the McpServer for tests, and (b) over the real MCP 2025-11-25
 * Streamable HTTP client for the live demo. Emits structured events the Alexa client and
 * execution visualizer render in real time.
 */

import type { Plan, PlanStep } from "./plan.js";
import type { InvokeResult, Substrate, Verification } from "./types.js";

/** Minimal tool interface the orchestrator needs. Implemented over HTTP and in-process. */
export interface ToolCaller {
  call(name: string, args: Record<string, unknown>): Promise<any>;
}

export type OrchestratorEvent =
  | { type: "intro"; objective: string; say: string; substrates: Substrate[] }
  | { type: "step:start"; step: PlanStep; index: number; total: number }
  | { type: "step:observed"; step: PlanStep; observed: unknown }
  | { type: "step:verified"; step: PlanStep; verification: Verification }
  | { type: "confirm:required"; step: PlanStep; preview: InvokeResult }
  | { type: "confirm:granted"; step: PlanStep }
  | { type: "confirm:denied"; step: PlanStep }
  | { type: "step:done"; step: PlanStep; pass: boolean }
  | { type: "outro"; say: string; pass: boolean }
  | { type: "error"; step?: PlanStep; message: string };

export type EventSink = (e: OrchestratorEvent) => void;

/** Asked whether a sensitive (CONFIRM) step may proceed. Returns true to grant. */
export type ConfirmHandler = (step: PlanStep, preview: InvokeResult) => Promise<boolean>;

export interface RunResult {
  objective: string;
  ok: boolean;
  steps: Array<{ step: PlanStep; pass: boolean; verification?: Verification }>;
  events: OrchestratorEvent[];
}

export interface RunOptions {
  onEvent?: EventSink;
  /** Called when a step hits the CONFIRM gate. Default: deny (safe). */
  confirm?: ConfirmHandler;
}

function parseToolResult(raw: any): any {
  // MCP tool results are { content: [{ type:"text", text: "<json>" }], isError? }.
  const text = raw?.content?.find?.((c: any) => c.type === "text")?.text;
  if (typeof text === "string") {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  return raw;
}

export class Orchestrator {
  constructor(private readonly tools: ToolCaller) {}

  async run(plan: Plan, opts: RunOptions = {}): Promise<RunResult> {
    const events: OrchestratorEvent[] = [];
    const emit = (e: OrchestratorEvent) => {
      events.push(e);
      opts.onEvent?.(e);
    };
    const confirm = opts.confirm ?? (async () => false);

    const substrates = [...new Set(plan.steps.map((s) => s.substrate))];
    emit({ type: "intro", objective: plan.objective, say: plan.intro, substrates });

    const stepResults: RunResult["steps"] = [];
    let allPass = true;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      emit({ type: "step:start", step, index: i, total: plan.steps.length });

      try {
        if (step.kind === "read" || step.kind === "query") {
          const res =
            step.kind === "read"
              ? await this.tools.call("nexus_read", {
                  substrate: step.substrate,
                  axId: step.target,
                })
              : await this.tools.call("nexus_query", {
                  substrate: step.substrate,
                  find: step.find ?? step.target,
                });
          const data = parseToolResult(res);
          const observed = step.kind === "read" ? data.node : data.nodes;
          emit({ type: "step:observed", step, observed });
          const pass = observed != null && (Array.isArray(observed) ? observed.length > 0 : true);
          stepResults.push({ step, pass });
          allPass = allPass && pass;
          emit({ type: "step:done", step, pass });
          continue;
        }

        // invoke (+ verify)
        let invokeRes = parseToolResult(
          await this.tools.call("nexus_invoke", {
            substrate: step.substrate,
            capabilityId: step.capabilityId,
            inputs: step.inputs,
          }),
        ) as InvokeResult;

        if (invokeRes.requireConfirm) {
          emit({ type: "confirm:required", step, preview: invokeRes });
          const granted = await confirm(step, invokeRes);
          if (!granted) {
            emit({ type: "confirm:denied", step });
            stepResults.push({ step, pass: false });
            allPass = false;
            emit({ type: "step:done", step, pass: false });
            continue;
          }
          emit({ type: "confirm:granted", step });
          invokeRes = parseToolResult(
            await this.tools.call("nexus_invoke", {
              substrate: step.substrate,
              capabilityId: step.capabilityId,
              inputs: step.inputs,
              confirm: true,
            }),
          ) as InvokeResult;
        }

        if (!invokeRes.ok) {
          emit({ type: "error", step, message: invokeRes.reason });
        }
        emit({ type: "step:observed", step, observed: invokeRes.observed });

        let verification: Verification | undefined;
        let pass = invokeRes.ok;
        if (invokeRes.ok && step.expected) {
          verification = parseToolResult(
            await this.tools.call("nexus_verify", {
              substrate: step.substrate,
              capabilityId: step.capabilityId,
              axId: step.target,
              expected: step.expected,
            }),
          ) as Verification;
          emit({ type: "step:verified", step, verification });
          pass = verification.pass;
        }

        stepResults.push({ step, pass, verification });
        allPass = allPass && pass;
        emit({ type: "step:done", step, pass });
      } catch (err) {
        const message = (err as Error).message;
        emit({ type: "error", step, message });
        stepResults.push({ step, pass: false });
        allPass = false;
        emit({ type: "step:done", step, pass: false });
      }
    }

    emit({ type: "outro", say: plan.outro, pass: allPass });
    return { objective: plan.objective, ok: allPass, steps: stepResults, events };
  }
}

import type { NexusSubstrate } from "./nexus/substrate.js";

/**
 * Direct ToolCaller: drives a NexusSubstrate in-process, shaping results to match the
 * MCP tool contract ({ content: [{ type:"text", text }] }). Used for tests and the
 * offline orchestration path. The live path uses `httpToolCaller` (real Streamable HTTP).
 */
export function directToolCaller(substrate: NexusSubstrate): ToolCaller {
  const wrap = (obj: unknown) => ({
    content: [{ type: "text", text: JSON.stringify(obj) }],
  });
  return {
    async call(name, args) {
      const a = args as any;
      switch (name) {
        case "nexus_substrates":
          return wrap({ substrates: await substrate.availableSubstrates() });
        case "nexus_query":
          return wrap({ nodes: await substrate.query({ substrate: a.substrate, find: a.find, role: a.role }) });
        case "nexus_read":
          return wrap({ node: await substrate.read(a.substrate, a.axId) });
        case "nexus_capabilities":
          return wrap({ capabilities: await substrate.capabilities(a.substrate, a.find) });
        case "nexus_invoke":
          return wrap(
            await substrate.invoke({
              substrate: a.substrate,
              capabilityId: a.capabilityId,
              inputs: a.inputs,
              confirm: a.confirm,
            }),
          );
        case "nexus_verify":
          return wrap(
            await substrate.verify({
              substrate: a.substrate,
              capabilityId: a.capabilityId,
              axId: a.axId,
              expected: a.expected,
            }),
          );
        default:
          throw new Error(`unknown tool: ${name}`);
      }
    },
  };
}

/** HTTP ToolCaller: drives the server over the real MCP 2025-11-25 Streamable HTTP client. */
export function httpToolCaller(client: {
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<any>;
}): ToolCaller {
  return {
    async call(name, args) {
      return client.callTool({ name, arguments: args });
    },
  };
}
