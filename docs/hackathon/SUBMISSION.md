# Devpost Submission Draft — Nexus for Alexa+

**Primary track:** Alexa+
**Mini-challenges:** Open Source; AWS Builder
**Repository:** https://github.com/Mbuso-Harvey/nexus-alexa (private during development; made
public with Apache-2.0 for submission, or shared with `testing@devpost.com` + `@AmazonAppDev`).

---

## Elevator pitch
Alexa can answer questions, but it can't operate the apps you already use unless someone builds a
custom Alexa integration for each one. **Nexus for Alexa+** removes that limit: one spoken request
becomes real, verified execution across your digital environments — the browser today, desktop and
mobile as they come online — with an explicit safety pause before anything destructive.

## What it does
Say *"Alexa, set me up for the review."* Nexus:
1. **reads** the app's current state semantically (ARIA roles/names, not screenshots),
2. **extracts the app's real design tokens** (design intelligence a vision-only agent can't do),
3. **files a support ticket** through the app's real modal form,
4. **switches to the admin identity** and reads the admin-only view (context-aware / permission-dependent),
5. **reaches a destructive "Delete workspace" control and pauses** for spoken confirmation (safety boundary),
6. **switches the theme to dark** — and **verifies** every step by semantic re-read.

## How it's built
- **Real MCP 2025-11-25 Streamable HTTP server** exposing the Nexus tool surface — the technology
  the Alexa+ track requires, imported and called at runtime (`src/mcp/http.ts`, `src/mcp/server.ts`).
  Origin/DNS-rebinding protection, localhost binding, optional bearer auth, protocol negotiation.
- **Cross-substrate orchestrator** turns one objective into an ordered plan, executes each step,
  **verifies** it (`ACTION → EXPECTED → OBSERVED → PASS`), and enforces a **CONFIRM** tier gate on
  destructive/billing/admin actions (`src/orchestrator.ts`, `src/nexus/security.ts`).
- **Live web substrate:** a real Firefox driven via geckodriver using NexusOS Semantic's own
  WebDriver BiDi client — real reads, real clicks, real verification (`src/nexus/firefox.ts`).
- **Simulated Alexa+ client** (permitted by the rules): voice in/out, confirmation cards, and an
  execution visualizer, driving the **real** MCP server (`src/client/`).
- **Amazon Bedrock (AWS Builder):** the planning layer. Bedrock's Converse API turns arbitrary
  natural language into a validated, capability-grounded plan; Nexus executes and verifies it. Falls
  back to deterministic planning with no AWS credentials (`src/plan-bedrock.ts`).

## What's new for the hackathon (significant update after Aug 31, 2026)
NexusOS Semantic predates the hackathon and spoke MCP only over stdio + a private TCP socket. New,
dated work built for this submission:
1. the **MCP 2025-11-25 Streamable HTTP** transport (the required Alexa+ technology),
2. the **simulated Alexa+ client** + voice UX + execution visualizer,
3. the **cross-substrate orchestrator** with per-step semantic verification,
4. **safety wiring** so every invocation (incl. native kinetics) passes the tier gate,
5. the **Bedrock planning layer** (AWS Builder),
6. a **turnkey seam** (`RealNexusSubstrate` / `CompositeSubstrate` / config) so more Nexus
   substrates connect with no code changes.

## Why it's creative (not obvious)
Not a single-turn Q&A bot or a thin MCP wrapper: it's autonomous, multi-step orchestration across a
real app, with semantic verification, a design-intelligence beat, context-aware permission handling,
and an explicit human-approval boundary — with Bedrock doing the agentic planning above a
deterministic execution/verification substrate.

## Safety
Destructive/billing/admin actions are classified **CONFIRM** and are blocked until the user
approves; the demo's destructive control is a no-backend Invoker command, so the safety beat is real
and repeatable without data loss.

## Testing instructions
- `npm install && npm test` → 26 hermetic tests (MCP conformance, orchestration over Streamable
  HTTP, safety gate, composite routing, Bedrock fallback, reliability).
- Live demo: see `docs/hackathon/DEMO-RUNBOOK.md`.
- Quick transport check: `GET http://127.0.0.1:8391/healthz` → `{"protocol":"2025-11-25"}`.

## Open Source mini-challenge
This repository (Apache-2.0) is the new open-source project created during the window; NexusOS
Semantic, the substrate it builds on, is released as open source alongside it.
- Contribution URL: <repo URL> · GitHub: Mbuso-Harvey · Description: as above.

## Product feedback & friction log
See `docs/hackathon/PRODUCT-FEEDBACK.md` and `docs/hackathon/FRICTION-LOG.md`.
