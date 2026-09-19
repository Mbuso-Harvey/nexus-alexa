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
                        Firefox          Windows             Chrome            …macOS/Android/iOS
                        (BiDi) LIVE       (UIA) LIVE          (CDP, in Nexus)   (roadmap)
```

**Live in this demo:** Firefox (web) + Windows (native desktop). Chrome/CDP is implemented in
Nexus but not stood up in the recorded demo; macOS/Android/iOS are roadmap through the same seam.

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
npm test        # 26 hermetic tests, no browser/driver required
npm run build   # type-check + emit dist/ (copies the web client UI)
```

## Run

Start the MCP Streamable HTTP server **and** the simulated Alexa+ web client:

```bash
npx tsx src/cli.ts serve --client
# MCP Streamable HTTP (2025-11-25) at http://127.0.0.1:8391/mcp
# Alexa+ simulator at http://127.0.0.1:8392/
```

Without extra flags every substrate is **simulated** (clearly labelled in the UI) — a quick way
to see the interaction model and the MCP server. To run the **real live demo** (Firefox web +
Windows native desktop), use the `--web-app ... --desktop` invocation in
[Live substrates](#live-substrates-real-firefox--real-windows-the-cross-substrate-crossing) below.

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

## Live substrates: real Firefox + real Windows (the cross-substrate crossing)

Two substrates run **genuinely live** in this demo, both driven through NexusOS Semantic:

- **Firefox (web)** — `src/nexus/firefox.ts` drives a real Firefox via geckodriver using Nexus's
  own WebDriver BiDi client: real semantic reads, real clicks on the app's own controls, design-
  token extraction, and verification by re-reading the app's state.
- **Windows (native desktop)** — `src/nexus/windows.ts` operates a real native app (classic
  Notepad) using **only** Nexus's shipped Windows UIA capabilities (list / scrape / focus /
  click / type). It targets the editor element the Nexus way (scrape for the element's geometry,
  click it, then type) and verifies via Nexus's own scrape read-back (the native unsaved-changes
  state), not a UI self-report.

One spoken request crosses **from the web app into the native desktop app** through the same
semantic execution architecture — the core Nexus thesis.

```bash
# 1. geckodriver (BiDi origin allowlist) + Firefox installed
geckodriver --port 4444 --allow-origins http://127.0.0.1:9222

# 2. the NexusOS Semantic demo SaaS
node path/to/nexusos-semantic/demo/saas/server.cjs   # serves http://127.0.0.1:7311

# 3. serve with BOTH real substrates: Firefox (web) + Windows (native)
npx tsx src/cli.ts serve --client --web-app http://127.0.0.1:7311 --desktop
#   firefox: real   windows: real   (chrome/macos/android/ios: simulated / roadmap)
```

In the client, ask *"set me up for the Acme review"* — Nexus reads the web app, extracts its real
design tokens, files a ticket, reads the admin-only view, **pauses at a destructive control for
confirmation**, switches the theme to dark, and then **writes the review brief into the real
native Windows editor** — verifying each step.

### Proofs (real, not hermetic)
```bash
npx tsx scripts/live-firefox-full.ts http://127.0.0.1:7311   # Firefox substrate
npx tsx scripts/live-windows.ts                              # Windows native substrate
npx tsx scripts/live-combined.ts http://127.0.0.1:7311       # the full Firefox -> Windows crossing
powershell -File scripts/reliability-gate.ps1 -Runs 5        # 5x clean, reset between runs
```

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
| `src/nexus/firefox.ts` | Live **Firefox** substrate (Nexus BiDi client, vendored) |
| `src/nexus/windows.ts` | Live **Windows** native substrate (Nexus UIA bridge, vendored) |
| `src/nexus/real.ts` | `RealNexusSubstrate` — binds to a live Nexus MCP server |
| `src/nexus/composite.ts` | Per-substrate real/simulated routing with truthful backing labels |
| `src/nexus/manifest.ts` | Capability list with honest readiness: `live-demo` / `implemented` / `roadmap` |
| `vendor/nexus/` | Vendored, unmodified NexusOS Semantic subset (Apache-2.0) for reproducibility |
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
calls run over a **real** MCP 2025-11-25 Streamable HTTP server. Readiness is labeled honestly:
`live-demo` capabilities (Firefox web + the Windows native brief) execute for real on camera;
`implemented` (Chrome/CDP) ships in Nexus but is not stood up in the recorded demo; `roadmap`
(macOS/Android/iOS) connects through the same seam as Nexus lands it and is never shown as working.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
