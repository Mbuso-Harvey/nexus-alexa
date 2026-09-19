# Demo Video Script (< 3 minutes)

**Target:** ~165 seconds usable. Judges are not required to watch past 3:00.
**Rule we hold:** everything shown as working executes for real. Alexa+ is a labeled simulation;
Nexus execution (Firefox substrate) is 100% real. "Coming" substrates are shown as roadmap only.

**Recording setup (see DEMO-RUNBOOK.md):** geckodriver + demo app + `serve --client --web-app`
running; screen split so the Alexa+ simulator (left) and the real Firefox window (right) are both
visible; audio = the simulator's spoken responses (or voiceover).

---

## 0:00–0:14 — The problem (hook)
**Visual:** Alexa logo/waveform. A phone/laptop with several apps open.
**VO:** "Alexa can answer questions. But it can't *operate* the apps you already use — every
integration has to be built for Alexa, one at a time."
**On-screen text:** *What if Alexa could just… use your software?*

## 0:14–0:24 — The thesis
**Visual:** Title card → the simulator loads; the "Nexus capability reach" panel shows six
substrates (web/desktop/mobile) with live/coming dots.
**VO:** "Nexus Semantic gives Alexa a semantic map and hands for your whole digital world —
over the Model Context Protocol."
**On-screen text:** *Alexa+ → Nexus Semantic → real cross-substrate execution*

## 0:24–1:55 — One request, real execution across web AND native desktop (the core)
**Setup:** Split screen — the simulator, the real **Firefox** window, and the real **Notepad**
window all visible. **Speak:** **"Alexa, set me up for the Acme review."**
Show the visualizer light up `Alexa → Nexus → Firefox → Windows` and the steps run for real:
1. Firefox: **reads** the current theme (semantic, not a screenshot). *[on-screen: "semantic read"]*
2. **Extracts the app's real design tokens** — color swatches render live. *[on-screen: "design intelligence — impossible for a vision-only agent"]*
3. **Files a support ticket** — the real modal opens and fills. *[on-screen: "real action"]*
4. **Switches to the admin identity** and reads the admin-only "danger zone". *[on-screen: "context-aware / permission-dependent"]*
5. **Reaches the destructive "Delete workspace" control** → **pauses**. Alexa asks, *"This one is
   sensitive — should I go ahead?"* Click **Yes**; it opens the confirm dialog (no data deleted).
   *[on-screen: "explicit safety boundary — CONFIRM"]*
6. **Switches the theme to dark** — the real page flips to dark. *[on-screen: "verified"]*
7. **THE CROSSING:** Nexus moves into the real **native Windows Notepad** and **types the review
   brief** — the viewer watches text appear in a real desktop app. Nexus reads the window's own
   state back to verify. *[on-screen: "same architecture — web → native desktop"]*
**VO (over the run):** "One sentence. Nexus finds each capability by meaning, does it in the real
browser, then crosses into a real native Windows app — and *verifies* each result. When something's
destructive, it stops and asks first."

## 1:45–2:15 — The architecture reveal
**Visual:** Simple diagram: `Alexa+ (simulated) → MCP 2025-11-25 Streamable HTTP → Nexus tools →
Firefox (web, LIVE) + Windows (native, LIVE)`, with Chrome/macOS/Android/iOS shown greyed as
"Nexus reach / roadmap". Highlight the transport badge and `protocol: 2025-11-25`.
**VO:** "Under the hood: a real, self-hosted MCP server on the 2025-11-25 Streamable HTTP
transport the Alexa+ track requires. Amazon Bedrock plans the request; Nexus executes and
verifies it. The same MCP layer works for any agent — not just Alexa."
**On-screen text:** *Bedrock plans · Nexus executes & verifies · MCP 2025-11-25 Streamable HTTP*

## 2:15–2:35 — Breadth + open source
**Visual:** The reach panel again — web live now; desktop/mobile "coming online" through the same
seam. Show the GitHub repo (Apache-2.0).
**VO:** "Firefox is live today; desktop and mobile connect through the exact same interface as
Nexus comes online. It's open source — Alexa is just the first client."

## 2:35–2:50 — Result
**Visual:** The simulator shows all steps ✅ and the outro; the real page is in dark mode with a
ticket filed.
**VO:** "One request. Real cross-substrate execution. Verified. Safe. That's Nexus for Alexa+."
**On-screen text:** *github.com/Mbuso-Harvey/nexus-alexa*

---

## Editing notes
- Cuts/speed-ups are fine for wait time; do **not** fabricate any outcome.
- Keep the real Firefox window visible during the core run so it's obviously not faked.
- Label the Alexa+ side "simulated" on screen at least once (the badge is always visible).
- If Bedrock is enabled for the recording, the badge reads "Planned by Amazon Bedrock"; if not,
  "Planned deterministically" — both are truthful.
