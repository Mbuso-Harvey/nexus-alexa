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

## Release-correctness pass — 2026-09-20 (frozen submission state)

No new capabilities, no architecture changes; the proven Firefox → Windows execution path is untouched.

| Layer | Check | Result |
|---|---|---|
| Alexa | `npm test` | PASS: 28/28 (adds AWS-credential-chain regression coverage) |
| Alexa | `npm run typecheck` | PASS |
| Alexa | `npm run build` | PASS |
| Alexa | `npm audit --audit-level=moderate` | 0 vulnerabilities |
| Bedrock | credential discovery | Standard AWS SDK provider chain (`@aws-sdk/credential-providers` `fromNodeProviderChain`, env → SSO → shared INI → IMDS). Live: default profile created by `aws configure` detected in 37 ms with NO `AWS_PROFILE`/access-key env vars; real Bedrock plan produced (6 steps) with an enabled model; graceful deterministic fallback when the default model is not enabled on the account |
| Bedrock wording | docs vs implementation | "Arbitrary/free-form live capability discovery" claims removed; docs now state declared-manifest grounding + constrained headline workflow (matches `headlinePlanComplete` + manifest filtering) |
| Boundary | `_research_awg` internal material | Relocated intact to machine-local archive outside both repos: `docs/COMMERCIAL_STRATEGY.md`, `docs/BRANDING_AND_NAMING_TAXONOMY.md`, `docs/COSMOS_AGENT_INTEGRATION_INSTRUCTIONS.md`, `docs/nexus-perf-cost-map.md`, all internal PR gate logs/audits/branch-protection configs, cosmos agent state (`.cosmos/`, `cosmos.environment.json`, `_hook_smoke.md`). 52 files, +13/−13,632 — docs/tooling-state only, zero runtime code delta vs the certified runtime. `.gitignore` now rejects these paths |
| Secrets | pattern scan of tracked tree | 0 real secrets (2 hits are fake test fixtures: `ghp_testtoken12345`) |
| Identity | engine dependency | Public repo `Mbuso-Harvey/nexusos-semantic` (fresh release history) + pinned tag `nexus-alexa-submission-v1` (commit `b0fd3b9`); judge-facing docs reference the public repository/URL, not the dev-workspace sibling |
| Public packaging | fresh-history public repo | `Mbuso-Harvey/nexusos-semantic` @ `b0fd3b9` — single-commit release history, exactly the boundary-clean release tree, Apache-2.0 detectable; tag `nexus-alexa-submission-v1` on the actual public commit; logged-out cold-clone → full Firefox + Windows + Bedrock run is the final release gate before recording |
| Nexus | build + targeted MCP/desktop tests at `e180b24` | PASS: build clean; targeted 43/43 (2 files); security suite 40/40 (3 files) |

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
