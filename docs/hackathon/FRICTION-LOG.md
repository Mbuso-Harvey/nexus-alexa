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
