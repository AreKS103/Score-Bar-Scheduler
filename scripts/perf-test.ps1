$ErrorActionPreference = 'Continue'
$supaUrl = 'https://qdixepzbsboqpewzlfvy.supabase.co'
$anon = 'sb_publishable__nSFWc8sFpqJ9N0g5obcJw_8Eq00rS6'
$baseUrl = 'http://localhost:3000'
$body = @{ email = 'admin@gmail.com'; password = '123456789caque!' } | ConvertTo-Json -Compress
$resp = Invoke-RestMethod -Uri "$supaUrl/auth/v1/token?grant_type=password" -Method POST -Headers @{ apikey = $anon; 'Content-Type' = 'application/json' } -Body $body
Write-Host "Login OK: $($resp.user.email)"

# Build @supabase/ssr cookie. Newer versions use a JSON array; we use object form
# which @supabase/ssr also accepts via JSON.parse.
$sessionObj = [ordered]@{
  access_token  = $resp.access_token
  refresh_token = $resp.refresh_token
  expires_in    = $resp.expires_in
  expires_at    = $resp.expires_at
  token_type    = $resp.token_type
  user          = $resp.user
}
$json = $sessionObj | ConvertTo-Json -Compress -Depth 10
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
$cookieVal = "base64-$b64"
$cookieName = 'sb-qdixepzbsboqpewzlfvy-auth-token'

$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$chunkSize = 3180
if ($cookieVal.Length -le $chunkSize) {
  $c = New-Object System.Net.Cookie($cookieName, $cookieVal, '/', 'localhost')
  $sess.Cookies.Add($c)
  Write-Host "Set single cookie ($($cookieVal.Length) chars)"
} else {
  $i = 0; $pos = 0
  while ($pos -lt $cookieVal.Length) {
    $chunk = $cookieVal.Substring($pos, [Math]::Min($chunkSize, $cookieVal.Length - $pos))
    $c = New-Object System.Net.Cookie("$cookieName.$i", $chunk, '/', 'localhost')
    $sess.Cookies.Add($c)
    $pos += $chunkSize; $i++
  }
  Write-Host "Set $i chunked cookies"
}

function Measure-Endpoint($path, $passes = 3) {
  $url = "$baseUrl$path"
  Write-Host ""
  Write-Host "===== $path ====="
  for ($i = 1; $i -le $passes; $i++) {
    $t = Measure-Command {
      try {
        $script:r = Invoke-WebRequest -Uri $url -WebSession $sess -UseBasicParsing -TimeoutSec 120
      } catch {
        $script:r = $_.Exception.Response
      }
    }
    $code = if ($script:r) { $script:r.StatusCode } else { 'ERR' }
    $cc = ''
    try { $cc = $script:r.Headers['Cache-Control'] } catch {}
    Write-Host ("  pass {0}: {1,5}ms  HTTP {2}  Cache-Control: {3}" -f $i, [int]$t.TotalMilliseconds, $code, $cc)
  }
}

$start = (Get-Date -UFormat %Y-%m-%d)
$end = (Get-Date).AddDays(7).ToString('yyyy-MM-dd')
Measure-Endpoint "/api/user-profile"
Measure-Endpoint "/api/org"
Measure-Endpoint "/api/embed-instances"
Measure-Endpoint "/api/custom-events"
Measure-Endpoint "/api/custom-tags"
Measure-Endpoint "/api/scheduled-publish"
Measure-Endpoint "/api/schedule-history"
Measure-Endpoint "/api/events?start=$start&end=$end&tz=America/New_York"
