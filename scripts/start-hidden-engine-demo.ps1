param(
  [string]$NexusRoot = "",
  [int]$AppPort = 7312,
  [int]$McpPort = 8391,
  [int]$ClientPort = 8392
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($NexusRoot)) {
  $NexusRoot = Join-Path (Split-Path -Parent $ProjectRoot) "_research_awg"
}
$NexusRoot = (Resolve-Path $NexusRoot).Path
$GraphDir = Join-Path $ProjectRoot "demo\nexus-graph"
$BaseUrl = "http://127.0.0.1:$AppPort"
if (-not (Test-Path (Join-Path $GraphDir "graph.json"))) {
  throw "Trusted graph is missing. Run scripts\prepare-nexus-graph.ps1 first."
}
$driver = (Get-Command geckodriver -ErrorAction Stop).Source

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
$driverProcess = Start-Process $driver `
  -ArgumentList '--port', '4444', '--host', '127.0.0.1', '--allow-origins', 'http://127.0.0.1:9222' `
  -WindowStyle Hidden -PassThru
$notepadProcess = Start-Process "C:\Windows\System32\notepad.exe" -PassThru

try {
  Start-Sleep -Seconds 3
  Write-Host "Starting the Alexa experience. The child execution engine is one Nexus MCP process."
  & npx.cmd tsx (Join-Path $ProjectRoot "src\cli.ts") serve `
    --port $McpPort --client --client-port $ClientPort `
    --nexus-root $NexusRoot --graph $GraphDir --target-app $BaseUrl --desktop
}
finally {
  if ($driverProcess -and -not $driverProcess.HasExited) { Stop-Process -Id $driverProcess.Id -Force -ErrorAction SilentlyContinue }
  if ($demoProcess -and -not $demoProcess.HasExited) { Stop-Process -Id $demoProcess.Id -Force -ErrorAction SilentlyContinue }
  # Leave Notepad visible so the final verified result remains on screen.
}
