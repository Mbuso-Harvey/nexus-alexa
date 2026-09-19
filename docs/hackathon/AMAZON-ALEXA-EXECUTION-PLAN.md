> **HISTORICAL SNAPSHOT (2026-09-18, pre-implementation).** The original plan, kept for provenance.
> The delivered implementation follows this approach and adds: live **Windows** native substrate
> (Firefox→Windows crossing), an Amazon Bedrock planning layer (AWS Builder), and a vendored Nexus
> subset for reproducibility. For the final state see `README.md` and `docs/hackathon/SUBMISSION.md`;
> where they differ from this plan, they govern.

# Amazon Alexa+ Hackathon 2026 — Execution Plan (Deliverable #2)

**Depends on:** `AMAZON-ALEXA-INVESTIGATION.md`
**Status:** Historical plan (superseded by the delivered implementation — see README/SUBMISSION).
**Recommended approach:** Hybrid — real Nexus MCP server on **MCP 2025-11-25 Streamable HTTP** (Path B), demoed by a **simulated Alexa+ web client** (Path C). Delivered demo makes **Firefox + Windows** live.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Simulated Alexa+ Web Client  (browser UI + optional voice)   │
│  • renders the spoken request, confirmation cards, results    │
│  • plans the multi-step task (intent → tool calls)            │
│  • optional: Bedrock for NLU  ── AWS Builder (only if useful)  │
└───────────────────────────┬───────────────────────────────────┘
                            │ MCP 2025-11-25 over Streamable HTTP
                            │ (POST + GET single endpoint, SSE, Origin-checked, bearer)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  NEXUS MCP SERVER  (existing McpServer + NEW HTTP transport)  │
│  tools: graph_query/path/tool/explain/invoke/diagnostics,     │
│         get_visual*/tokens, desktop_*, chrome_*                │
│  safety: DISCOVER/READ/PROPOSE/EXECUTE/CONFIRM (tier gate)     │
│  NEW: kinetic desktop/mobile routed through the tier gate      │
└──────┬───────────────────┬────────────────────┬───────────────┘
       │                   │                    │
┌──────▼──────┐     ┌──────▼──────┐      ┌──────▼──────┐
│ Firefox     │     │ Chrome      │      │ Windows     │
│ (BiDi)      │     │ (CDP read)  │      │ (UIA kinetic)│
└─────────────┘     └─────────────┘      └─────────────┘

Observability: execution visualizer (reuse `nexus view` / traces)
               Alexa → Nexus → Firefox ✓ → Chrome ✓ → Windows ✓
