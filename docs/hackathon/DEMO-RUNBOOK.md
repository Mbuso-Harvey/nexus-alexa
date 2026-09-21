# Nexus-Only Demo and Release Runbook

The live submission is valid only when every application operation crosses one genuine Nexus MCP process. Offline fakes are useful for tests but are not live evidence.

## 1. Preflight both repositories

The engine is the public [`Mbuso-Harvey/nexusos-semantic`](https://github.com/Mbuso-Harvey/nexusos-semantic) repository pinned at tag `nexus-alexa-submission-v1` (commit `b0fd3b9`). In this dev workspace it is checked out as the sibling `../\_research_awg`. Cold clone:

```powershell
git clone https://github.com/Mbuso-Harvey/nexusos-semantic
git -C nexusos-semantic checkout nexus-alexa-submission-v1

node --version             # 24.x or 26+
pnpm --version             # 11+
Get-Command geckodriver
Test-Path C:\Windows\System32\notepad.exe

npm install
npm test
npm run typecheck
npm run build
npm audit --audit-level=moderate

pnpm --dir ..\_research_awg install
pnpm --dir ..\_research_awg run build
```

## 2. Verify or regenerate the Nexus graph

The committed graph should inspect as 7 loaded pages, 408 AX nodes, 143 capabilities, 50 states, 5,800 edges, and no failed pages/extractor failures.

```powershell
pnpm --dir ..\_research_awg run nexus -- inspect --graph ..\nexus-alexa\demo\nexus-graph --json

# Regenerate after changing the fixture or Nexus extraction:
powershell -ExecutionPolicy Bypass -File scripts/prepare-nexus-graph.ps1
```

The graph must contain `#theme-toggle` as EXECUTE and `#btn-sensitive-signout` as CONFIRM.

## 3. Clean live state

Only do this on the dedicated recording machine after confirming no user work is open:

```powershell
Get-Process geckodriver, firefox, notepad -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
```

Close notifications, overlays, remote-control software, and unrelated focus-stealing automation.

## 4. Optional Bedrock

Credentials resolve through the standard AWS SDK credential provider chain, so a normal `aws configure` default profile works without `AWS_PROFILE` or explicit access-key variables. Set a profile only to select a non-default one:

```powershell
$env:AWS_REGION = "us-east-1"
$env:NEXUS_ALEXA_BEDROCK_MODEL = "<enabled-model-or-inference-profile-id>"
# optional: $env:AWS_PROFILE = "<non-default-profile>"
```

Use Bedrock narration only if the successful run badge proves Bedrock planned it.

## 5. Start the hidden-engine experience

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-hidden-engine-demo.ps1
```

This starts the bundled target on 7312, geckodriver on 4444, a fresh Notepad window, the Alexa HTTP MCP gateway on 8391, the simulator on 8392, and exactly one child Nexus MCP stdio process serving both Firefox and Windows.

Manual equivalent:

```powershell
$env:PORT = "7312"
node demo/saas/server.cjs

geckodriver --port 4444 --host 127.0.0.1 --allow-origins http://127.0.0.1:9222
Start-Process C:\Windows\System32\notepad.exe

# --nexus-root points at your checkout of the pinned engine tag
npx tsx src/cli.ts serve --client `
  --nexus-root ..\_research_awg `
  --graph .\demo\nexus-graph `
  --target-app http://127.0.0.1:7312 `
  --desktop
```

This documented launch path starts the Nexus child **without operator authorization**, so the engine stays in its deliberate fail-closed `audit` posture and every write is denied (`AUDIT posture allows only read operations`). Authorize the child runtime for a live take with the documented config-file surface instead (see `nexus-alexa.config.example.json`): pass `--config <path>` (and no inline `--nexus-root`/`--graph`/`--target-app` flags, which would overwrite the config's `nexus` section) with, at minimum:

```powershell
# --config release-gate.json (create one; never commit operator secrets)
node -e "console.log(JSON.stringify({ real: ['firefox','windows'], nexus: {
  command: 'pnpm.cmd',
  args: ['run','nexus','serve','--graph','C:\\path\\to\\demo\\nexus-graph','--desktop'],
  env: {
    AWG_POSTURE: 'autopilot',
    AWG_AUTHORIZED_TARGETS: '127.0.0.1:7312,cap:*,graph_*,export_dtcg_tokens,desktop_*,<notepad-window-handle>',
    AWG_AUTHORIZED_OPERATIONS: '*',
    AWG_AUTHORIZED_SUBSTRATES: 'web,desktop',
    AWG_MAX_IMPACT: 'destroy'
  },
  cwd: 'C:\\path\\to\\your\\nexusos-semantic\\checkout',
  baseUrl: 'http://127.0.0.1:7312',
  desktopProcessName: 'notepad'
} }, null, 2))" > release-gate.json
```

Why this exact shape (verified on the 2026-09-20 cold-clone harness before writing it down):

- The MCP SDK stdio transport spawns the Nexus child with only `getDefaultEnvironment()` plus the **explicit** `env` option, so session exports (`$env:AWG_POSTURE=…`) cannot reach the runtime. Only the config file's `nexus.env` reaches it.
- Wildcard or missing `AWG_AUTHORIZED_TARGETS` makes the engine refuse to leave `audit` at boot (fail closed). The list above is the least privilege that passes: the demo origin, the tool/capability globs, and the exact Notepad window handle (capture it with `(Get-Process notepad | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle`).
- The default impact ceiling is `modify`; the CONFIRM-tier sign-out dialog is classified impact `destroy`, so it is denied unless `AWG_MAX_IMPACT` is raised to `destroy`. The Bedrock planner expects that ceiling: with `modify` the approved sensitive step fails with `Impact "destroy" exceeds authorized maximum "modify"`.
- Bedrock planning itself needs `NEXUS_ALEXA_BEDROCK_MODEL=<enabled-model-or-inference-profile-id>` in the gateway process (planner layer only; it never touches the Nexus child env).

Known remaining mismatch (see FRICTION-LOG F-015): the Bedrock planner's `populate_brief` expected-state also asserts `dirty`/`hasEditor`, which the live `desktop_read_text` adapter never returns, so a Bedrock-planned full run currently tops out at 5/6 even though the write lands exactly. Use the deterministic/`live-combined.ts` proof (which asserts `{ value: text }` only) for the 6/6 marker until the planner's expectation schema is reconciled with the live adapter shape.

Expected: Firefox real, Windows real, other substrates simulated/roadmap. The old `--web-app` direct mode must fail.

## 6. Execute the take

Open `http://127.0.0.1:8392/` and arrange it beside Firefox and Notepad. Ask **“Alexa, set me up for the Acme review.”**

Expected six-step run:

1. semantic graph query;
2. W3C DTCG token export;
3. live theme read;
4. graph-resolved theme invocation and dark-state verification;
5. CONFIRM-tier sign-out dialog invocation after approval; and
6. Nexus desktop replacement plus exact UIA text read-back.

After the result lands, click **How did Alexa do that?** for the Nexus reveal.

## 7. Nexus-only proof gate

With the target app on 7312:

```powershell
npx tsx scripts/live-firefox.ts
npx tsx scripts/live-firefox-full.ts
npx tsx scripts/live-windows.ts
npx tsx scripts/live-combined.ts
powershell -ExecutionPolicy Bypass -File scripts/reliability-gate.ps1 -Runs 5
```

Accept only:

- `NEXUS GRAPH INVOCATION PROVEN`
- `NEXUS WEB RUNTIME PROVEN`
- `NEXUS WINDOWS RUNTIME PROVEN`
- `NEXUS-ONLY CROSS-SUBSTRATE DEMO PROVEN`
- `CLEAN RUNS: 5/5`

Record outputs and date in `READINESS-EVIDENCE.md` on the final commit/machine.

## 8. Recording and submission gates

- Alexa simulated label visible; Firefox/Windows live labels visible.
- One coherent six-step run, under 3:00.
- Nexus is not named until the deliberate reveal.
- Theme, safety pause, and native exact read-back are visible.
- Public repositories and video open logged out.
- Apache-2.0 is detected.
- Devpost preview contains final links/tracks and matches `SUBMISSION.md`.
- Re-run both repository builds and the Alexa test suite on the pushed commits.

## Troubleshooting

- Missing required tool at startup: rebuild the pinned Nexus engine checkout (`../_research_awg` in this dev workspace); do not bypass Nexus.
- `Session already started`: reset Firefox/geckodriver and start fresh.
- Graph page rejected: target URL must exactly match the graph’s `http://127.0.0.1:7312` origin.
- Nexus graph capability missing: regenerate the graph; never hard-code a direct click in Alexa.
- Desktop precondition/focus mismatch: reset Notepad and rerun; Nexus intentionally fails closed.
- Bedrock fallback: fix credentials/model access or use deterministic narration.
