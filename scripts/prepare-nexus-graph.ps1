param(
  [string]$NexusRoot = "",
  [int]$AppPort = 7312,
  [string]$Geckodriver = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($NexusRoot)) {
  $NexusRoot = Join-Path (Split-Path -Parent $ProjectRoot) "_research_awg"
}
$NexusRoot = (Resolve-Path $NexusRoot).Path
$GraphDir = Join-Path $ProjectRoot "demo\nexus-graph"
$BaseUrl = "http://127.0.0.1:$AppPort"

if ([string]::IsNullOrWhiteSpace($Geckodriver)) {
  $driver = Get-Command geckodriver -ErrorAction Stop
  $Geckodriver = $driver.Source
}

$demoProcess = $null
$driverProcess = $null
try {
  $existing = $null
  try { $existing = Invoke-WebRequest -UseBasicParsing "$BaseUrl/index.html" -TimeoutSec 2 } catch {}
  if ($existing) {
    if (-not $existing.Content.Contains('btn-sensitive-signout')) {
      throw "Port $AppPort is occupied by the wrong application"
    }
  }
  else {
    $oldPort = $env:PORT
    $env:PORT = [string]$AppPort
    try {
      $demoProcess = Start-Process node `
        -ArgumentList (Join-Path $ProjectRoot "demo\saas\server.cjs") `
        -WorkingDirectory $ProjectRoot -PassThru
    }
    finally {
      if ($null -eq $oldPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $env:PORT = $oldPort }
    }
    Start-Sleep -Seconds 1
  }

  try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:4444/status" -TimeoutSec 2
    if (-not $status.value.ready) { throw "existing geckodriver is not ready" }
  }
  catch {
    $driverProcess = Start-Process $Geckodriver `
      -ArgumentList '--port', '4444', '--host', '127.0.0.1', '--allow-origins', 'http://127.0.0.1:9222' `
      -WindowStyle Hidden -PassThru
    for ($attempt = 1; $attempt -le 30; $attempt++) {
      try {
        $status = Invoke-RestMethod -Uri "http://127.0.0.1:4444/status" -TimeoutSec 2
        if ($status.value.ready) { break }
      } catch {}
      Start-Sleep -Milliseconds 500
    }
    if (-not $status.value.ready) { throw "geckodriver did not become ready" }
  }

  & pnpm.cmd --dir $NexusRoot run nexus -- crawl $BaseUrl --out $GraphDir --max-pages 10
  if ($LASTEXITCODE -ne 0) { throw "Nexus crawl failed with exit code $LASTEXITCODE" }
  if (-not (Test-Path (Join-Path $GraphDir "graph.json"))) { throw "Nexus did not write graph.json" }
  Write-Host "NEXUS GRAPH READY: $GraphDir"
}
finally {
  if ($driverProcess -and -not $driverProcess.HasExited) { Stop-Process -Id $driverProcess.Id -Force -ErrorAction SilentlyContinue }
  if ($demoProcess -and -not $demoProcess.HasExited) { Stop-Process -Id $demoProcess.Id -Force -ErrorAction SilentlyContinue }
}
