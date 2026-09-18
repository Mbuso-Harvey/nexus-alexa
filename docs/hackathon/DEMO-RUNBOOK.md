# Demo Runbook

Deterministic steps to reproduce the demo reliably (and to record the video). Treat reliability
as part of the product: do a clean run before recording.

## Prerequisites
- Node.js ≥ 24, npm.
- Firefox installed (e.g. `C:\Program Files\Mozilla Firefox\firefox.exe`).
- geckodriver on disk (e.g. `C:\Users\Harvey\bin\geckodriver.exe`).
- NexusOS Semantic checkout available (for the demo app + the BiDi client the live driver uses).
- Optional (AWS Builder): AWS credentials + a Bedrock model enabled in your region.

## 1. Start geckodriver (clean)
Kill any stray instance first (a leftover session blocks new ones — see FRICTION-LOG F-005), then:
```powershell
Get-Process geckodriver -ErrorAction SilentlyContinue | Stop-Process -Force
& "C:\Users\Harvey\bin\geckodriver.exe" --port 4444 --allow-origins http://127.0.0.1:9222
# verify: GET http://127.0.0.1:4444/status -> {"value":{"ready":true}}
```

## 2. Start the demo web app (the live target)
```powershell
node <nexusos-semantic>/demo/saas/server.cjs   # serves http://127.0.0.1:7311
```

## 3. (Optional) enable Bedrock planning for the AWS Builder story
```powershell
$env:AWS_REGION = "us-east-1"
$env:AWS_PROFILE = "<your-profile>"          # or AWS_ACCESS_KEY_ID / _SECRET_ACCESS_KEY
$env:NEXUS_ALEXA_BEDROCK_MODEL = "us.anthropic.claude-3-5-sonnet-20241022-v2:0"
```
Without these, the demo runs on the deterministic planner (labeled truthfully).

## 4. Start Nexus-for-Alexa+ (MCP server + simulator, firefox = real)
```powershell
npx tsx src/cli.ts serve --port 8391 --client --client-port 8392 --web-app http://127.0.0.1:7311
# expect:
#   MCP Streamable HTTP (2025-11-25) at http://127.0.0.1:8391/mcp
#   firefox: real   (others: simulated)
#   planner: Amazon Bedrock (…)  OR  deterministic (…)
```

## 5. Run the demo
Open `http://127.0.0.1:8392/`. Arrange the window beside the real Firefox window Nexus controls.
Speak or type: **"Alexa, set me up for the review."**

Expected (all on the real Firefox, verified):
1. read theme → 2. extract design tokens (swatches) → 3. file a ticket → 4. read admin-only view
→ 5. **CONFIRM** on "Delete workspace" (approve) → 6. switch to dark. Outro: all steps ✅.

## 6. Pre-record reliability gate
Offline (no browser) rehearsal of the deterministic path:
```powershell
npx tsx src/cli.ts rehearse --runs 5 --required 5      # expect READY
```
Live path proof (real browser, all bindings):
```powershell
npx tsx scripts/live-firefox-full.ts http://127.0.0.1:7311   # expect FULL LIVE WEB STORY PROVEN
```
Do at least 3 clean live runs before recording. Restart geckodriver between runs if a session sticks.

## 7. Reset between takes
- Restart geckodriver (clean session).
- The demo app has no backend delete, so the "Delete workspace" beat is safe and repeatable.
- Theme resets on page reload; the ticket dialog is per-session.

## Troubleshooting
- `Session already started` / `ready:false` → kill and restart geckodriver (F-005).
- BiDi WS rejected → ensure `--allow-origins http://127.0.0.1:9222` (F-006).
- Bedrock access error → the app falls back to deterministic automatically; enable the model in
  the Bedrock console or unset AWS creds for the recording.
