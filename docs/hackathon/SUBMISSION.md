# Devpost Submission Copy — Alexa Action Mode

**Primary track:** Alexa+
**Mini-challenges:** Open Source; AWS Builder
**Contribution:** https://github.com/Mbuso-Harvey/nexus-alexa
**Engine:** Nexus Semantic — https://github.com/Mbuso-Harvey/nexusos-semantic (pinned at tag `nexus-alexa-submission-v1`, commit `b0fd3b9`)
**License:** Apache-2.0

## Elevator pitch

Say one sentence to Alexa. It understands a real application, changes verified browser state, pauses before a sensitive action, and carries the result into native Windows software—without a custom Alexa integration for either app.

## What judges see

Ask **“Alexa, set me up for the Acme review.”** A visibly labeled simulated Alexa+ experience:

1. discovers semantic controls in a real application;
2. extracts its design system as W3C tokens;
3. reads and changes live Firefox state, then proves the change;
4. stops for human approval before a CONFIRM-tier account action; and
5. crosses into native Notepad and verifies the exact resulting text through UI Automation.

The audience sees the outcome first. Selecting **How did Alexa do that?** reveals the engine: Nexus Semantic.

## How it works

Alexa is a thin experience layer. Every demonstrated capability crosses:

`Alexa simulator → MCP 2025-11-25 Streamable HTTP → one Nexus MCP stdio process → real software`

The single Nexus runtime owns:

- the crawled semantic/interaction/visual graph;
- graph capability discovery and provenance;
- W3C DTCG design-token export;
- the live Firefox WebDriver BiDi session;
- security-tier decisions and the CONFIRM gate;
- Windows UI Automation; and
- fresh post-action read-back.

The Alexa repository contains no live Firefox adapter, copied BiDi client, direct Windows adapter, or copied UIA bridge. Live startup validates Nexus’s required MCP tools and fails closed if the product runtime is absent. Both live substrates share one Nexus process.

## Why this is different

This is not Q&A, screenshot interpretation, or a collection of Alexa-specific app integrations. Nexus gives an agent one semantic execution model across fundamentally different environments. Actions are selected from the application graph, policy-gated, performed through the native substrate, and checked against observed state rather than trusted because an automation API returned success.

## Hackathon work

The hackathon project adds the Alexa client experience, required MCP 2025-11-25 Streamable HTTP gateway, cross-substrate orchestration, confirmation UX, Bedrock planner option, packaged demo fixture and Nexus graph, reliability harness, evidence ledger, friction log, and the integration that makes Nexus the mandatory engine.

The Nexus product was also hardened during integration with bounded graph-approved live reads, BiDi RemoteValue compatibility, focus-verified text invocation, safe UIA text replacement/read-back, explicit desktop targeting, optimistic-concurrency preconditions, and process-tree timeout cleanup.

## AWS Builder

Amazon Bedrock Converse grounds the request in the declared Nexus capability manifest. The proposal is constrained, not free-form: unsupported capabilities/inputs are dropped, the strongly-checked headline workflow enforces order and completeness, an incomplete plan falls back deterministically, and the UI truthfully identifies which planner produced the run. Credentials are detected through the standard AWS SDK credential provider chain (environment, SSO, shared INI profiles — including the normal default profile created by `aws configure` — container, instance metadata), so no explicit access-key variable or `AWS_PROFILE` is required to enable Bedrock. We claim Bedrock in the video only when the badge says **Planned by Amazon Bedrock**.

## Reproduction

```powershell
npm install
npm test
npm run typecheck
npm run build
powershell -ExecutionPolicy Bypass -File scripts/start-hidden-engine-demo.ps1
```

The engine is the public [`Mbuso-Harvey/nexusos-semantic`](https://github.com/Mbuso-Harvey/nexusos-semantic) repository at the pinned tag `nexus-alexa-submission-v1` (commit `b0fd3b9`) — it is the product being demonstrated, not a library copied into the Alexa entry. Clone it, check out the pinned tag, and place the checkout as a sibling of this repository (the demo defaults to the sibling path). Full setup and proof commands are in `docs/hackathon/DEMO-RUNBOOK.md`.

## Verified engineering evidence

The committed Nexus graph reports 7/7 pages loaded, 408 semantic nodes, 143 capabilities, 50 states, 5,800 edges, 22 tokens, zero failed pages, and zero extractor failures. Dated build/test/live evidence is recorded in `docs/hackathon/READINESS-EVIDENCE.md`; external repository, video, AWS-account, and Devpost checks remain explicit release gates until completed.

## Truthful scope

- Alexa+ presentation: simulated and visibly labeled.
- MCP HTTP gateway, Nexus process, Firefox, and Windows: real in live mode.
- Offline fake mode: tests/rehearsal only, never presented as live evidence.
- Chrome: implemented by Nexus but not shown in this take.
- macOS/Android/iOS: roadmap.

## Product feedback and friction

See `docs/hackathon/PRODUCT-FEEDBACK.md` and `docs/hackathon/FRICTION-LOG.md`.
