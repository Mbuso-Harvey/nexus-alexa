# Vendored NexusOS Semantic components

This directory contains a **minimal, unmodified subset** of
[NexusOS Semantic](https://github.com/nexusos-systems/nexusos-semantic), vendored so this
repository is fully reproducible from a cold `git clone` without a separate Nexus checkout.

**License:** Apache-2.0 (see `./LICENSE`). Copyright NexusOS Systems. Vendored here under the
terms of that license, with attribution preserved.

## What's vendored and why

| Path | Purpose in this project |
|---|---|
| `bidi-client/` | NexusOS Semantic's WebDriver BiDi client (session, page, script, input, browsing-context, transport, storage, network). Used by the live **Firefox** substrate (`src/nexus/firefox.ts`) to drive a real browser via geckodriver. Self-contained (no imports outside this directory). |
| `desktop/windows/scripts/uia-bridge.ps1` | NexusOS Semantic's Windows UI Automation PowerShell bridge (ListWindows / Focus / SendText / SendHotkey / DumpTree / Click / …). Used by the live **Windows** substrate (`src/nexus/windows.ts`) to operate real native apps. |

## How it's consumed
- `src/nexus/firefox.ts` imports the BiDi client from `../../vendor/nexus/bidi-client/…`.
- `src/nexus/windows.ts` runs the vendored `uia-bridge.ps1` via `powershell.exe` (the same
  invocation NexusOS Semantic's `WindowsUiaDaemon` uses).

## Updating
These files are a snapshot. To refresh, copy the corresponding files from a NexusOS Semantic
checkout. When NexusOS Semantic is published to npm, this vendor directory can be replaced by a
normal package dependency without changing the substrate contracts in `src/nexus/`.

The vendored files are intentionally left unmodified so provenance is unambiguous.