```

**Principles:** additive (stdio stays); reuse existing tool registrations behind the new
transport; no architecture theater (no extra DB/microservices/LLMs unless they earn their place);
Alexa+ may be simulated, **Nexus is real**.

---

## 2. Work breakdown (smallest independently-verifiable tasks)

Priority tags: **QUALIFY** (needed to be eligible) · **WIN** (needed to score high) · **NICE** (upside).

### Phase 0 — Setup & baseline
- **T0.1 [QUALIFY]** Stand up substrates in this env: install geckodriver + Firefox; confirm `nexus doctor` green; run bundled `demo/saas`. *(Mitigates R2.)*
- **T0.2 [QUALIFY]** Reproduce a clean crawl of `demo/saas`; capture a baseline graph artifact.
- **T0.3 [QUALIFY]** Confirm `@modelcontextprotocol/sdk ^1.30.0` exposes `StreamableHTTPServerTransport`; if not, decide SDK upgrade vs thin HTTP shim. *(R9.)*

### Phase 1 — MCP 2025-11-25 Streamable HTTP transport (the core delta)
- **T1.1 [QUALIFY]** Add an HTTP server exposing one MCP endpoint (POST + GET) wrapping the existing `buildMcpServer` registrations.
- **T1.2 [QUALIFY]** POST: accept JSON-RPC; honor `Accept: application/json, text/event-stream`; return SSE or JSON; 202 for notifications/responses.
- **T1.3 [QUALIFY]** GET: open SSE stream (or 405). Implement resumability/`Last-Event-ID` only if time allows (NICE).
- **T1.4 [QUALIFY]** Validate `Origin` (403 on invalid); bind 127.0.0.1 by default; add bearer-token auth for non-local/judge access.
- **T1.5 [QUALIFY]** Advertise/negotiate `MCP-Protocol-Version: 2025-11-25`; 400 on unsupported.
- **T1.6 [QUALIFY]** Wire `serve --transport http --port …` in the CLI (and finally pass `--chrome` through `cmdServe`). *(Closes the CLI gap.)*

### Phase 2 — Safety wiring
- **T2.1 [WIN]** Route `desktop_kinetic_action` and `mobile_touch_action` through `decide()` so autonomous native actions honor the tier gate. *(R4.)*
- **T2.2 [WIN]** Surface `requireConfirm` decisions to the client as a structured "confirmation needed" result the Alexa client renders as a spoken confirm card.

### Phase 3 — Simulated Alexa+ client
- **T3.1 [QUALIFY]** Web client that connects to the Streamable HTTP endpoint, lists tools, and calls them.
- **T3.2 [WIN]** Intent → plan → ordered tool calls for the demo story; render the spoken request, confirmation cards, and results (media/cards align with Amazon's "creative" cues).
- **T3.3 [WIN]** Voice in/out (Web Speech API is sufficient; keep it simple and reliable).
- **T3.4 [NICE]** Optional Bedrock NLU for intent parsing (AWS Builder) — only if it strengthens the story.

### Phase 4 — Cross-substrate orchestration workflow
- **T4.1 [WIN]** Orchestrator sequence: Firefox CRM read → design-token extraction → Chrome dashboard read → Windows editor populate → CONFIRM beat → verify.
- **T4.2 [WIN]** Verification: after each action, semantic re-read to prove ACTION→EXPECTED→OBSERVED→PASS (not "no error").
- **T4.3 [WIN]** Deterministic demo data in `demo/saas` (fixed Acme account, notes, figures).

### Phase 5 — Observability
- **T5.1 [WIN]** Execution visualizer showing `Alexa → Nexus → Firefox ✓ → Chrome ✓ → Windows ✓`; reuse `nexus view`/traces before building anything new.

### Phase 6 — Reliability
- **T6.1 [WIN]** Demo Rehearsal Test: scripted end-to-end run with preconditions, success signals, timeouts, retries, cleanup/reset.
- **T6.2 [WIN]** Rehearsal threshold: ≥5 consecutive clean runs before recording (raise for higher step counts).

### Phase 7 — Open source & release
- **T7.1 [QUALIFY]** Public-release audit: secrets/keys/tokens/PII, private URLs, proprietary (Nexus Security) content, license/branding/metadata consistency, stale `agent-web-graph` naming, run instructions. *(R7.)*
- **T7.2 [QUALIFY]** Human approval, then flip repo visibility to public with a detectable Apache-2.0 license (or share private with `testing@devpost.com` + `@AmazonAppDev`).
- **T7.3 [NICE]** Open Source mini-challenge packaging (contribution URL, repo URL, username, description).

### Phase 8 — Submission
- **T8.1 [QUALIFY]** Devpost text description; track + mini-challenge selection.
- **T8.2 [QUALIFY]** Product Feedback for every tool/API/SDK (MCP SDK, geckodriver/BiDi, CDP, UIA, Kiro, AWS if used).
- **T8.3 [QUALIFY]** Friction log finalized (continuously maintained).
- **T8.4 [QUALIFY]** <3-min video recorded, edited, uploaded public (YouTube/Vimeo).

---

## 3. Dependencies

```
T0.1 → T0.2 → T4.*        (substrates before orchestration)
T0.3 → T1.*               (SDK decision before transport)
T1.* → T3.1               (transport before client connects)
T2.* → T3.2 (confirm) → T4.1 (CONFIRM beat)
T4.* → T5.1 → T6.*        (workflow before visualizer before rehearsal)
T6.2 (rehearsal pass) → T8.4 (record)
T7.1 → T7.2 (audit before publish; human approval gate)
everything → T8.*
```

---

## 4. Acceptance criteria (objective)

- **T1 (transport):** an MCP client (and `curl`) can `initialize` → `tools/list` → `tools/call` over one HTTP endpoint; POST returns SSE or JSON correctly; GET yields SSE or 405; invalid `Origin` → 403; missing/invalid `MCP-Protocol-Version` → 400; `2025-11-25` negotiated. Automated protocol tests pass.
- **T2 (safety):** a CONFIRM-tier action without `confirm:true` provably does not reach the substrate; the client receives a structured confirmation prompt; with `confirm:true` it proceeds. Test asserts both.
- **T3 (client):** the web client completes the scripted request end-to-end against the live server, rendering request → (confirm) → results.
- **T4 (workflow):** each step logs ACTION→EXPECTED→OBSERVED→PASS via semantic re-read; the run completes with all PASS on deterministic data.
- **T6 (reliability):** ≥5 consecutive clean rehearsal runs.
- **T7 (release):** audit checklist all-clear; license detectable; a cold developer can install and run from the README.
- **T8 (submission):** every REQUIRED row in the investigation's requirement matrix satisfied; video <3 min shows real functioning.

---

## 5. Test plan

- **Unit:** intent→plan mapping; confirmation-decision rendering; transport header handling.
- **Protocol:** MCP 2025-11-25 conformance (POST/GET/Accept/Origin/version/session) via direct HTTP + an MCP client.
- **Integration:** client → Streamable HTTP → `McpServer` → tool → substrate (Firefox live; Chrome hermetic + one live tab; Windows UIA).
- **Cross-substrate E2E:** the full demo story on deterministic data, asserting per-step verification.
- **Safety:** CONFIRM gate blocks/permits correctly on the graph path *and* the newly-gated desktop/mobile path.
- **Demo rehearsal:** scripted repeated runs with reset between runs.
- Keep existing hermetic substrate tests green; do not regress stdio transport.

---

## 6. Demo plan (user story + environment sequence)

Request: **"Alexa, get me set up for the Acme design review at 3."**
1. Firefox → CRM (demo SaaS): find Acme, read latest notes. *(Web query/read + verify)*
2. Firefox → design system page: extract **DTCG design tokens + layout summary**. *(wow beat)*
3. Chrome → review dashboard tab: read current figures. *(CDP read)*
4. Windows → notes/editor: populate the generated brief. *(UIA kinetic, tier-gated)*
5. Billing/scheduling step promoted to **CONFIRM** → Alexa asks; proceeds only on spoken yes. *(safety boundary)*
6. Alexa reports completion; visualizer shows `Alexa → Nexus → Firefox ✓ → Chrome ✓ → Windows ✓`.

Excluded on purpose: iOS (stub), macOS (no host here). Represented honestly as PLANNED/PARTIAL.

---

## 7. Video plan (<3 min, hard cap ~165s usable)

- **0:00–0:15** Problem: Alexa answers questions but can't operate arbitrary apps.
- **0:15–0:25** Thesis: "Nexus gives Alexa semantic access to your digital world."
- **0:25–1:50** Real execution: one command; show Firefox, Chrome, Windows changing; show the CONFIRM prompt; show verification.
- **1:50–2:20** Architecture reveal: Alexa+ (simulated) → Nexus MCP (real, Streamable HTTP 2025-11-25) → substrates.
- **2:20–2:40** Open-source value: same MCP layer works for any agent, not just Alexa.
- **2:40–2:55** Result: task complete; clearly label "Alexa+ simulated; Nexus execution real."
- Editing/cuts/narration/speed-ups allowed; **no faked outcomes**.

---

## 8. Public-release plan

1. Freeze scope; run T7.1 audit (secrets, PII, private URLs, proprietary content, license/branding/metadata, stale naming, run instructions).
2. Ensure no Nexus Security / proprietary material is present (keep the IP boundary from the substrate's own governance docs).
3. Verify a cold `git clone` → install → run works from the README.
4. **Human approval**, then publish (public + Apache-2.0 detectable) or share private with `testing@devpost.com` + `@AmazonAppDev`.

---

## 9. Submission plan (Devpost)

- Track: **Alexa+**. Mini-challenge: **Open Source** (primary) [+ AWS Builder via Kiro if pursued].
- Provide: text description; public repo URL with detectable license; <3-min public video; product feedback for each tool; friction log; open-source contribution URL/description; testing instructions (+ credentials if private).
- Explicitly document the **post-Aug-31-2026 significant update** (A7): the Streamable HTTP transport, Alexa client, orchestration, and safety wiring, all dated.

---

## 10. Fallback plan (shed in this order under schedule pressure)

1. Drop optional Bedrock NLU (T3.4) → keep deterministic intent mapping.
2. Drop resumability/`Last-Event-ID` (T1.3 extras) → keep core POST/GET/SSE.
3. Drop Chrome step → Firefox + Windows two-substrate story (still cross-substrate).
4. Drop the custom visualizer → reuse `nexus view` output on camera.
5. Reduce to the highest-reliability story: **Candidate 2** (theme + billing CONFIRM on Firefox) — still shows semantic control + the safety boundary + real Streamable HTTP.
6. Last resort for eligibility: simulation-only path (C) with the real server still present — never fake Nexus execution.

**Never sacrificed:** MCP 2025-11-25 Streamable HTTP compliance (A1/A3), real Nexus execution,
the safety boundary, and truthful claims.

---

## 11. NEEDED-TO-QUALIFY vs NEEDED-TO-WIN vs NICE

- **QUALIFY:** T0.1–T0.3, T1.1–T1.6, T3.1, T7.1–T7.2, T8.1–T8.4.
- **WIN:** T2.1–T2.2, T3.2–T3.3, T4.1–T4.3, T5.1, T6.1–T6.2.
- **NICE:** T1.3 extras, T3.4 (Bedrock), T7.3 packaging polish.
