# Friction Log — Amazon Alexa+ Hackathon 2026

> Amazon awards up to a **10% judging bonus** for friction logs. We treat this as mandatory.
> Record friction as it happens. Do not manufacture entries.
>
> Format per entry: date · tool/service · task attempted · steps · expected vs actual ·
> severity (Critical/Important/Minor) · workaround · time lost · suggested fix · evidence.

---

## 2026-09-18 — Investigation phase

### F-001 · GitHub · Reading a private reference repo via web fetch
- **Task:** Read `github.com/Mbuso-Harvey/agent-web-graph` to understand the substrate.
- **Steps:** `web_fetch` on the repo URL.
- **Expected:** Repo README returned.
- **Actual:** HTTP 404 (the repo is private; unauthenticated fetch cannot see it).
- **Severity:** Minor.
- **Workaround:** Used the authenticated `gh` CLI (`gh repo clone`) instead.
- **Time lost:** ~2 min.
- **Suggested fix:** N/A (expected behavior for private repos). Documented so the distinction between "404 = missing" and "404 = private" is explicit.
- **Evidence:** `web_fetch` 404 vs `gh repo view` success.

## 2026-09-18 — Execution phase

### F-002 · MCP TypeScript SDK · Confirming Streamable HTTP support/version
- **Task:** Confirm `@modelcontextprotocol/sdk` ships a 2025-11-25 Streamable HTTP server transport before committing to the self-hosted-MCP path.
- **Steps:** `npm view @modelcontextprotocol/sdk exports`; searched output for `streamable`/`http`.
- **Expected:** The exports map / docs would clearly list a Streamable HTTP server transport subpath.
- **Actual:** The `exports` query didn't surface it; had to inspect installed `dist/esm/server/streamableHttp.d.ts` and grep `types.js` for `LATEST_PROTOCOL_VERSION` to confirm `2025-11-25`.
- **Severity:** Minor.
- **Workaround:** Read the installed SDK source directly; confirmed `StreamableHTTPServerTransport` and `LATEST_PROTOCOL_VERSION = '2025-11-25'`.
- **Time lost:** ~10 min.
- **Suggested fix:** A short, versioned "Streamable HTTP server quickstart (2025-11-25)" doc entry and a clearer exports listing.
- **Evidence:** `node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.d.ts`; `types.js` protocol constants.

