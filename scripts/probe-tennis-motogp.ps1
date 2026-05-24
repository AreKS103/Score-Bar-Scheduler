$ErrorActionPreference = 'Continue'
$h = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'; 'Accept' = 'application/json' }

function Probe($label, $url) {
  Write-Host ""
  Write-Host "========== $label =========="
  Write-Host "URL: $url"
  try {
    $r = Invoke-RestMethod -Uri $url -Headers $h -TimeoutSec 20
    Write-Host "events: $($r.events.Count)"
    $r.events | Select-Object -First 25 | ForEach-Object {
      $g = if ($_.groupings) { $_.groupings.Count } else { 0 }
      Write-Host ("  {0,-12} {1}  {2,-50}  groupings={3}" -f $_.id, $_.date, $_.shortName, $g)
    }
  } catch {
    Write-Host "FAILED: $($_.Exception.Message)"
  }
}

Probe 'ESPN tennis/atp (no dates)'         'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard?limit=1000'
Probe 'ESPN tennis/atp dates=20260520-0607' 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard?dates=20260520-20260607&limit=1000'
Probe 'ESPN tennis/wta (no dates)'         'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard?limit=1000'
Probe 'ESPN tennis/wta dates=20260520-0607' 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard?dates=20260520-20260607&limit=1000'

Write-Host ""
Write-Host "========== TheSportsDB MotoGP eventsnextleague =========="
$r = Invoke-RestMethod -Uri 'https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4407' -Headers $h -TimeoutSec 20
Write-Host "events: $($r.events.Count)"
$r.events | Select-Object -First 25 | ForEach-Object {
  Write-Host ("  {0}  {1} {2}  status={3}  round={4}  '{5}'" -f $_.idEvent, $_.dateEvent, $_.strTime, $_.strStatus, $_.intRound, $_.strEvent)
}

Write-Host ""
Write-Host "========== TheSportsDB MotoGP eventspastleague =========="
$r = Invoke-RestMethod -Uri 'https://www.thesportsdb.com/api/v1/json/123/eventspastleague.php?id=4407' -Headers $h -TimeoutSec 20
Write-Host "events: $($r.events.Count)"
$r.events | Select-Object -First 25 | ForEach-Object {
  Write-Host ("  {0}  {1} {2}  status={3}  round={4}  '{5}'" -f $_.idEvent, $_.dateEvent, $_.strTime, $_.strStatus, $_.intRound, $_.strEvent)
}

Write-Host ""
Write-Host "========== TheSportsDB MotoGP eventsseason 2026 =========="
$r = Invoke-RestMethod -Uri 'https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4407&s=2026' -Headers $h -TimeoutSec 20
Write-Host "events: $($r.events.Count)"
$r.events | Select-Object -First 25 | ForEach-Object {
  Write-Host ("  {0}  {1} {2}  status={3}  round={4}  '{5}'" -f $_.idEvent, $_.dateEvent, $_.strTime, $_.strStatus, $_.intRound, $_.strEvent)
}

Write-Host ""
Write-Host "========== TheSportsDB MotoGP eventsseason 2026-2026 =========="
try {
  $r = Invoke-RestMethod -Uri 'https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4407&s=2025-2026' -Headers $h -TimeoutSec 20
  Write-Host "events: $($r.events.Count)"
} catch { Write-Host "FAILED: $($_.Exception.Message)" }
