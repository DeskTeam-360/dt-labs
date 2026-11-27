# Asks the DeskTeam360 Monitor plugin on a site for its report, the same way the app does, and prints what matters.
# The key stays on this computer: it is only used to sign the request.
#
# Run:  .\scripts\wp-report-check.ps1 -Site https://jeremykenerson.com -Key <DT360_MONITOR_KEY from the site's wp-config.php>
param(
  [Parameter(Mandatory = $true)][string]$Site,
  [Parameter(Mandatory = $true)][string]$Key
)

$ts = [string][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($Key)
$sig = ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$ts.report"))) -replace '-', '').ToLower()

$url = ($Site.TrimEnd('/')) + "/wp-json/dt360-monitor/v1/report?nocache=$ts"
$headers = @{ 'X-DT360-Timestamp' = $ts; 'X-DT360-Signature' = $sig; 'Accept' = 'application/json'; 'Cache-Control' = 'no-cache' }

try {
  $resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing
} catch {
  Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host "HTTP $($resp.StatusCode)"
foreach ($h in 'Cache-Control', 'Age', 'X-Cache', 'X-W3TC-Minify', 'Server', 'CF-Cache-Status') {
  if ($resp.Headers[$h]) { Write-Host ("  {0}: {1}" -f $h, $resp.Headers[$h]) }
}
$r = $resp.Content | ConvertFrom-Json
Write-Host ""
Write-Host "now (this computer, UTC): $([DateTime]::UtcNow.ToString('s'))Z"
Write-Host "sent_at in the report   : $($r.sent_at)"
Write-Host "plugin_version          : $($r.plugin_version)"
Write-Host "wordfence version       : $($r.wordfence.version)"
Write-Host "wordfence open_issues   : $($r.wordfence.open_issues)"
Write-Host "status_counts           : $($r.wordfence.status_counts | ConvertTo-Json -Compress)"
Write-Host "issues_debug            : $($r.wordfence.issues_debug | ConvertTo-Json -Compress -Depth 4)"
