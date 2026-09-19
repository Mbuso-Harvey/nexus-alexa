/**
 * Typed wrapper for the BiDi script module.
 *
 * Per the env-report: Firefox 154 supports evaluate and callFunction.
 * addPreloadScript is unverified; v1 re-injects via callFunction post-navigation
 * (see plan section 8.1).
 */
import type { BiDiTransport } from "./transport.js";

export type RemoteValue =
  | { type: "undefined" }
  | { type: "null" }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "bigint"; value: string }
  | { type: "array"; value: RemoteValue[] }
  | { type: "object"; value: Array<[string, RemoteValue]> }
  | { type: "symbol"; value: string }
  | { type: "function"; value: string }
  | { type: "node"; sharedId: string; handle?: string };

export interface ScriptTarget {
  context: string;
  /** Optional sandbox to evaluate in (default: target context's realm) */
  sandbox?: string;
}

export interface ScriptEvaluateResult {
  realm: string;
  type: "success" | "exception";
  result?: RemoteValue;
  exceptionDetails?: { text: string; columnNumber: number; lineNumber: number; stackTrace?: string };
}

export interface ScriptCallFunctionResult extends ScriptEvaluateResult {}

export class ScriptApi {
  constructor(private transport: BiDiTransport) {}

  /**
   * Evaluate an expression in the target context. Returns the unwrapped JS value
   * or throws on exception. Always sends `resultOwnership: "root"` so handles
   * don't leak.
   */
  async evaluate<T = unknown>(
    target: ScriptTarget,
    expression: string,
    options: { awaitPromise?: boolean } = {},
  ): Promise<T> {
    const r = await this.transport.send<ScriptEvaluateResult>("script.evaluate", {
      expression,
      target,
      awaitPromise: options.awaitPromise ?? false,
      resultOwnership: "root",
    });
    return unwrap(r) as T;
  }

  /**
   * Call a function in the target context. The function is serialized via
   * `functionDeclaration` — it must be a self-contained arrow/function with no
   * closures over outer JS (BiDi deserializes it in the target realm).
   */
  async callFunction<T = unknown>(
    target: ScriptTarget,
    functionDeclaration: string,
    args: unknown[] = [],
    options: { awaitPromise?: boolean } = {},
  ): Promise<T> {
    const r = await this.transport.send<ScriptCallFunctionResult>("script.callFunction", {
      functionDeclaration,
      arguments: args.map(serializeArg),
      target,
      awaitPromise: options.awaitPromise ?? false,
      resultOwnership: "root",
    });
    return unwrap(r) as T;
  }
}

/** Serialize a JS value to a BiDi RemoteValue for use as a callFunction argument. */
function serializeArg(v: unknown): RemoteValue {
  if (v === undefined) return { type: "undefined" };
  if (v === null) return { type: "null" };
  if (typeof v === "string") return { type: "string", value: v };
  if (typeof v === "number") return { type: "number", value: v };
  if (typeof v === "boolean") return { type: "boolean", value: v };
  if (typeof v === "bigint") return { type: "bigint", value: v.toString() };
  if (Array.isArray(v)) return { type: "array", value: v.map(serializeArg) };
  if (typeof v === "object") {
    return { type: "object", value: Object.entries(v as object).map(([k, vv]) => [k, serializeArg(vv)]) };
  }
  throw new Error(`cannot serialize ${typeof v} as BiDi argument`);
}

/** Unwrap a BiDi script result to a plain JS value, throwing on exception. */
function unwrap(r: ScriptEvaluateResult): unknown {
  if (r.type === "exception") {
    const detail = r.exceptionDetails;
    const msg = detail ? `${detail.text} @ ${detail.lineNumber}:${detail.columnNumber}` : "script exception";
    const err = new Error(`script.${msg}`);
    if (detail?.stackTrace) (err as any).stack = detail.stackTrace;
    throw err;
  }
  if (!r.result) return undefined;
  return remoteToJs(r.result);
}

function remoteToJs(v: RemoteValue): unknown {
  switch (v.type) {
    case "undefined": return undefined;
    case "null": return null;
    case "string": return v.value;
    case "number": return v.value;
    case "boolean": return v.value;
    case "bigint": return BigInt(v.value);
    case "array": return v.value.map(remoteToJs);
    case "object": {
      const o: Record<string, unknown> = {};
      for (const [k, vv] of v.value) o[k] = remoteToJs(vv);
      return o;
    }
    default: return undefined; // symbol/function/node: not useful in JS
  }
}
