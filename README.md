# Nexus for Alexa+

> **Alexa understands what you want. Nexus Semantic gives Alexa the hands and the map to do it — across the browser, desktop, and mobile apps you already use.**

Amazon **Alexa+ Hackathon 2026** submission. It pairs a real, standards-compliant
**MCP 2025-11-25 Streamable HTTP** server exposing [NexusOS Semantic](https://github.com/nexusos-systems/nexusos-semantic)
capabilities with a simulated Alexa+ web client that turns **one spoken request** into
**cross-substrate execution with semantic verification and explicit safety confirmation.**

```
 "Alexa, get me set up for the Acme review at 3."
        │
        ▼   (simulated Alexa+ client)
   ┌──────────────┐   MCP 2025-11-25 Streamable HTTP   ┌───────────────────────┐
   │  Alexa+ (sim) │ ────────────────────────────────▶ │  Nexus MCP server      │
   └──────────────┘   POST/GET · SSE · Origin-checked  │  query/read/capabilities│
                                                        │  invoke (tier-gated)    │
                                                        │  verify (semantic)      │
                                                        └───────┬───────┬─────────┘
                                                                │       │
                            ┌───────────────┬───────────────────┘       └────────────┐
                            ▼               ▼                    ▼                    ▼
                        Firefox          Chrome              Windows           …macOS/Android/iOS
                        (BiDi)           (CDP)               (UIA)             (as Nexus drivers land)
```

## What makes this different

- **Semantic control, not blind pixel-clicking.** Nexus operates elements by ARIA role, name, and state.
- **Cross-substrate, not one-app automation.** One request spans web + desktop + mobile.
- **Verified state, not assumed success.** Every action is confirmed by a semantic re-read (`ACTION → EXPECTED → OBSERVED → PASS`).
- **Explicit safety boundaries.** Destructive / billing / admin actions are classified `CONFIRM` and require spoken approval before Nexus proceeds.

## The hackathon delta

NexusOS Semantic already spoke MCP over **stdio** and a private TCP JSON-RPC socket. The
Alexa+ track requires a self-hosted MCP server on **spec version 2025-11-25 over Streamable
HTTP**. This project adds exactly that — the required transport — plus the Alexa-facing
experience, cross-substrate orchestration with verification, and the safety-confirmation flow.
See [`docs/hackathon/AMAZON-ALEXA-INVESTIGATION.md`](docs/hackathon/AMAZON-ALEXA-INVESTIGATION.md).

## Requirements

- Node.js **≥ 24**
- npm (or pnpm)

## Setup

```bash
npm install
npm test        # 21 hermetic tests, no browser/driver required
npm run build   # type-check + emit dist/ (copies the web client UI)
```

## Run

Start the MCP Streamable HTTP server **and** the simulated Alexa+ web client:

```bash
npx tsx src/cli.ts serve --client
# MCP Streamable HTTP (2025-11-25) at http://127.0.0.1:8391/mcp
# Alexa+ simulator at http://127.0.0.1:8392/
```

Open `http://127.0.0.1:8392/`, click a suggestion (or speak), and watch one request cross
Firefox → Chrome → Windows, verify each step, and pause at the billing **CONFIRM** gate.

### Headless demo / rehearsal (no browser)

```bash
npx tsx src/cli.ts demo "Alexa, get me set up for the Acme review at 3" --confirm
npx tsx src/cli.ts rehearse --runs 5 --required 5   # reliability gate
npx tsx src/cli.ts capabilities                      # full reach, live vs coming
```

### Talk to the MCP server directly (prove the transport)

```bash
curl http://127.0.0.1:8391/healthz          # {"ok":true,"protocol":"2025-11-25"}
```

Any MCP 2025-11-25 client can `initialize → tools/list → tools/call` against
`http://127.0.0.1:8391/mcp`. A bearer token can be required with `--token <secret>`.

## Live web substrate (real Firefox execution)

Firefox is a **genuinely live** substrate: `src/nexus/firefox.ts` drives a real Firefox via
geckodriver using NexusOS Semantic's own WebDriver BiDi client — real semantic reads, a real
click on the app's own control, and verification by re-reading the app's own state.

```bash
# 1. geckodriver (started with the BiDi origin allowlist) + Firefox installed
geckodriver --port 4444 --allow-origins http://127.0.0.1:9222

# 2. a target web app (the NexusOS Semantic demo SaaS works out of the box)
node path/to/nexusos-semantic/demo/saas/server.cjs   # serves http://127.0.0.1:7311

# 3. serve with Firefox bound to the real driver
npx tsx src/cli.ts serve --client --web-app http://127.0.0.1:7311
#   firefox: real   chrome/windows/…: simulated

# quick standalone proof (no MCP): real read -> real theme switch -> real verify
npx tsx scripts/live-firefox.ts http://127.0.0.1:7311
```

In the web client, ask *"switch the app to dark mode and show me the design tokens"* — Firefox
reads the live theme, extracts the app's real CSS design tokens, clicks the real theme toggle,
and verifies the change, all labeled **live**.

## Bringing real Nexus substrates online

The system is designed so real Nexus functionality **just connects** — no changes to the
orchestrator, planner, client, or transport. Substrates are simulated by default and clearly
labeled; mark a substrate `real` and it is served by a live Nexus MCP server.

```bash
# Option A — env
export NEXUS_ALEXA_REAL="firefox"
export NEXUS_CMD="nexus"
export NEXUS_ARGS="serve --graph ./my-crawl"
npx tsx src/cli.ts serve --client

# Option B — config file (see nexus-alexa.config.example.json)
export NEXUS_ALEXA_CONFIG="./nexus-alexa.config.json"
npx tsx src/cli.ts serve --client
```

Each substrate reports its backing (`real` / `simulated`) on startup and in the web client,
so the demo is always truthful about what runs live.

## Architecture

| Module | Responsibility |
|---|---|
| `src/mcp/http.ts` | MCP 2025-11-25 Streamable HTTP server (Origin/DNS-rebind protection, localhost bind, bearer auth, protocol negotiation) |
| `src/mcp/server.ts` | Registers the Nexus tool surface (`nexus_query/read/capabilities/invoke/verify`) |
| `src/nexus/security.ts` | Security tiers `DISCOVER/READ/PROPOSE/EXECUTE/CONFIRM` + the gate (mirrors NexusOS Semantic) |
| `src/nexus/substrate.ts` | `NexusSubstrate` contract + deterministic `FakeNexusSubstrate` |
| `src/nexus/real.ts` | `RealNexusSubstrate` — binds to a live Nexus MCP server |
| `src/nexus/composite.ts` | Per-substrate real/simulated routing with truthful backing labels |
| `src/nexus/manifest.ts` | Full cross-substrate capability list with `live`/`coming` readiness |
| `src/plan.ts` | Objective → ordered cross-substrate plan (LLM/Bedrock can slot in behind `PlanBuilder`) |
| `src/orchestrator.ts` | Executes a plan with per-step verification + CONFIRM handling; emits live events |
| `src/client/` | Simulated Alexa+ web client (voice, confirmation cards, execution visualizer) |
| `src/rehearse.ts` | Reliability harness (N clean runs with deterministic reset) |

## Safety model

Every capability invocation — including native desktop/mobile kinetics — is routed through
the tier gate **before** any substrate contact. `CONFIRM`-tier actions (matched by destructive
verbs or billing/payment/admin keywords) are blocked unless explicitly confirmed; the client
surfaces this as a spoken confirmation card.

## Note on the Alexa+ interface

Per the hackathon rules, the Alexa+ experience is **simulated** in this web app. All Nexus tool
calls run over a **real** MCP 2025-11-25 Streamable HTTP server. Capabilities shown as `live`
execute for real; capabilities shown as `coming` are labeled roadmap and are never presented as
working.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
