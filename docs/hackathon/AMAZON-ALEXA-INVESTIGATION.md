# Amazon Alexa+ Hackathon 2026 — Investigation (Deliverable #1)

**Project working title:** Nexus for Alexa+
**Substrate:** NexusOS Semantic (private reference repo `Mbuso-Harvey/agent-web-graph`, read-only research clone)
**Prepared:** 2026-09-18
**Phase:** Investigation only. No implementation. Awaiting `EXECUTE`.

> Sources of truth: the official Devpost rules (fetched 2026-09-18), the MCP 2025-11-25
> transport spec (fetched 2026-09-18), and the actual NexusOS Semantic code at HEAD of the
> research clone. Every capability claim below is tagged with a verification status and, where
> relevant, a `file` citation.

---

## A. Competition requirement matrix

| # | Requirement | Class | Official source |
|---|---|---|---|
| A1 | Build a working Agent Skill **OR** a self-hosted MCP server implementing MCP spec **2025-11-25** (minimum) over **Streamable HTTP** | REQUIRED (choose one technical path) | Devpost Rules → Project Requirements → Alexa+ |
| A2 | Alternative: **simulate** the Alexa+ experience in a web app using any agentic tool (no specific SDK/MCP surface); simulation source must be in the repo; video must clearly show the simulated experience | REQUIRED-ALTERNATIVE (exempt from A3 runtime hook) | Devpost Rules → Submission Requirements → Alexa+ |
| A3 | For the non-simulation path: repo must demonstrate the track's required tech **at runtime** — imported and actually called (entry point / loaded MCP config), not merely named in README | REQUIRED (non-sim path) | Devpost Rules → Submission Requirements |
| A4 | Public GitHub repo with a **detectable OSS license** in the About section, **OR** private repo shared with `testing@devpost.com` and `@AmazonAppDev` | REQUIRED | Devpost Rules → Submission Requirements |
| A5 | Repo contains all source, assets, and **setup + run instructions** to be functional | REQUIRED | Devpost Rules → Submission Requirements |
| A6 | Demonstration video **< 3 minutes**, public on YouTube/Vimeo, shows the project functioning on the target platform | REQUIRED | Devpost Rules → Submission Requirements → video |
| A7 | If the project existed before the submission window, it must be **significantly updated after Aug 31 2026**, with the new work clearly explained and demoed | REQUIRED (applies to us — Nexus predates the window) | Devpost Rules → New & Existing |
| A8 | Text description of features/functionality | REQUIRED | Devpost Rules → Submission Requirements |
| A9 | **Product Feedback** for each tool/API/SDK used (what/why, what worked, what needs work, onboarding, would-use-again) | REQUIRED | Devpost Rules → Submission Requirements |
| A10 | Identify Primary Track(s) and Mini Challenge(s) entered | REQUIRED | Devpost Rules → Submission Requirements |
| A11 | Judges must be able to test (repo + video); if private, include credentials in testing instructions; project free to test through the judging period | REQUIRED | Devpost Rules → Testing |
| A12 | English materials (or English translations) | REQUIRED | Devpost Rules → Language |
| A13 | Original work; comply with OSS licenses of anything reused; the submission must **enhance/build upon** the underlying OSS product | REQUIRED | Devpost Rules → IP |
| B1 | **Friction Log** entries — up to **10% judging bonus** | BONUS (we treat as mandatory) | Devpost Rules → Submission Requirements (optional) + Judging → Bonus Points |
| B2 | **Open Source mini-challenge** — a new repo/branch/fork/PR made **during the window**, alongside the primary submission; needs contribution URL, repo URL, GitHub username, description ($5k + $5k) | BONUS (strongly pursue) | Devpost Rules → Mini Challenges |
| B3 | **AWS Builder mini-challenge** — a primary-track project incorporating AWS services with documented integrations; **Kiro Crew as a dev tool alone qualifies** (no runtime AWS call required) ($5k + $5k) | BONUS (pursue via Kiro; optional runtime AWS) | Devpost Rules → Mini Challenges |
| C1 | Simulation path exempt from A3 runtime hook, but sim code must be in repo and clearly shown in video | CLARIFICATION | Devpost Rules → Alexa+ |
| D1 | A project can win **one track prize + one mini-challenge prize** | CONSTRAINT | Devpost Rules → Multiple Prize Eligibility |
| U1 | Exact Alexa+ ↔ self-hosted MCP connection mechanism available to an entrant today (portal? onboarding? approval latency? hardware?) | UNCLEAR / NEEDS CONFIRMATION | Not specified in rules; rules only point Alexa+ devs to `modelcontextprotocol.io` getting-started |

