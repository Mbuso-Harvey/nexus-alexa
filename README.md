# Alexa Action Mode — powered by Nexus Semantic

> One ordinary Alexa request. A real browser changes, a sensitive action pauses, and the verified result appears in a native Windows app.

This Amazon Alexa+ Hackathon project is the first client experience powered end-to-end by **Nexus Semantic**, our cross-environment execution engine. The main demo deliberately leads with the outcome; the **How did Alexa do that?** reveal then shows the engine behind it.

The Alexa+ presentation is simulated as permitted by the rules. Everything after the request crosses real MCP boundaries:

```text
Alexa+ simulator
  -> MCP 2025-11-25 Streamable HTTP gateway
    -> one Nexus MCP stdio runtime
      -> semantic graph + safety policy + WebDriver BiDi + Windows UIA + live verification
```

The browser UI contains no browser driver, UIA bridge, or direct application automation. Live startup fails if the genuine Nexus runtime or required tools are unavailable.

## The live outcome

Ask: **“Alexa, set me up for the Acme review.”**

1. Map the app’s semantic controls from the Nexus graph.
2. Export its design system as W3C DTCG tokens.
3. Read the current appearance from the live Firefox page.
4. Resolve and invoke the graph capability that changes the theme, then verify dark mode from live state.
5. Reach a CONFIRM-tier account action and pause before Nexus touches it.
6. Carry the verified result into native Notepad through Nexus Windows UIA, with exact text read-back.

Firefox and Windows are two different live substrates owned by the same Nexus process.

## Truthful scope

| Surface | Status |
|---|---|
| Alexa+ voice/presentation | Simulated and visibly labeled |
| MCP 2025-11-25 HTTP gateway | Real |
| Nexus MCP stdio product runtime | Real and mandatory for live mode |
| Firefox graph/BiDi execution | Live through Nexus |
| Windows UIA execution | Live through Nexus |
| Amazon Bedrock planning | Optional; declared-manifest grounding; claim only when the UI badge proves it |
| Chrome/CDP | Implemented in Nexus, not shown in this take |
| macOS/Android/iOS | Roadmap, never presented as live |

## Repositories and prerequisites

- `nexus-alexa/` (this repository) — Alexa experience, HTTP MCP gateway, orchestration, demo fixture, and evidence.
- **Nexus Semantic** (the engine) — the public repository [`nexusos-systems/nexusos-semantic`](https://github.com/nexusos-systems/nexusos-semantic), pinned for this submission at tag `nexus-alexa-submission-v1` (commit `e180b24`; runtime code identical to the certified build — the tag adds the release-boundary cleanup only).

A clean clone is deterministic. Clone the engine and check out the pinned tag:

```powershell
git clone https://github.com/nexusos-systems/nexusos-semantic
git -C nexusos-semantic checkout nexus-alexa-submission-v1
```

In this development workspace the engine is checked out as the sibling `_research_awg/`. That layout is a local convenience only — judges and cold cloners check out the pinned tag and pass their own checkout path via `--nexus-root`/`--graph`/`--target-app`.

Requirements: Windows, Node.js 24.x or 26+, npm, pnpm 11+, Firefox, geckodriver, PowerShell, and classic Notepad. AWS credentials/model access are optional.

## Validate

```powershell
# Alexa repository
npm install
npm test
npm run typecheck
npm run build
npm audit --audit-level=moderate

# Nexus Semantic engine — pinned tag nexus-alexa-submission-v1
# (..\_research_awg is this dev workspace's checkout)
pnpm --dir ..\_research_awg install
pnpm --dir ..\_research_awg run build
pnpm --dir ..\_research_awg exec vitest run test/server/mcp-server.test.ts test/desktop/mcp-desktop-tools.test.ts
```

The committed `demo/nexus-graph` is not hand-authored Alexa metadata. It is the output of a clean Nexus crawl, read live by the reveal panel at serve time: 7 pages, 408 semantic nodes, 143 capabilities, 50 interaction states, 5,800 relationships, and 22 design tokens. Regenerate it with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/prepare-nexus-graph.ps1
```

## Run the hidden-engine demo

Close unrelated focus-stealing apps, then:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-hidden-engine-demo.ps1
```

Open `http://127.0.0.1:8392/`. The primary interface says **Alexa+ Action Mode**, shows real application outcomes, and identifies the middle layer only as **Execution engine**. Select **How did Alexa do that?** when it is time to reveal Nexus.

Equivalent manual gateway command:

```powershell
# --nexus-root points at your checkout of the pinned engine tag
# (..\_research_awg in this dev workspace)
npx tsx src/cli.ts serve --client `
  --nexus-root ..\_research_awg `
  --graph .\demo\nexus-graph `
  --target-app http://127.0.0.1:7312 `
  --desktop
```

The old `--web-app` direct-driver mode intentionally fails. There is no live bypass around Nexus.

## Proof commands

With the demo SaaS on port 7312, fresh geckodriver on 4444, and Notepad open:

```powershell
npx tsx scripts/live-firefox.ts
npx tsx scripts/live-firefox-full.ts
npx tsx scripts/live-windows.ts
npx tsx scripts/live-combined.ts
powershell -ExecutionPolicy Bypass -File scripts/reliability-gate.ps1 -Runs 5
```

The combined proof requires exactly one Nexus child process and prints `NEXUS-ONLY CROSS-SUBSTRATE DEMO PROVEN` only when all five web steps, the Windows step, confirmation, and verification pass.

## Architecture

| Path | Responsibility |
|---|---|
| `src/client/` | Simulated Alexa+ UX; no application automation |
| `src/mcp/http.ts` | Required self-hosted MCP 2025-11-25 Streamable HTTP gateway |
| `src/orchestrator.ts` | Ordered UX flow and confirmation handoff |
| `src/nexus/real.ts` | Thin translator to one genuine Nexus MCP process |
| `src/nexus/build.ts` | Enforces one shared runtime; no direct live adapters |
| `demo/nexus-graph/` | Committed Nexus crawl artifact |
| `nexusos-semantic` `src/server/mcp-server.ts` | Nexus graph/live/desktop MCP tools |
| `nexusos-semantic` `src/server/invoke.ts` | Nexus capability resolution, safety gate, and BiDi invocation |
| `nexusos-semantic` `src/desktop/windows/` | Nexus Windows UIA substrate and exact text verification |

Engine paths are relative to the pinned NexusOS Semantic checkout (tag `nexus-alexa-submission-v1`; `../_research_awg` in this dev workspace).

Offline fake substrates remain only for labeled hermetic tests and rehearsal. They are not evidence for live claims.

## Evidence

See `docs/hackathon/READINESS-EVIDENCE.md`, `DEMO-RUNBOOK.md`, and `FRICTION-LOG.md`. The evidence ledger distinguishes product tests, Nexus-only live proofs, and external publication/account tasks.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. Nexus Semantic is the separate public repository [`nexusos-systems/nexusos-semantic`](https://github.com/nexusos-systems/nexusos-semantic), pinned for this submission at tag `nexus-alexa-submission-v1` (commit `e180b24`).
