# Product Feedback — Amazon Alexa+ Hackathon 2026

Required submission content: for each developer tool / API / SDK used, what it was for, what
worked, what needs work, the onboarding experience, and whether we'd use it again. Written from
real usage during this build; updated as the project evolves.

---

## 1. Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk` 1.30.0)

**Used for:** The MCP server + the required 2025-11-25 Streamable HTTP transport
(`StreamableHTTPServerTransport`), and as the MCP client both in the Alexa simulator and in
tests (`Client`, `StreamableHTTPClientTransport`, `StdioClientTransport`).

**What worked well:**
- `StreamableHTTPServerTransport` implements the 2025-11-25 spec out of the box — POST/GET on a
  single endpoint, SSE streaming, session IDs, and DNS-rebinding protection via
  `enableDnsRebindingProtection` + `allowedOrigins`/`allowedHosts`. It returns HTTP 403 on an
  invalid Origin/Host exactly as the spec requires.
- `LATEST_PROTOCOL_VERSION` is already `2025-11-25`, so protocol negotiation needed no custom
  code — the required version is the default.
- `registerTool(name, { title, description, inputSchema }, handler)` with zod schemas is clean
  and the client/server handshake "just works" across stdio and Streamable HTTP with the same
  tool registrations.

**What needs work:**
- Discoverability of the Streamable HTTP support: `npm view … exports` did not surface a
  `streamableHttp` subpath clearly; we confirmed it by inspecting the installed
  `dist/esm/server/streamableHttp.js`. A prominent "Streamable HTTP server in 20 lines" doc entry
  keyed to the 2025-11-25 spec would save time.
- Header/behaviour details (e.g. Host validation running ahead of Origin, and 400 vs 403 cases)
  are only discoverable by reading the transport source. A short conformance table would help.

**Onboarding (zero → hello world):** Fast. From `npm install` to a passing
`initialize → tools/list → tools/call` conformance test was well under an hour, most of which
was writing tests, not fighting the SDK.

**Would use again:** **Yes.** It made the hardest hackathon requirement (a spec-compliant
2025-11-25 Streamable HTTP MCP server) largely a configuration exercise rather than a protocol
implementation.

---

## 2. NexusOS Semantic (the substrate under test)

**Used for:** The semantic + kinetic capability surface Alexa reaches through MCP — query, read,
capability discovery, tier-gated invoke, and verification across Web/Desktop/Mobile. Integrated
via a stable `NexusSubstrate` contract and a `RealNexusSubstrate` adapter that speaks to a running
Nexus MCP server.

**What worked well:**
- The `AxTreeNode` semantic model and the `graph_query/graph_tool/graph_invoke/graph_explain`
  surface map cleanly onto an Alexa "find it → do it → verify it" flow.
- The `DISCOVER/READ/PROPOSE/EXECUTE/CONFIRM` tier model is exactly the safety primitive a voice
  agent needs; we mirror it 1:1 and enforce it at the gateway.

**What needs work:**
- The MCP server spoke only stdio + a private TCP JSON-RPC socket; no Streamable HTTP (this
  project adds it).
- Native desktop/mobile kinetic tools weren't routed through the tier gate; we route all
  invocations through the gate at the gateway to close that gap.

**Would use again:** **Yes** — it's the differentiator. Nexus is what lets Alexa operate apps
that never built an Alexa integration.

---

## 3. Node.js built-in HTTP (`node:http`) + Node 24 runtime

**Used for:** Hosting the MCP endpoint and the simulator/SSE server.

**What worked well:** Native `fetch`, stable `node:http`, and SSE with zero extra dependencies
keeps the footprint tiny and the repo easy for a judge to run.

**Would use again:** **Yes.**

---

## 4. Web Speech API (browser) — voice in/out for the simulator

**Used for:** Spoken request capture (`SpeechRecognition`) and Alexa's spoken responses
(`speechSynthesis`) in the simulated client.

**What worked well:** No install; good enough for a reliable on-camera demo.

**What needs work:** `SpeechRecognition` support is browser-specific; we feature-detect and
disable the mic gracefully where unavailable (typed input still works).

**Would use again:** **Yes**, for a simulation layer. For production Alexa+ the real ASR/TTS is
Alexa's own.

---

## 5. Vitest 2.1

**Used for:** All hermetic + E2E tests (transport conformance, orchestration over real Streamable
HTTP, composite routing, reliability rehearsal).

**What worked well:** Fast, TS-native, minimal config.

**What needs work:** Vite discovered an unrelated `postcss.config.js` from a parent directory and
failed until we set `css.postcss` explicitly — a footgun when running inside a nested workspace.

**Would use again:** **Yes.**

---

## 6. Amazon Bedrock (`@aws-sdk/client-bedrock-runtime`) — AWS Builder mini-challenge

**Used for:** The **planning/intent layer**. `BedrockPlanBuilder` (src/plan-bedrock.ts) uses the
Bedrock **Converse API** to turn an arbitrary spoken request into a *validated, ordered plan of
real Nexus capability invocations*, grounded in the live capability manifest. Bedrock does the
hard agentic reasoning (which capabilities, in what order, with what inputs); Nexus executes and
semantically verifies the plan over MCP 2025-11-25 Streamable HTTP. This is a purposeful
multi-service architecture (Bedrock plans → Nexus executes/verifies), not a single decorative
text-generation call.

**Why it's not "obvious":**
- The model is constrained to the real capability catalogue; hallucinated capabilities are
  dropped during validation before anything touches a substrate.
- Safety is still enforced downstream by Nexus's tier gate regardless of the model's output.
- It unlocks open-ended natural language ("tidy up my workspace and darken the UI") instead of
  keyword matching, while the deterministic planners remain as a guaranteed fallback.

**What worked well:**
- The Converse API is model-agnostic and gives a clean `system` + `messages` shape; temperature 0
  yields stable JSON plans.
- Dynamic import of the SDK keeps the offline demo dependency-light — no AWS calls unless
  credentials are present.

**What needs work:**
- Model availability differs by region/account; a first call can fail with access-not-granted
  until the model is enabled in the Bedrock console. We handle this by falling back silently to
  the deterministic planner and surfacing a "planned deterministically" label.

**Onboarding:** Straightforward with an AWS account that has Bedrock model access enabled and
standard credentials (`AWS_PROFILE` / keys) + `AWS_REGION`.

**Would use again:** **Yes** — Bedrock is a strong fit for the "understand-and-plan" layer above
a deterministic execution/verification substrate.

**Dev tooling:** Development is done with **Kiro** (Kiro Crew qualifies as a hackathon dev tool on
its own for the AWS Builder mini-challenge, independent of the runtime Bedrock integration above).
