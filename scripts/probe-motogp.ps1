$ErrorActionPreference = 'Continue'
$h = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'; 'Accept' = 'application/json' }

Write-Host "========== TheSportsDB MotoGP round-by-round 2026 (rounds 1-12) =========="
$allFound = New-Object System.Collections.ArrayList
foreach ($r in 1..12) {
  try {
    $resp = Invoke-RestMethod -Uri "https://www.thesportsdb.com/api/v1/json/123/eventsround.php?id=4407&r=$r&s=2026" -Headers $h -TimeoutSec 10
    $cnt = if ($resp.events) { $resp.events.Count } else { 0 }
    Write-Host "round $r : $cnt events"
    if ($resp.events) {
      foreach ($e in $resp.events) {
        Write-Host ("    {0}  {1} {2}  '{3}'  status={4}" -f $e.idEvent, $e.dateEvent, $e.strTime, $e.strEvent, $e.strStatus)
        [void]$allFound.Add($e.idEvent)
      }
    }
  } catch { Write-Host "round $r : FAILED $($_.Exception.Message)" }
  Start-Sleep -Milliseconds 200
}
Write-Host "TOTAL unique events found across rounds: $($allFound.Count)"

Write-Host ""
Write-Host "========== Official MotoGP API — seasons =========="
try {
  $r = Invoke-RestMethod -Uri 'https://api.motogp.pulselive.com/motogp/v1/results/seasons' -Headers $h -TimeoutSec 15
  Write-Host "seasons: $($r.Count)"
  $r | Select-Object -First 5 | ForEach-Object { Write-Host ("  id={0}  year={1}  current={2}" -f $_.id, $_.year, $_.current) }
} catch { Write-Host "FAILED: $($_.Exception.Message)" }

Write-Host ""
Write-Host "========== Official MotoGP API — events 2026 =========="
try {
  # Find 2026 season id first
  $seasons = Invoke-RestMethod -Uri 'https://api.motogp.pulselive.com/motogp/v1/results/seasons' -Headers $h -TimeoutSec 15
  $s2026 = $seasons | Where-Object { $_.year -eq 2026 } | Select-Object -First 1
  if ($s2026) {
    Write-Host "Found 2026 season id=$($s2026.id)"
    $events = Invoke-RestMethod -Uri "https://api.motogp.pulselive.com/motogp/v1/results/events?seasonUuid=$($s2026.id)&isFinished=false" -Headers $h -TimeoutSec 15
    Write-Host "upcoming/active events: $($events.Count)"
    $events | Select-Object -First 30 | ForEach-Object {
      Write-Host ("  {0}  {1}  to {2}  '{3}'" -f $_.id, $_.date_start, $_.date_end, $_.name)
    }
  }
} catch { Write-Host "FAILED: $($_.Exception.Message)" }

Write-Host ""
Write-Host "========== Official MotoGP API — broadcast/calendar fallback =========="
try {
  $r = Invoke-RestMethod -Uri 'https://api.motogp.pulselive.com/motogp/v1/results/events?seasonYear=2026' -Headers $h -TimeoutSec 15
  Write-Host "events: $($r.Count)"
  $r | Select-Object -First 30 | ForEach-Object {
    Write-Host ("  {0}  {1}  to {2}  '{3}'" -f $_.id, $_.date_start, $_.date_end, $_.name)
  }
} catch { Write-Host "FAILED: $($_.Exception.Message)" }
