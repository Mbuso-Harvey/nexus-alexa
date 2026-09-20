# Outcome-First Demo Script (target: 2:40–2:55)

**Creative rule:** do not say “Nexus” before the reveal. Make judges ask how Alexa did it. Everything shown as live must come from one coherent Nexus-only run.

## 0:00–0:10 — Cold open

**Visual:** Alexa+ Action Mode, Firefox, and Notepad visible. No architecture slide.
**Speak:** **“Alexa, set me up for the Acme review.”**
**On-screen:** *One request. Watch the software.*

## 0:10–1:35 — The impossible-looking run

Let the execution speak for itself:

1. **Understand:** the UI reports semantic controls discovered in the live app.
2. **See beneath the pixels:** structured design tokens appear as named values/swatches.
3. **Read:** Alexa reports the current live appearance.
4. **Act and prove:** Firefox changes to dark mode; verification turns green.
5. **Stop before risk:** a sensitive account action pauses. Alexa asks for approval. Click **Yes**; only the safe confirmation dialog opens.
6. **Cross environments:** the verified summary appears in native Notepad; exact UIA read-back turns green.

**Minimal VO:** “That was one request. The browser state was read, changed, and checked. The sensitive action stopped before execution. Then the result crossed into a native Windows app.”

Do not explain the engine yet.

## 1:35–1:48 — Let the question land

**Visual:** all six steps green, Firefox dark, confirmation dialog open, Notepad populated.
**VO:** “Alexa does not have a custom integration for either of these applications. So—how did it do that?”
Click **How did Alexa do that?**

## 1:48–2:20 — Reveal Nexus

**Visual:** the hidden panel reveals **Nexus Semantic**, one runtime, and graph statistics. Then show the code/runtime diagram.

**VO:** "The engine is Nexus Semantic—our universal semantic execution layer. Alexa is only the client. Every capability you just saw crossed one Nexus MCP process: 408 semantic nodes, 143 capabilities, 50 interaction states, 5,800 relationships, and 22 design tokens. Nexus owned Firefox through WebDriver BiDi, Windows through UI Automation, the safety decision, and every read-back."

**Diagram:** `Alexa+ → MCP Streamable HTTP → Nexus MCP runtime → Firefox + Windows`

## 2:20–2:37 — Technical credibility

**Visual:** briefly show `src/nexus/real.ts`, the absence of direct live adapters, the Nexus MCP tool list, passing tests, and the friction/evidence ledger.

**VO:** “There is no browser or desktop automation in the Alexa UI. Live mode refuses to start without the real Nexus tool surface. The public gateway uses MCP 2025-11-25 Streamable HTTP; behind it, one Nexus process discovers, gates, executes, and verifies both environments.”

If the run badge says **Planned by Amazon Bedrock**, add: “Amazon Bedrock grounded the request in the live capability surface.”
If it says **Planned deterministically**, say: “This take uses the repeatable planner; Bedrock can occupy the same grounded planning layer.”

## 2:37–2:52 — Close

**Visual:** outcome, then repository URL.
**VO:** “Today Alexa used it. Tomorrow any agent can. One semantic engine for every environment.”
**On-screen:** `github.com/Mbuso-Harvey/nexus-alexa`

## Recording acceptance

- Under 3:00.
- Alexa+ simulation badge visible.
- Firefox and Windows marked live.
- Exactly six steps in one coherent run.
- Do not splice separate runs into one apparent execution.
- Do not say Nexus until the reveal.
- Confirmation must visibly occur before the sensitive action.
- Theme and Notepad verification must be visible.
- Planner narration must match the badge.
- Never use the deleted direct-adapter proofs; use `NEXUS-ONLY CROSS-SUBSTRATE DEMO PROVEN` evidence.