### F-003 · MCP transport · Origin/DNS-rebinding rejection returned 400, not 403
- **Task:** Assert an invalid `Origin` yields HTTP 403 (spec's DNS-rebinding requirement).
- **Steps:** Started the server with an ephemeral port (0) and posted with `Origin: http://evil.example.com`.
- **Expected:** 403.
- **Actual:** 400 — because our allowed-origin allowlist was derived from the requested port, which was 0 (ephemeral), so DNS-rebinding protection was effectively off and the request failed later for another reason.
- **Severity:** Important (it masked a real security requirement in tests).
- **Workaround:** Two-phase startup — bind first to learn the real bound port, then configure `allowedOrigins`/`allowedHosts` against it and connect the transport. Invalid Origin now correctly returns 403.
- **Time lost:** ~15 min.
- **Suggested fix:** SDK could accept an allowlist callback evaluated per-request (so ephemeral-port servers can validate Origin without knowing the port up front).
- **Evidence:** `src/mcp/http.ts` two-phase listen; `test/http-transport.test.ts` "returns 403 for an invalid Origin".

### F-004 · Vitest/Vite · Unrelated parent-directory postcss.config.js broke test startup
- **Task:** Run `vitest`.
- **Steps:** `npx vitest run` from the project root.
- **Expected:** Tests run.
- **Actual:** Vite walked up the tree, found a `postcss.config.js` in a parent/home directory (an unrelated Tailwind config), and failed: "Cannot find module '@tailwindcss/postcss'".
- **Severity:** Minor.
- **Workaround:** Set `css: { postcss: {} }` in `vitest.config.ts` to stop PostCSS config discovery.
- **Time lost:** ~5 min.
- **Suggested fix:** Vite/Vitest could scope PostCSS config discovery to the project root by default, or warn rather than hard-fail when a discovered config's plugin is missing.
- **Evidence:** `vitest.config.ts`.

## 2026-09-18 — Live web substrate

### F-005 · geckodriver · Orphan session blocks new BiDi session ("Session already started")
- **Task:** Create a fresh WebDriver BiDi session to drive Firefox for the live substrate.
- **Steps:** `geckodriver --port 4444 --allow-origins http://127.0.0.1:9222`, then create a session.
- **Expected:** New session created.
- **Actual:** `/status` reported `{"message":"Session already started","ready":false}` — a prior/orphaned geckodriver process still held a single-session slot, blocking new sessions.
- **Severity:** Important (blocks all live web execution until cleared).
- **Workaround:** Kill the stray geckodriver process and start a fresh one; then `/status` returns `ready:true`. Our driver also relies on Nexus's session-create retry on "Session is already started".
- **Time lost:** ~8 min.
- **Suggested fix:** geckodriver could expose a way to reset/evict an orphaned session, or the docs could clearly note the single-session model and recommend a clean restart between runs. A demo reset step now restarts geckodriver.
- **Evidence:** `/status` output before/after; `scripts/live-firefox.ts` succeeds after a clean restart.

### F-006 · WebDriver BiDi · Origin allowlist required for the BiDi WebSocket handshake
- **Task:** Open the BiDi WebSocket after creating the session.
- **Steps:** Start geckodriver without `--allow-origins`; attempt the BiDi WS handshake.
- **Expected:** WS connects.
- **Actual:** The handshake is rejected unless geckodriver was started with `--allow-origins <origin>` matching the `Origin` header the client sends (`http://127.0.0.1:9222`).
- **Severity:** Minor (once known).
- **Workaround:** Always launch geckodriver with `--allow-origins http://127.0.0.1:9222` and send that same Origin on the WS.
- **Time lost:** ~5 min.
- **Suggested fix:** A clearer error message naming the required `--allow-origins` value would shorten diagnosis.
- **Evidence:** `README.md` live-substrate section; `src/nexus/firefox.ts` `bidiOrigin` default.

## 2026-09-18 — Public-release audit

### F-007 · Windows UIA (Nexus bridge) · Foreground SendKeys is focus-race sensitive
- **Task:** Repeatedly drive the native Windows brief (Notepad) through Nexus (`focus → scrape → click → type`) and verify via Nexus scrape.
- **Steps:** `scripts/live-windows.ts` run multiple times; combined gate `scripts/reliability-gate.ps1`.
- **Expected:** Consistent PASS (native window becomes dirty; Nexus scrape confirms).
- **Actual:** Intermittent. On a quiet desktop it passes (verified earlier 5/5); under a busy desktop with other apps/automation competing for the foreground, Nexus's `SendText` (which uses `SendKeys.SendWait` to the focused window) sometimes does not land, so the edit stays clean. Measured ~2/3 individually and 0/5 on the combined gate during this audit session (a loaded environment).
- **Severity:** Important (reliability for recording).
- **Workaround:** Record on a quiet desktop with no focus-stealing apps; full reset between runs; the substrate retries once. A future Nexus enhancement (element-scoped UIA ValuePattern.SetValue) would remove the foreground dependency entirely.
- **Suggested fix:** Add an element-targeted set-value path to the Nexus Windows bridge so text does not depend on foreground focus.

### F-008 · Nexus UIA bridge · Timed-out calls can leave orphaned PowerShell children
- **Task:** Run the Windows substrate repeatedly during the audit.
- **Actual:** When a bridge call exceeds the timeout, the spawned `powershell.exe` child can keep running; repeated timeouts pile up processes that contend for UI Automation COM and slow subsequent calls (cascading timeouts).
- **Severity:** Important.
- **Workaround:** Reset between runs (kill stray `powershell`/`node`/`geckodriver`/`notepad`) — the reliability gate does this. Raised the substrate's bridge timeout to 30s to absorb cold-start latency.
- **Suggested fix:** Ensure the daemon kills the spawned child process tree on timeout.

### F-009 · WebDriver BiDi (Firefox) · Combined multi-substrate launch is less reliable than standalone
- **Task:** Run the combined Firefox→Windows demo (`scripts/live-combined.ts`, both substrates live).
- **Actual:** The standalone Firefox proof (`scripts/live-firefox-full.ts`) passes cleanly and repeatably; the combined run (which brings up Firefox/BiDi and the Windows substrate together) intermittently fails the Firefox steps under load. Root cause appears to be session/timing contention when both live substrates initialise in the same process on a busy machine.
- **Severity:** Important (the headline demo is the combined crossing).
- **Workaround:** Record on a quiet desktop; fresh geckodriver per run; reset discipline.
- **Suggested fix:** Serialise/stagger substrate initialisation and add BiDi session-create retry hardening in the combined path.

<!-- Add new entries above this line as they occur during implementation. -->

## 2026-09-19 — Submission-readiness repair

### F-010 · Simulator planning · Default quick start selected live-only capability IDs
- **Task:** Verify the documented `serve --client` quick start against its default all-simulated backing.
- **Expected:** The simulated interaction uses the deterministic seeded-world contract.
- **Actual:** The client always tried `LiveWebPlanBuilder` first, producing direct Firefox/Windows IDs that the fake substrate does not expose.
- **Severity:** Critical (the primary first-run path could show failed steps despite a green test suite).
- **Fix:** Planner selection now uses runtime backing: seeded scenario planning for fake Firefox, direct live planning for real Firefox, and the Windows crossing only when Windows is real. Bedrock is also restricted to substrates that are real in the current run.
- **Suggested platform fix:** Make runtime capability discovery the planner’s catalogue rather than maintaining any static capability list.

### F-011 · TypeScript packaging · Successful build omitted live runtime modules
- **Task:** Verify that `npm run build` produced the live demo advertised by the repository.
- **Expected:** `dist/` contains the live adapters and their runtime assets.
- **Actual:** TypeScript explicitly excluded `firefox.ts`, `windows.ts`, the vendored BiDi TypeScript, scripts, and bridge assets. The build exited 0 but a compiled live run would fail at dynamic import.
- **Severity:** Critical (green build did not mean runnable distribution).
- **Fix:** Compile both adapters and the vendored BiDi client; copy the UI, UIA bridge, and bundled demo target; point the package binary at `dist/src/cli.js`; add `serve:dist`.
- **Suggested tool fix:** Add a post-build runtime smoke check for dynamically imported modules and required non-code assets.

### F-012 · Demo reproducibility · Live target required an undisclosed second checkout
- **Task:** Follow the live-demo setup from a cold project checkout.
- **Expected:** All project-specific runtime code is present.
- **Actual:** Instructions referenced `path/to/nexusos-semantic/demo/saas/server.cjs`, but that target was absent from this repository.
- **Severity:** Important.
- **Fix:** Vendored the exact Apache-2.0 demo SaaS subset under `demo/saas`, verified all 11 source files byte-for-byte by SHA-256, and added attribution.
- **Suggested fix:** Treat demo fixtures as versioned release inputs and validate their inventory in CI.

### F-013 · PowerShell release gate · JavaScript syntax in reliability gate + focus/teardown flakes
- **Task:** Run `scripts/reliability-gate.ps1 -Runs 5` on the final code.
- **Expected:** 5/5 clean runs of the combined Firefox→Windows proof.
- **Actual:** (1) The gate used `const process = Start-Process …` (JavaScript syntax) in PowerShell → `CommandNotFoundException: const`, so it crashed before any run. (2) The combined proof printed `…PROVEN` but never exited — `cmdServe` held `await new Promise(() => undefined)` with no stdin-EOF handler, so the Nexus stdio child outlived its MCP parent. (3) The Windows `ReplaceText` bridge intermittently failed `read-back did not match` because Notepad's RichEdit materialized the clipboard paste after the single-shot read-back. (4) `SetForegroundWindow()` returned `false` from the background PowerShell bridge under Windows foreground-lock.
- **Severity:** Critical (the headline 5-run gate could not pass, and the combined run leaked its process tree).
- **Fix:** Replaced `const` with `$process`; added stdin `end`/`close` handlers that run `cleanup()` and `process.exit(0)`; retried `SetForegroundWindow` with the ALT-tickle + `AttachThreadInput` technique before failing closed; made the read-back verification retry up to 5×120ms before declaring a mismatch; made the gate decide pass/fail from the `PROVEN` marker + `overall: true` (not a shell exit code contaminated by the Nexus child's inherited stderr).
- **Suggested platform fix:** Give `StdioServerTransport`/`cmdServe` an explicit "exit on transport close" mode, and make UIA read-back verification retry a controlled number of times by default.

## 2026-09-20 — Post-certification audit

### F-014 · Windows PowerShell 5.1 · `Start-Process` argument quoting broke the demo launcher in spaced paths
- **Task:** Run the README's primary demo command (`scripts/start-hidden-engine-demo.ps1`) from this workspace, whose path contains spaces (`C:\Users\Harvey\AMAZON ALEXA+ HACKATHON`).
- **Steps:** The launcher starts the demo SaaS via `Start-Process node -ArgumentList (Join-Path $ProjectRoot "demo\saas\server.cjs")`.
- **Expected:** node loads `demo\saas\server.cjs` and the SaaS listens on 7312.
- **Actual:** Windows PowerShell 5.1 passes a single-string `-ArgumentList` verbatim without quoting, so the child's CRT parser splits on spaces and node failed with `Cannot find module 'C:\Users\Harvey\AMAZON'`. The SaaS never started, so every downstream live step in that launch path fails. Reproduced in isolation with a 3-second probe (node exited immediately, code 1).
- **Severity:** Critical (the primary first-run command silently fails in any workspace path containing spaces; the certified 5/5 gate used the direct proof scripts, which is why this was not caught earlier).
- **Fix:** Quote the argument explicitly (`-ArgumentList ('"{0}"' -f $serverScript)`) so node receives one quoted path; verified in isolation that node then starts and stays up. Also hardened `src/nexus/real.ts`: `desktop_scrape_window` (used by the windows query path) is now part of the connect-time required-tools validation, so a runtime lacking it fails closed at startup instead of mid-demo.
- **Time lost:** ~45 min across the post-certification verification session.
- **Suggested platform fix:** `Start-Process` in Windows PowerShell 5.1 should quote `ArgumentList` items containing spaces (PowerShell 7.3+ already does).
- **Evidence:** probe stderr `Cannot find module 'C:\Users\Harvey\AMAZON'`; post-fix probe showing the server stay up; `26/26` hermetic tests + clean typecheck/build after both fixes.

### F-015 · Cold-clone runbook · failing closed ≠ passing proof (documented launch path vs gate-config path)

- **Task:** Run the logged-out cold-clone test on 2026-09-20: public-URL clones (`Mbuso-Harvey/nexusos-semantic` @ `b0fd3b9`, detached at tag `nexus-alexa-submission-v1`; `Mbuso-Harvey/nexus-alexa` @ `760dd82`), `pnpm install`/`npm install`, engine build, then drive one full Firefox + Windows + Bedrock run and freeze only if 6/6 steps pass.
- **Expected:** The Bedrock-planned Acme-review run reaches `outro.pass=true` (the video take depends on it) and the runbook's launch path produces it unchanged from a cold clone.
- **Actual:** Two distinct blockers, both caught by the harness transcript before any packaging change:
  1. The documented inline launch path (`--nexus-root/--graph/--target-app/--desktop`) spawns the Nexus child through the MCP SDK stdio transport with no explicit `env`, and the SDK merges only `getDefaultEnvironment()` plus that explicit option — the operator's session exports therefore cannot reach the runtime. The runtime stays in its deliberate fail-closed `audit` posture, so `set_theme`, `open_sensitive_dialog`, and `populate_brief` are denied mid-run. The runbook never mentioned the operator authorization the engine requires (`AWG_POSTURE` + explicit non-wildcard `AWG_AUTHORIZED_TARGETS` + sufficient `AWG_MAX_IMPACT`).
  2. With authorization supplied through the documented `--config`/`nexus.env` surface, the same run reaches 5/6: every Firefox read/invoke verifies, the Bedrock badge proves the planner, the CONFIRM beat fires and is granted — but the Windows verifier still reports `pass:false` even though the observed text matches. The planner's `populate_brief` expected-state asserts `dirty`/`hasEditor` keys that the live `desktop_read_text` adapter provably never returns (only `value`/`windowId`/`method`), so `verify()` compares two keys against `undefined` and fails by its own string-equality rule. No `live-windows.ts` or `live-combined.ts` assertion would pass either: both only ever assert `{ value: text }`.
- **Severity:** Critical for the submission's "what we prove" claim (the video take is this run) — and a trap for any cold cloner, because the documented launch path cannot pass as written.
- **Fix (packaging only, no runtime/behavior change):** this entry documents the gap; the runbook gains the operator-authorization section (config-file surface, explicit targets, `destroy` ceiling rationale) plus the release-test transcript as the evidence that names the one remaining verifier-shape mismatch. No source, contract, or fixture was modified to chase green.
