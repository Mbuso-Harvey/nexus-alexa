# Reliability gate: run the combined Firefox->Windows live demo N times with a full reset
# between runs. Usage: powershell -File scripts/reliability-gate.ps1 -Runs 5
param([int]$Runs = 5, [string]$WebApp = "http://127.0.0.1:7311")

$pass = 0
for ($i = 1; $i -le $Runs; $i++) {
  # Reset environment
  Get-Process geckodriver, firefox, notepad -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
  Start-Process "C:\Users\Harvey\bin\geckodriver.exe" `
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
