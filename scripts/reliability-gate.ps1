# Reliability gate: run the combined Firefox->Windows live demo N times with a full reset.
# Each run is bounded and its complete process tree is terminated on timeout.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/reliability-gate.ps1 -Runs 5
#   powershell -ExecutionPolicy Bypass -File scripts/reliability-gate.ps1 -Runs 5 -Geckodriver "C:\path\to\geckodriver.exe"
param(
  [int]$Runs = 5,
  [string]$WebApp = "http://127.0.0.1:7312",
  [string]$Geckodriver = "",
  [int]$RunTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Npx = (Get-Command npx.cmd -ErrorAction Stop).Source

if ([string]::IsNullOrWhiteSpace($Geckodriver)) {
  if ($env:GECKODRIVER) {
    $Geckodriver = $env:GECKODRIVER
  }
  else {
    $onPath = Get-Command geckodriver -ErrorAction SilentlyContinue
    if (-not $onPath) { throw "geckodriver was not found; install it or pass -Geckodriver" }
    $Geckodriver = $onPath.Source
  }
}
Write-Host ("Using geckodriver: {0}" -f $Geckodriver)

function Reset-LiveApps {
  $processes = @(Get-Process geckodriver, firefox, notepad -ErrorAction SilentlyContinue)
  if ($processes.Count -gt 0) {
    $processes | Stop-Process -Force -ErrorAction SilentlyContinue
    foreach ($process in $processes) {
      try { Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue } catch {}
    }
  }
  Start-Sleep -Seconds 2
}

function Start-ReadyGeckodriver {
  $process = Start-Process $Geckodriver `
    -ArgumentList '--port', '4444', '--host', '127.0.0.1', '--allow-origins', 'http://127.0.0.1:9222' `
    -WindowStyle Hidden -PassThru
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    if ($process.HasExited) { return $null }
    try {
      $status = Invoke-RestMethod -Uri 'http://127.0.0.1:4444/status' -TimeoutSec 2
      if ($status.value.ready -eq $true) { return $process }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  return $null
}

function Invoke-BoundedCombinedProof {
  $stdout = [System.IO.Path]::GetTempFileName()
  $stderr = [System.IO.Path]::GetTempFileName()
  try {
    $process = Start-Process $Npx `
      -ArgumentList 'tsx', 'scripts/live-combined.ts' `
      -WorkingDirectory $ProjectRoot -NoNewWindow -PassThru `
      -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    if (-not $process.WaitForExit($RunTimeoutSeconds * 1000)) {
      & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
      return [PSCustomObject]@{ ExitCode = 124; Output = "Timed out after $RunTimeoutSeconds seconds" }
    }
    $process.WaitForExit()
    $process.Refresh()
    $exitCode = if ($null -ne $process.ExitCode) { [int]$process.ExitCode } else { 1 }
    $out = ((Get-Content $stdout -Raw -ErrorAction SilentlyContinue) +
      (Get-Content $stderr -Raw -ErrorAction SilentlyContinue))
    return [PSCustomObject]@{ ExitCode = $exitCode; Output = $out }
  }
  finally {
    Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
  }
}

$pass = 0
for ($i = 1; $i -le $Runs; $i++) {
  Reset-LiveApps
  $driver = Start-ReadyGeckodriver
  if (-not $driver) {
    Write-Host ("RUN {0}: FAIL (geckodriver did not become ready)" -f $i)
    continue
  }

  Start-Process "C:\Windows\System32\notepad.exe" | Out-Null
  Start-Sleep -Seconds 2
  $result = Invoke-BoundedCombinedProof
  # Success is decided by the proof's own marker and `overall: true`, not by the
  # multiplexed shell exit code. The Nexus stdio child inherits stderr, so its
  # teardown can contaminate the wrapper's exit status after a fully-green run.
  $proven = $result.Output -match "NEXUS-ONLY CROSS-SUBSTRATE DEMO PROVEN"
  $overallTrue = $result.Output -match '"overall"\s*:\s*true'
  if ($proven -and $overallTrue) {
    $pass++
    Write-Host ("RUN {0}: PASS" -f $i)
  }
  else {
    Write-Host ("RUN {0}: FAIL (exit {1})" -f $i, $result.ExitCode)
    Write-Host (($result.Output -split "`n" | Select-Object -Last 14) -join "`n")
  }
}

Reset-LiveApps
Write-Host ("CLEAN RUNS: {0}/{1}" -f $pass, $Runs)
if ($pass -eq $Runs) { exit 0 } else { exit 1 }
