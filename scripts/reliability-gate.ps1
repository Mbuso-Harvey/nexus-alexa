# Reliability gate: run the combined Firefox->Windows live demo N times with a full reset
# between runs.
#
# Usage:
#   powershell -File scripts/reliability-gate.ps1 -Runs 5
#   powershell -File scripts/reliability-gate.ps1 -Runs 5 -Geckodriver "C:\path\to\geckodriver.exe"
#
# geckodriver is resolved in this order: -Geckodriver arg, $env:GECKODRIVER, then "geckodriver"
# on PATH. Install geckodriver from https://github.com/mozilla/geckodriver/releases.
param(
  [int]$Runs = 5,
  [string]$WebApp = "http://127.0.0.1:7311",
  [string]$Geckodriver = ""
)

# Resolve the geckodriver executable reproducibly (no user-specific hardcoded path).
if ([string]::IsNullOrWhiteSpace($Geckodriver)) {
  if ($env:GECKODRIVER) {
    $Geckodriver = $env:GECKODRIVER
  }
  else {
    $onPath = Get-Command geckodriver -ErrorAction SilentlyContinue
    if ($onPath) { $Geckodriver = $onPath.Source } else { $Geckodriver = "geckodriver" }
  }
}
Write-Host ("Using geckodriver: {0}" -f $Geckodriver)

$pass = 0
for ($i = 1; $i -le $Runs; $i++) {
  # Reset environment
  Get-Process geckodriver, firefox, notepad -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
  Start-Process $Geckodriver `
    -ArgumentList '--port', '4444', '--host', '127.0.0.1', '--allow-origins', 'http://127.0.0.1:9222' `
    -WindowStyle Hidden
  Start-Sleep -Seconds 3

  $out = (npx tsx scripts/live-combined.ts $WebApp 2>&1 | Out-String)
  if ($out -match "CROSS-SUBSTRATE LIVE DEMO PROVEN") {
    $pass++
    Write-Host ("RUN {0}: PASS" -f $i)
  }
  else {
    Write-Host ("RUN {0}: FAIL" -f $i)
    Write-Host (($out -split "`n" | Select-Object -Last 10) -join "`n")
  }
}

# Final cleanup
Get-Process geckodriver, firefox, notepad -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host ("CLEAN RUNS: {0}/{1}" -f $pass, $Runs)
if ($pass -eq $Runs) { exit 0 } else { exit 1 }
