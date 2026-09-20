# Submission Readiness Evidence

This ledger distinguishes Nexus product evidence, Alexa integration evidence, live Nexus-only proof, and external publication/account tasks.

## Verified locally — 2026-09-19 (final code, sole-engine build)

Environment: Windows; Node `v24.20.0`; npm `11.19.0`; pnpm `11.9.0`; Mozilla geckodriver `0.37.1` (WinGet); Firefox `156.0`; classic Notepad.

| Layer | Check | Result |
|---|---|---|
| Alexa | `npm test` | PASS: 26/26 |
| Alexa | `npm run typecheck` | PASS |
| Alexa | `npm run build` | PASS (dist cleaned first; no stale adapters) |
| Alexa | `npm audit --audit-level=moderate` | 0 vulnerabilities |
| Nexus | `pnpm run build` after runtime changes | PASS |
| Nexus | targeted MCP/desktop/UIA tests | PASS: 53/53 (4 files) |
| Nexus | broad `pnpm test` | 966 passed, 14 skipped; 1 gated e2e test failed only because geckodriver was not on 4444 for that file (mandatory `AWG_REAL_BIDI=1` hard-fail), no code regression |
| Nexus graph | clean crawl of bundled fixture | PASS: 7 pages, 0 failed, 0 extractor failures, 95% health |
| Nexus graph | `nexus inspect --json` | 95% health; 7/7 pages; 408 AX; 143 capabilities; 50 states; 5,800 edges; 22 tokens |
| Product boundary | Alexa live builder | One shared `RealNexusSubstrate`; startup validates required Nexus tools and fails closed |
| Bypass removal | source/proof search | Direct Alexa Firefox/Windows adapters and vendored Nexus runtime deleted; `--web-app` throws |
| Graph provenance | crawl metadata | Regenerated 2026-09-19T16:41→16:42; real Firefox `156.0`; no synthetic timestamps |
| Truthfulness | reveal panel stats | Reveal reads graph stats live from `graph.json` (no hardcoded counts) |

## Nexus-only gates — ALL GREEN on final code (2026-09-19)

| Gate | Marker | Result |
|---|---|---|
| Focused web | `NEXUS GRAPH INVOCATION PROVEN` | PASS |
| Full web | `NEXUS WEB RUNTIME PROVEN` | PASS (5/5 firefox steps) |
| Windows | `NEXUS WINDOWS RUNTIME PROVEN` | PASS (exact UIA read-back) |
| Combined | `NEXUS-ONLY CROSS-SUBSTRATE DEMO PROVEN` | PASS (one Nexus process, 5/5 + 1/1, CONFIRM beat) |
| Reliability | `CLEAN RUNS: 5/5` | PASS |

Five unlabeled textboxes remain in non-demonstrated fixture pages (tickets/settings). They reduce graph health to 95% but do not affect the theme, safety, token, or desktop path.

## Final evidence template

```text
Alexa commit:
Nexus commit:
Machine/date:
Alexa tests/typecheck/build/audit:
Nexus build/targeted tests:
Focused web proof:
Full web proof:
Windows proof:
Combined proof (one Nexus process):
Five-run reliability:
Planner badge in recorded take:
Public repository checks:
Public video check:
Devpost preview check:
```
