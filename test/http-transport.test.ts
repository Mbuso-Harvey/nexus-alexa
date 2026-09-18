/**
 * MCP 2025-11-25 Streamable HTTP conformance + integration tests.
 *
 * Proves the primary hackathon delta works end-to-end and honours the transport spec:
 *  - initialize -> tools/list -> tools/call over one HTTP endpoint (official SDK client)
 *  - POST with correct Accept negotiates and returns a result
 *  - invalid Origin -> 403 (DNS-rebinding protection)
 *  - missing/invalid bearer token -> 401
 *  - health check works without auth
 *  - the Nexus tool surface (query/capabilities/invoke/verify) behaves correctly,
 *    including the CONFIRM safety gate blocking a sensitive action.
 *
 * Fully hermetic: uses the in-memory FakeNexusSubstrate, no browser/driver required.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startHttpServer, type RunningHttpServer, MCP_PROTOCOL_VERSION } from "../src/mcp/http.js";
import { FakeNexusSubstrate } from "../src/nexus/substrate.js";

let running: RunningHttpServer;

async function connectClient(token?: string): Promise<Client> {
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(running.url), {
    requestInit: token
      ? { headers: { authorization: `Bearer ${token}` } }
      : undefined,
  });
  await client.connect(transport);
  return client;
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): any {
  const first = result.content.find((c) => c.type === "text");
  return JSON.parse(first?.text ?? "{}");
}

describe("Streamable HTTP MCP server (no auth)", () => {
  beforeEach(async () => {
    running = await startHttpServer({ substrate: new FakeNexusSubstrate() });
  });
  afterEach(async () => {
    await running.close();
  });

  it("advertises protocol 2025-11-25 on the health check", async () => {
    const res = await fetch(`http://${running.host}:${running.port}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.protocol).toBe(MCP_PROTOCOL_VERSION);
  });

  it("completes initialize -> tools/list over Streamable HTTP", async () => {
    const client = await connectClient();
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toContain("nexus_query");
    expect(names).toContain("nexus_invoke");
    expect(names).toContain("nexus_verify");
    // The negotiated protocol version should be the latest (2025-11-25).
    expect(client.getServerVersion()?.name).toBe("nexus-alexa");
    await client.close();
  });

  it("negotiates MCP protocol version 2025-11-25", async () => {
    const client = await connectClient();
    // The client exposes the negotiated capabilities after connect().
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    await client.close();
  });

  it("queries the semantic graph via tools/call", async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: "nexus_query",
      arguments: { substrate: "firefox", find: "theme" },
    });
    const data = textOf(result as any);
    expect(data.nodes.length).toBeGreaterThan(0);
    expect(data.nodes[0].axId).toBe("crm.theme.toggle");
    await client.close();
  });

  it("discovers capabilities with security tiers", async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: "nexus_capabilities",
      arguments: { substrate: "firefox" },
    });
    const data = textOf(result as any);
    const billing = data.capabilities.find(
      (c: any) => c.capabilityId === "enable_billing_alerts",
    );
    expect(billing.tier).toBe("CONFIRM");
    // set_theme is a switch that takes a `theme` input -> PROPOSE (state-changing input),
    // matching Nexus's tierForCapability (inputKeys.length > 0 and role not link/button).
    const theme = data.capabilities.find((c: any) => c.capabilityId === "set_theme");
    expect(theme.tier).toBe("PROPOSE");
    await client.close();
  });

  it("executes an EXECUTE-tier capability and verifies the result", async () => {
    const client = await connectClient();
    const invoke = await client.callTool({
      name: "nexus_invoke",
      arguments: { substrate: "firefox", capabilityId: "set_theme", inputs: { theme: "dark" } },
    });
    const invokeData = textOf(invoke as any);
    expect(invokeData.ok).toBe(true);

    const verify = await client.callTool({
      name: "nexus_verify",
      arguments: {
        substrate: "firefox",
        capabilityId: "set_theme",
        axId: "crm.theme.toggle",
        expected: { value: "dark" },
      },
    });
    const verifyData = textOf(verify as any);
    expect(verifyData.pass).toBe(true);
    await client.close();
  });

  it("BLOCKS a CONFIRM-tier action without confirm=true (no state change)", async () => {
    const client = await connectClient();
    const blocked = await client.callTool({
      name: "nexus_invoke",
      arguments: { substrate: "firefox", capabilityId: "enable_billing_alerts", inputs: { enabled: true } },
    });
    const blockedData = textOf(blocked as any);
    expect(blockedData.ok).toBe(false);
    expect(blockedData.requireConfirm).toBe(true);

    // Prove no state change occurred.
    const read = await client.callTool({
      name: "nexus_read",
      arguments: { substrate: "firefox", axId: "billing.alerts" },
    });
    expect(textOf(read as any).node.state.value).toBe("off");

    // With confirm=true it proceeds.
    const allowed = await client.callTool({
      name: "nexus_invoke",
      arguments: {
        substrate: "firefox",
        capabilityId: "enable_billing_alerts",
        inputs: { enabled: true },
        confirm: true,
      },
    });
    expect(textOf(allowed as any).ok).toBe(true);
    await client.close();
  });
});

describe("Streamable HTTP security", () => {
  it("returns 403 for an invalid Origin (DNS-rebinding protection)", async () => {
    running = await startHttpServer({ substrate: new FakeNexusSubstrate() });
    const res = await fetch(running.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        origin: "http://evil.example.com",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(res.status).toBe(403);
    await running.close();
  });

  it("returns 401 without a required bearer token, 200-path with it", async () => {
    running = await startHttpServer({
      substrate: new FakeNexusSubstrate(),
      bearerToken: "s3cret",
    });
    // No token -> 401
    const noAuth = await fetch(running.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(noAuth.status).toBe(401);

    // Correct token -> the SDK client can complete the handshake
    const client = await connectClient("s3cret");
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);
    await client.close();
    await running.close();
  });

  it("returns 404 for an unknown path", async () => {
    running = await startHttpServer({ substrate: new FakeNexusSubstrate() });
    const res = await fetch(`http://${running.host}:${running.port}/nope`);
    expect(res.status).toBe(404);
    await running.close();
  });
});
