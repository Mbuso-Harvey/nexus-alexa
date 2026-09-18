/**
 * The Nexus MCP server.
 *
 * Registers the Nexus semantic + kinetic tool surface on an `McpServer`. This is the
 * runtime "track technology" for the Alexa+ submission: an MCP server whose tools are
 * imported and actually called. It is transport-agnostic — the same server is exposed
 * over Streamable HTTP (the required 2025-11-25 transport; see `mcp/http.ts`) and can
 * equally be driven in-process (see `orchestrator.ts`).
 *
 * Every capability invocation is routed through the security tier gate, including the
 * substrates whose raw Nexus MCP tools are not yet gated (investigation gap R4).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NexusSubstrate } from "../nexus/substrate.js";
import type { Substrate } from "../types.js";

const SUBSTRATE = z.enum([
  "firefox",
  "chrome",
  "windows",
  "macos",
  "android",
  "ios",
]);

export const SERVER_NAME = "nexus-alexa";
export const SERVER_VERSION = "0.1.0";

/** Build the Nexus MCP server bound to a given substrate implementation. */
export function buildNexusMcpServer(substrate: NexusSubstrate): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "nexus_substrates",
    {
      title: "List available substrates",
      description:
        "List the digital environments (web/desktop/mobile) Nexus can currently operate.",
      inputSchema: {},
    },
    async () => {
      const subs = await substrate.availableSubstrates();
      return { content: [{ type: "text", text: JSON.stringify({ substrates: subs }) }] };
    },
  );

  server.registerTool(
    "nexus_query",
    {
      title: "Semantic query",
      description:
        "Find elements in a substrate's accessibility graph by search term and/or ARIA role. Returns compact semantic nodes, not pixels.",
      inputSchema: {
        substrate: SUBSTRATE,
        find: z.string().optional(),
        role: z.string().optional(),
      },
    },
    async ({ substrate: sub, find, role }) => {
      const nodes = await substrate.query({ substrate: sub as Substrate, find, role });
      return { content: [{ type: "text", text: JSON.stringify({ nodes }) }] };
    },
  );

  server.registerTool(
    "nexus_read",
    {
      title: "Read node state",
      description:
        "Read the current semantic state of a single element (used for verification).",
      inputSchema: { substrate: SUBSTRATE, axId: z.string() },
    },
    async ({ substrate: sub, axId }) => {
      const node = await substrate.read(sub as Substrate, axId);
      return { content: [{ type: "text", text: JSON.stringify({ node }) }] };
    },
  );

  server.registerTool(
    "nexus_capabilities",
    {
      title: "Discover capabilities",
      description:
        "Enumerate executable capabilities in a substrate, with their security tier (DISCOVER/READ/PROPOSE/EXECUTE/CONFIRM).",
      inputSchema: { substrate: SUBSTRATE, find: z.string().optional() },
    },
    async ({ substrate: sub, find }) => {
      const capabilities = await substrate.capabilities(sub as Substrate, find);
      return { content: [{ type: "text", text: JSON.stringify({ capabilities }) }] };
    },
  );

  server.registerTool(
    "nexus_invoke",
    {
      title: "Invoke capability (tier-gated)",
      description:
        "Invoke a capability on a substrate. CONFIRM-tier actions (destructive/billing/admin) are BLOCKED unless confirm=true — no substrate contact occurs when blocked.",
      inputSchema: {
        substrate: SUBSTRATE,
        capabilityId: z.string(),
        inputs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        confirm: z.boolean().optional(),
      },
    },
    async ({ substrate: sub, capabilityId, inputs, confirm }) => {
      const result = await substrate.invoke({
        substrate: sub as Substrate,
        capabilityId,
        inputs,
        confirm,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        isError: !result.ok && !result.requireConfirm,
      };
    },
  );

  server.registerTool(
    "nexus_verify",
    {
      title: "Verify state semantically",
      description:
        "Confirm that an element reached an expected state by semantic re-read (ACTION -> EXPECTED -> OBSERVED -> PASS), instead of assuming success.",
      inputSchema: {
        substrate: SUBSTRATE,
        capabilityId: z.string(),
        axId: z.string(),
        expected: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean(), z.null()]),
        ),
      },
    },
    async ({ substrate: sub, capabilityId, axId, expected }) => {
      const verification = await substrate.verify({
        substrate: sub as Substrate,
        capabilityId,
        axId,
        expected,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(verification) }],
        isError: !verification.pass,
      };
    },
  );

  return server;
}