**Key reading of A1/A2/A3:** Amazon gives three viable technical shapes: (Path A) Agent Skill,
(Path B) self-hosted MCP server on Streamable HTTP at MCP 2025-11-25, (Path C) simulated Alexa+
web app. Paths A and B must show the tech *called at runtime*. Path C is explicitly exempt from
that hook but still needs its source in the repo and a clear on-camera demo.

---

## B. Nexus capability truth matrix

Legend: **VERIFIED** (code + hermetic/live test or reproducible run) · **IMPL/UNVERIFIED**
(code exists, insufficient evidence here) · **PARTIAL** · **STUB** · **PLANNED** · **BROKEN**.

Environment cells reflect the research clone at HEAD, in *this* Windows environment (no
geckodriver, no Android emulator, no macOS/iOS host present).

| Environment | Discovery | Semantic Read | Query | Navigation | Action | Text Input | State Verify | Safety Tier | Tests | Demo-ready here |
|---|---|---|---|---|---|---|---|---|---|---|
| **Firefox (BiDi)** | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | PARTIAL | VERIFIED | LIVE (self-skip w/o geckodriver:4444) | Needs geckodriver+Firefox install |
| **Chrome (CDP)** | VERIFIED | VERIFIED | VERIFIED (read/snapshot) | VERIFIED | PARTIAL (read/nav/cookies; kinetic via UIA/BiDi, not CDP click) | PARTIAL | PARTIAL | N/A to CDP read tools | HERMETIC (in-proc http+ws mock) | Yes, with Chrome + `--remote-debugging-port` |
| **Windows (UIA)** | VERIFIED | VERIFIED | VERIFIED | N/A | VERIFIED (kinetic) | VERIFIED | PARTIAL | **NOT tier-gated** | HERMETIC (mocked PowerShell) | Yes (native Windows here) |
| **macOS (AX)** | IMPL/UNVERIFIED | IMPL/UNVERIFIED | VERIFIED (normalizer) | N/A | IMPL/UNVERIFIED | IMPL/UNVERIFIED | PARTIAL | **NOT tier-gated** | HERMETIC (mock runner) | No macOS host in this env |
| **Android (UIAutomator2)** | IMPL/UNVERIFIED | VERIFIED (XML parse) | VERIFIED | N/A | IMPL/UNVERIFIED (mocked adb) | IMPL/UNVERIFIED | PARTIAL | **NOT tier-gated** | HERMETIC (sample XML + mock adb) | Needs device/emulator |
| **iOS (WDA)** | STUB | STUB | STUB | N/A | STUB | STUB | STUB | **NOT tier-gated** | **NONE exercising** (WdaClient imported, unused; not wired into any MCP tool) | No — weakest link |

**Cross-cutting VERIFIED capabilities** (substrate-independent):
- Unified `AxTreeNode` normalization across all substrates.
- Semantic query engine (`graph_query`), pathfinder (`graph_path`), capability discovery (`graph_tool`), edge/neighborhood walk (`graph_explain`), extraction health (`graph_diagnostics`).
- Rich **visual layer**: multi-viewport capture, occlusion, spatial edges, visual regression diff, W3C DTCG design-token export/lint (`get_visual*`, `query_visual_regression`, `lint_design_tokens`, `export_dtcg_tokens`).
- **Security tiers** DISCOVER/READ/PROPOSE/EXECUTE/CONFIRM are real and enforced *before* substrate contact on the graph capability path — `file: src/graph/security.ts`, `file: src/server/invoke.ts`, `file: src/graph/tools.ts`.
- SQLite store v2, authenticated-session capture, SEA standalone binary packaging.

