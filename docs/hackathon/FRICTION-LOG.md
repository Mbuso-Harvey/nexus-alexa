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

<!-- Add new entries above this line as they occur during implementation. -->
