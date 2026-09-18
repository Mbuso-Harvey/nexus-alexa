/**
 * End-to-end: the orchestrator drives the full review-prep plan over the REAL MCP
 * 2025-11-25 Streamable HTTP transport (not in-process). This proves the required track
 * technology is the actual execution path: Alexa client -> Streamable HTTP -> Nexus tools
 * -> cross-substrate execution -> semantic verification -> CONFIRM gate.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startHttpServer, type RunningHttpServer } from "../src/mcp/http.js";
import { FakeNexusSubstrate } from "../src/nexus/substrate.js";
import { ScenarioPlanBuilder } from "../src/plan.js";
import { Orchestrator, httpToolCaller } from "../src/orchestrator.js";

let running: RunningHttpServer;
let client: Client;

describe("E2E orchestration over Streamable HTTP", () => {
  beforeEach(async () => {
    running = await startHttpServer({ substrate: new FakeNexusSubstrate({ ready: "all" }) });
    client = new Client({ name: "alexa-sim", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(running.url)));
  });
  afterEach(async () => {
    await client.close();
    await running.close();
  });

  it("completes the review-prep plan across substrates with CONFIRM granted", async () => {
    const plan = new ScenarioPlanBuilder().build("get me set up for the Acme review")!;
    const orch = new Orchestrator(httpToolCaller(client));

    const confirmSeen: string[] = [];
    const result = await orch.run(plan, {
      confirm: async (step) => {
        confirmSeen.push(step.capabilityId!);
        return true; // grant on camera / spoken "yes"
      },
    });

    expect(result.ok).toBe(true);
    expect(confirmSeen).toContain("enable_billing_alerts");

    // Verify real post-state through the same HTTP tool surface.
    const read = await client.callTool({
      name: "nexus_read",
      arguments: { substrate: "firefox", axId: "billing.alerts" },
    });
    const node = JSON.parse((read as any).content[0].text).node;
    expect(node.state.value).toBe("on");
  });

  it("blocks the sensitive step when confirmation is denied", async () => {
    const plan = new ScenarioPlanBuilder().build("get me set up for the Acme review")!;
    const orch = new Orchestrator(httpToolCaller(client));
    const result = await orch.run(plan, { confirm: async () => false });

    const billingStep = result.steps.find((s) => s.step.capabilityId === "enable_billing_alerts");
    expect(billingStep?.pass).toBe(false);

    // Prove no state change on denial.
    const read = await client.callTool({
      name: "nexus_read",
      arguments: { substrate: "firefox", axId: "billing.alerts" },
    });
    const node = JSON.parse((read as any).content[0].text).node;
    expect(node.state.value).toBe("off");
  });
});
