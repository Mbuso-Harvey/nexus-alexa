/**
 * MCP 2025-11-25 Streamable HTTP server — the primary hackathon delta.
 *
 * NexusOS Semantic today speaks only MCP stdio + a hand-rolled TCP JSON-RPC socket
 * (verified during investigation). The Alexa+ track requires a self-hosted MCP server
 * implementing spec version 2025-11-25 over Streamable HTTP. This module provides exactly
 * that, built on the official SDK's `StreamableHTTPServerTransport` (which ships in
 * @modelcontextprotocol/sdk 1.30.0 and negotiates LATEST_PROTOCOL_VERSION = 2025-11-25).
 *
 * Spec obligations handled here (modelcontextprotocol.io/.../2025-11-25/basic/transports):
 *  - Single MCP endpoint supporting POST and GET (delegated to the SDK transport).
 *  - Origin validation with 403 on invalid (SDK `enableDnsRebindingProtection` + allowedOrigins/Hosts).
 *  - Localhost binding by default (anti DNS-rebind).
 *  - Bearer-token auth for non-local/judge access (checked before the transport).
 *  - Protocol-version negotiation of 2025-11-25 (SDK default LATEST).
 *  - Optional session management via MCP-Session-Id (stateful mode).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildNexusMcpServer } from "./server.js";
import type { NexusSubstrate } from "../nexus/substrate.js";

export const MCP_ENDPOINT = "/mcp";
export const MCP_PROTOCOL_VERSION = "2025-11-25";

export interface HttpServerOptions {
  substrate: NexusSubstrate;
  /** Port to listen on. 0 = ephemeral (tests). */
  port?: number;
  /** Host to bind. Defaults to 127.0.0.1 (localhost-only per spec). */
  host?: string;
  /**
   * Allowed Origin header values. When set, DNS-rebinding protection is enabled and
   * requests with a different Origin get 403. When empty/undefined, protection is off
   * (acceptable for pure-localhost dev, but we default to localhost origins).
   */
  allowedOrigins?: string[];
  /** Allowed Host header values (defence in depth alongside Origin). */
  allowedHosts?: string[];
  /**
   * Bearer token required in `Authorization: Bearer <token>`. When set, every request
   * (except the health check) must present it or receive 401. Recommended for any
   * non-local/remote/judge access.
   */
  bearerToken?: string;
  /** Use stateful sessions (MCP-Session-Id). Default true. */
  stateful?: boolean;
}

export interface RunningHttpServer {
  server: Server;
  mcp: McpServer;
  transport: StreamableHTTPServerTransport;
  port: number;
  host: string;
  url: string;
  close(): Promise<void>;
}

/** JSON-RPC style error body with no id (per spec, for pre-dispatch failures). */
function jsonRpcError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    }),
  );
}

function checkBearer(req: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const auth = req.headers["authorization"];
  if (typeof auth !== "string") return false;
  const [scheme, value] = auth.split(" ");
  return scheme?.toLowerCase() === "bearer" && value === token;
}

/**
 * Start the Streamable HTTP MCP server. Returns once listening.
 */
export async function startHttpServer(opts: HttpServerOptions): Promise<RunningHttpServer> {
  const host = opts.host ?? "127.0.0.1";
  const stateful = opts.stateful ?? true;

  const mcp = buildNexusMcpServer(opts.substrate);

  // Bind first so we know the real (possibly ephemeral) port, then configure the
  // transport's Origin/Host allowlists against that concrete port. This guarantees
  // DNS-rebinding protection is always on with a correct localhost allowlist, even
  // when the caller asked for an ephemeral port (port 0).
  // The transport is created after the port is known so DNS-rebinding protection can
  // be configured against the concrete bound port (works with ephemeral port 0 too).
  let transport!: StreamableHTTPServerTransport;
  let ready = false;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);

      // Lightweight health check (no auth) so operators/judges can probe liveness.
      if (url.pathname === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, protocol: MCP_PROTOCOL_VERSION }));
        return;
      }

      if (url.pathname !== MCP_ENDPOINT) {
        jsonRpcError(res, 404, `not found: ${url.pathname}`);
        return;
      }

      if (!ready) {
        jsonRpcError(res, 503, "server initializing");
        return;
      }

      // Bearer auth (before touching the transport) for remote/judge access.
      if (!checkBearer(req, opts.bearerToken)) {
        res.setHeader("WWW-Authenticate", "Bearer");
        jsonRpcError(res, 401, "unauthorized: missing or invalid bearer token");
        return;
      }

      // Delegate POST/GET/DELETE to the spec-compliant SDK transport.
      await transport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        jsonRpcError(res, 500, `internal error: ${(err as Error).message}`);
      }
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, host, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : (opts.port ?? 0);
  const url = `http://${host}:${port}${MCP_ENDPOINT}`;

  // Now that we know the bound port, configure Origin/Host allowlists and connect.
  const originHosts = [`${host}:${port}`, `localhost:${port}`, `127.0.0.1:${port}`];
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: stateful ? () => randomUUID() : undefined,
    // Spec: validate Origin (403 on invalid) and Host to prevent DNS rebinding.
    enableDnsRebindingProtection: true,
    allowedOrigins: opts.allowedOrigins ?? originHosts.map((h) => `http://${h}`),
    allowedHosts: opts.allowedHosts ?? originHosts,
  });
  await mcp.connect(transport);
  ready = true;

  return {
    server,
    mcp,
    transport,
    port,
    host,
    url,
    async close() {
      await transport.close().catch(() => undefined);
      await mcp.close().catch(() => undefined);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