**Honest gaps that shape the demo:**
1. **No Streamable HTTP MCP transport.** Only stdio (official SDK) + a hand-rolled TCP JSON-RPC socket exist — `file: src/server/mcp-server.ts`, `file: src/server/server.ts`. This is the single biggest build item for Path B.
2. **iOS is effectively a stub.** Do not put iOS in the demo as a working substrate.
3. **Desktop/mobile kinetic dispatch bypasses the tier gate.** `desktop_kinetic_action` and `mobile_touch_action` call the native dispatcher directly with no `decide()` check — `file: src/server/mcp-server.ts`. If the demo shows autonomous desktop/mobile action, routing these through the tier gate is a credibility + safety must-do.
4. **`--chrome` is not wired through the `serve` CLI** even though `buildMcpServer` supports `opts.chrome` — `file: src/cli/awg.ts`. Small gap to close if Chrome is in the demo.
5. **State layer (Layer 4) is "Partially Restored"**; a recorded crawl of the bundled demo produced `probes=30 hits=0 states=1` — the interaction hit-detection needs attention if state-transition storytelling is central.

---

## C. MCP compliance matrix — current vs required (2025-11-25 Streamable HTTP)

| Aspect | MCP 2025-11-25 requirement | Nexus today | Delta |
|---|---|---|---|
| Transport | Single HTTP endpoint, POST + GET | stdio + raw TCP JSON-RPC; no HTTP | **BUILD Streamable HTTP** |
| POST semantics | JSON-RPC in; return `text/event-stream` or `application/json`; 202 for notifications/responses | N/A | BUILD |
| GET semantics | Open SSE stream, or 405 | N/A | BUILD |
| `Accept` handling | Client sends `application/json` + `text/event-stream`; server honors both | N/A | BUILD |
| Origin validation | MUST validate; 403 on invalid (anti DNS-rebind) | N/A | BUILD |
| Local binding | SHOULD bind 127.0.0.1 when local | TCP defaults to 127.0.0.1 (good pattern to reuse) | ADAPT |
| Auth | SHOULD implement for remote | none | BUILD (bearer token for remote/judge access) |
| Session | Optional `MCP-Session-Id` | none | OPTIONAL |
| Protocol version | `MCP-Protocol-Version` header; negotiate 2025-11-25 | not set (SDK default) | SET explicitly to 2025-11-25 |
| Tool discovery/invocation | initialize → tools/list → tools/call | works over stdio via `@modelcontextprotocol/sdk ^1.30.0` | REUSE (SDK's `StreamableHTTPServerTransport` if version supports it; else thin HTTP shim in front of existing `McpServer`) |
| Backwards compat | May keep stdio | keep stdio for Claude Desktop/Code | KEEP (additive) |

**Compliance strategy:** additive. Keep stdio working. Add a Streamable HTTP transport that
wraps the *same* `McpServer` tool registrations. Prefer the SDK's built-in
`StreamableHTTPServerTransport` (verify it ships in `^1.30.0`; upgrade the SDK if needed).
Explicitly advertise `2025-11-25`, validate `Origin`, bind localhost by default, and add a
bearer-token gate for any non-local/judge access. Product feedback + friction to be logged
against the SDK during this work.

---

## D. Alexa+ integration options

| Path | What it is | Pros | Cons / risk | Fit for us |
|---|---|---|---|---|
| **A. Agent Skill** | Build an Alexa+ Agent Skill | Native Alexa surface | Onboarding/approval latency unknown (U1); least reuse of Nexus's MCP strength | Weak — throws away Nexus's MCP-native design |
| **B. Self-hosted MCP (Streamable HTTP, 2025-11-25)** | Expose Nexus tools to Alexa+ over the required transport | **Directly showcases Nexus's core (MCP semantic control)**; satisfies A1/A3 with real runtime tech; reusable by any MCP client | Requires building the transport; live Alexa+↔server connection mechanism unconfirmed (U1) | **Strong** — this is Nexus's home turf |
| **C. Simulated Alexa+ web app** | A web UI that plays the Alexa+ role and drives real Nexus execution | No dependence on unconfirmed Alexa+ onboarding; total demo reliability; explicitly allowed; great for the <3-min video | Doesn't itself prove "real Alexa+"; must be clearly labeled as simulation | **Strong as the presentation layer** |
| **B + C hybrid** | Build the real MCP server (B) **and** a simulated Alexa+ client (C) that speaks to it over Streamable HTTP | Best of both: real, standards-compliant runtime tech **and** a reliable, judge-legible demo; hedges U1 entirely | Slightly more build | **RECOMMENDED** |

**Why hybrid wins the reliability/creativity tradeoff:** Amazon explicitly permits simulation and
explicitly rewards "agentic workflow that orchestrates across services autonomously." The hybrid
lets the *real* Nexus MCP server (Path B, standards-compliant) be the runtime engine, while a
simulated Alexa+ front-end guarantees a clean, repeatable on-camera story that does not depend on
unconfirmed Alexa+ onboarding timelines (U1). The simulation is clearly labeled; Nexus execution
is 100% real — satisfying the spec's "Alexa+ may be simulated; Nexus should be real" rule.

---

## E. Demo candidates

Each begins with one natural Alexa instruction and requires multi-step, multi-substrate execution.
Substrate availability in *this* environment strongly favors **Web (Firefox/Chrome) + Windows**;
Android is possible with an emulator; iOS and macOS are not demoable here.

### Candidate 1 — "Alexa, get me ready for my 3 o'clock with Acme."
- **Need:** Meeting prep across the tools you already have open.
- **Steps:** (1) Firefox → open CRM (bundled demo SaaS), find the Acme account, read the latest notes [Web read+query]. (2) Chrome → open the shared doc/dashboard tab, pull the current figures [CDP read]. (3) Windows → open Notepad/Notes app, populate a prepared brief [UIA kinetic]. (4) Report a spoken summary + a confirmation card.
- **Substrates:** Firefox, Chrome, Windows. **Nexus exercised:** query, explain, CDP read, UIA kinetic, verification via semantic re-read.
- **Sensitive actions:** none (all READ/EXECUTE). **Reliability:** high. **Difficulty:** medium. **Novelty:** medium-high. **≤3 min:** yes.

### Candidate 2 — "Alexa, change this app's theme to dark and turn on weekly billing alerts." (the canonical brief example, elevated)
- **Need:** Operate a SaaS app by intent, not clicks.
- **Steps:** (1) `graph_query("dark mode")` → Settings→Appearance→Theme [Web]. (2) `graph_invoke set_theme("dark")` [Web EXECUTE]. (3) Navigate to Billing; the "enable alerts" toggle is EXECUTE, but anything touching payment is promoted to **CONFIRM** — Alexa asks for spoken confirmation before proceeding [Web + safety tier on camera]. (4) Verify both states via semantic re-read.
- **Substrates:** Firefox (+ optional Chrome mirror). **Nexus exercised:** the full five-layer story (nav graph, structure, visual, state, capability) + the safety tier boundary, which is a *judge-legible* differentiator.
- **Sensitive actions:** billing → CONFIRM (a feature, shown deliberately). **Reliability:** high. **Difficulty:** low-medium. **Novelty:** medium. **≤3 min:** yes.

### Candidate 3 — "Alexa, set up my new workstation for the design review."
- **Need:** Cross-device readiness.
- **Steps:** (1) Firefox → open the design system site; Nexus extracts the **DTCG design tokens** and a layout summary [Web + visual layer — a genuinely unusual capability]. (2) Chrome → open the review board [CDP read]. (3) Windows → open the editor and drop in a generated tokens file / brief [UIA]. (4) Spoken summary of the extracted design system.
- **Substrates:** Firefox, Chrome, Windows. **Nexus exercised:** the visual/design-intelligence layer that vision-only agents cannot do. **Novelty:** high (design-token extraction by voice is a real "wait, Alexa can do that?" moment). **Reliability:** high. **Difficulty:** medium. **≤3 min:** yes.

### Candidate 4 — "Alexa, prepare everything for my trip tomorrow." (max ambition)
- **Steps:** browser bookings + desktop packing checklist + mobile boarding pass state.
- **Substrates:** Firefox + Windows + Android (emulator). **Novelty:** high; **Reliability:** lower (Android emulator + more steps + more failure surface); **Difficulty:** high; **≤3 min:** tight.

### Candidate 5 — "Alexa, triage my morning: find the failing check and open the fix." (developer story)
- **Steps:** Firefox → open the repo/CI page, find the failing check [Web]; Windows → open VS Code and the offending file [UIA]; spoken summary.
- **Substrates:** Firefox + Windows. **Novelty:** medium-high (developer audience, aligns with Nexus's real identity). **Reliability:** high. **≤3 min:** yes.

---

## F. Competitive scoring (Amazon's four equally-weighted criteria, 1–10)

`Competitive Score = Tech + Design + Impact + Idea` (max 40). Reliability/Risk/Time/Wow scored separately.

| Candidate | Tech | Design | Impact | Idea | **Total** | Reliability | Impl. Risk | Time | Wow |
|---|---|---|---|---|---|---|---|---|---|
| 1 — Meeting prep (Web+Chrome+Win) | 8 | 8 | 9 | 7 | **32** | High | Med | Med | Med-High |
| 2 — Theme + billing w/ CONFIRM (Web) | 8 | 9 | 7 | 7 | **31** | **Very High** | Low | Low | Med |
| 3 — Design-review setup (Web+Chrome+Win) | 9 | 8 | 8 | **9** | **34** | High | Med | Med | **High** |
| 4 — Trip (Web+Win+Android) | 8 | 7 | 8 | 8 | **31** | Low | High | High | High |
| 5 — Dev triage (Web+Win) | 8 | 7 | 7 | 8 | **30** | High | Low-Med | Med | Med-High |

**Reading:** Candidate 3 tops raw score on *Idea* (design intelligence is the least-obvious use
of Alexa and hardest to copy) and stays reliable. Candidate 1 has the broadest *Impact*.
Candidate 2 is the reliability anchor and the cleanest vehicle to *show the safety boundary* — a
differentiator judges immediately understand. The strongest submission **combines them into one
coherent story** rather than forcing all six substrates.

---

## G. Recommended project

**Build the hybrid (Path B + C): a real, standards-compliant Nexus MCP server on Streamable HTTP
(MCP 2025-11-25), driven in the demo by a simulated Alexa+ web client, orchestrating a
cross-substrate task across Firefox, Chrome, and Windows — with the safety tier boundary shown
live and one design-intelligence "wow" beat.**

**Recommended demo story (merged 3 + 1 + 2):**
> "Alexa, get me set up for the Acme design review at 3."
> 1. **Firefox** — open the CRM (bundled demo SaaS), find Acme, read the latest notes. *(Web query/read + verification)*
> 2. **Firefox** — open the design system page; Nexus extracts the **design tokens + layout summary** by voice. *(the "wow": design intelligence)*
> 3. **Chrome** — open the review dashboard tab and read the current figures. *(CDP read on an authenticated tab)*
> 4. **Windows** — open the notes/editor app and drop in the generated brief. *(native UIA kinetic)*
> 5. A step that touches billing/scheduling is **promoted to CONFIRM** — Alexa asks, "This will charge/commit X — confirm?" and only proceeds on spoken approval. *(the safety boundary, on camera)*
> 6. Alexa reports completion; the execution visualizer shows `Alexa → Nexus → Firefox ✓ → Chrome ✓ → Windows ✓`.

**Why this can win:**
- **Tech:** real MCP 2025-11-25 Streamable HTTP server (satisfies A1/A3 with runtime tech), reusing a genuinely deep substrate.
- **Design:** one natural sentence → coherent multi-app outcome, with a visible safety boundary and a live execution trace.
- **Impact:** "Alexa can now operate the apps you already have, without each app building an Alexa integration" is a credible, broad need.
- **Idea:** semantic cross-substrate control + voice-driven design-token extraction is the opposite of the "obvious single-turn bot / basic MCP wrapper" Amazon calls out.

**Mini-challenges:** Pursue **Open Source** (B2) by publicly releasing NexusOS Semantic + this
Alexa client as OSS during the window (natural, meaningful, and it's the substrate's launch
moment). Pursue **AWS Builder** (B3) primarily by using **Kiro Crew** as the development tool
(qualifies alone); optionally add a genuine runtime AWS role (e.g., Bedrock for the Alexa+
simulation's NLU) *only if it has real architectural purpose* — a single trivial Bedrock call is
explicitly "obvious." A project may win one track + one mini-challenge, so treat these as additive
upside, not scope creep on the core.

---

## H. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Live Alexa+↔MCP connection mechanism unconfirmed (U1); onboarding/approval may exceed the window | Med | High | Hybrid: the simulated Alexa+ client removes the dependency; the real Streamable HTTP server still satisfies A1/A3. Investigate the real connection in parallel; add it if available. |
| R2 | `geckodriver`/Firefox not installed here; BiDi tests self-skip | High (now) | High | Install geckodriver + Firefox as a setup step; add a reliability rehearsal gate before recording. |
| R3 | State-layer hit-detection weak on bundled demo (`hits=0`) | Med | Med | Prefer query/read/invoke + verification beats over state-transition storytelling; fix hit-detection only if the story needs it. |
| R4 | Desktop/mobile kinetic bypasses tier gate | High (now) | Med (credibility/safety) | Route `desktop_kinetic_action`/`mobile_touch_action` through `decide()` before recording any autonomous desktop action. |
| R5 | iOS is a stub; macOS unverifiable here | High | Low (if excluded) | Exclude iOS/macOS from the demo; represent them honestly as PLANNED/PARTIAL. |
| R6 | Demo brittleness across N substrates during recording | Med | High | Cap the demo at Firefox+Chrome+Windows; deterministic demo data; rehearsal threshold (see execution plan). |
| R7 | Public-release leak of secrets/proprietary content | Med | High | Public-release audit before flipping visibility; keep any Nexus Security/proprietary material out; human approval required to publish. |
| R8 | "Significant update after Aug 31 2026" must be demonstrable (A7) | Low | High | The Streamable HTTP transport + Alexa client + orchestration are all new, dated work; document the before/after delta explicitly. |
| R9 | SDK `^1.30.0` may not expose `StreamableHTTPServerTransport` | Med | Med | Verify at EXECUTE; upgrade SDK or add a thin spec-compliant HTTP shim over the existing `McpServer`. |

---

## I. Hackathon delta (before vs new work)

**BEFORE (pre-existing Nexus — not claimable as hackathon work):**
- Universal substrate + `AxTreeNode` normalization; graph query/path/tool/explain/diagnostics; visual layer + DTCG tokens; security tiers; stdio + TCP JSON-RPC MCP; SEA binary; SQLite store; auth-session capture; bundled demo SaaS.

**BUILT DURING HACKATHON (the claimable delta):**
1. **MCP 2025-11-25 Streamable HTTP transport** for the Nexus MCP server (Origin validation, localhost binding, bearer auth, protocol-version negotiation) — additive to stdio.
2. **Simulated Alexa+ web client** that speaks Streamable HTTP to the Nexus server and renders the voice interaction + confirmation cards.
3. **Cross-substrate orchestration workflow** ("get me set up for the review") wiring Firefox + Chrome + Windows with verification.
4. **Safety-boundary wiring** so autonomous desktop/mobile actions pass through the tier gate; the CONFIRM beat is surfaced to the Alexa client.
5. **Execution visualizer** (reuse `nexus view` / traces where possible) showing the multi-substrate flow.
6. **Public-release packaging** of NexusOS Semantic + this client as OSS (Open Source mini-challenge).
7. Optional: genuine runtime AWS role (Bedrock NLU) if architecturally justified.

Narrative: *the hackathon turned Nexus's universal semantic substrate into an Alexa+-accessible,
standards-compliant, cross-device execution capability.*

---

## J. Mini-challenge analysis

**Open Source (B2) — pursue.** Publicly release NexusOS Semantic (Apache-2.0, already licensed)
and the new Alexa client during the window. Provide contribution URL, repo URL, GitHub username,
description. This is meaningful (a real substrate launch), not a throwaway repo. **Gate:**
public-release audit + human approval before flipping visibility (see R7, and the spec's
publication rule).

**AWS Builder (B3) — pursue via Kiro, keep runtime AWS optional.** Kiro Crew as the development
tool qualifies on its own per the rules. If we add runtime AWS, it must have real purpose (e.g.,
Bedrock powering the simulated Alexa+ NLU / intent parsing, or AgentCore/Strands orchestrating the
multi-substrate plan) — never a single trivial call, which Amazon flags as "obvious." Decide at
EXECUTE based on whether it strengthens the core without adding demo risk.

**Constraint (D1):** one track prize + one mini-challenge prize max. Alexa+ is the track; choose
the stronger of Open Source / AWS Builder as the mini-challenge focus (Open Source looks like the
cleaner, lower-risk win given the substrate is already Apache-2.0).

---

## Appendix — code citations (research clone, read-only)

- Transport & tools: `src/server/mcp-server.ts`, `src/server/server.ts`, `src/server/invoke.ts`
- Safety tiers: `src/graph/security.ts`, `src/graph/tools.ts`
- CLI: `src/cli/awg.ts`
- Substrates: `src/bidi-client/*`, `src/desktop/chrome-cdp.ts`, `src/desktop/windows/uia-daemon.ts`, `src/desktop/macos/ax-daemon.ts`, `src/mobile/android/uia2-client.ts`, `src/mobile/ios/wda-client.ts`
- Demo target: `demo/saas/server.cjs`, `demo/saas/public/`
- Dependencies: `package.json` (`@modelcontextprotocol/sdk ^1.30.0`, `ws`, `zod`; Node ≥24, pnpm ≥11)
