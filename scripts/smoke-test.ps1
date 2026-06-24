param(
  [switch] $Full
)

$ErrorActionPreference = "Stop"

$BaseUrl = "http://127.0.0.1:3217"
$checks = @(
  @{ Name = "health"; Method = "GET"; Path = "/health" },
  @{ Name = "frontend"; Method = "GET"; Path = "/" },
  @{ Name = "config"; Method = "GET"; Path = "/api/config/load" },
  @{ Name = "homework"; Method = "GET"; Path = "/api/homework/due" },
  @{ Name = "mail"; Method = "GET"; Path = "/api/mail/summary" },
  @{ Name = "notifications"; Method = "GET"; Path = "/api/notifications" },
  @{ Name = "school notices"; Method = "GET"; Path = "/api/school/notices" },
  @{ Name = "link icon"; Method = "GET"; Path = "/api/link-icons/resolve?href=https%3A%2F%2Fgithub.com" }
)

if ($Full) {
  $checks += @(
    @{ Name = "homework refresh"; Method = "POST"; Path = "/api/homework/refresh"; Body = "{}" },
    @{ Name = "mail refresh"; Method = "POST"; Path = "/api/mail/refresh"; Body = "{}" },
    @{ Name = "school notices refresh"; Method = "POST"; Path = "/api/school/notices/refresh"; Body = "{}" }
  )
}

foreach ($check in $checks) {
  $uri = "$BaseUrl$($check.Path)"
  $started = Get-Date

  if ($check.Method -eq "POST") {
    $response = Invoke-WebRequest `
      -Method Post `
      -Uri $uri `
      -Body $check.Body `
      -ContentType "application/json" `
      -TimeoutSec 240 `
      -UseBasicParsing
  }
  else {
    $response = Invoke-WebRequest -Uri $uri -TimeoutSec 60 -UseBasicParsing
  }

  $elapsed = [Math]::Round(((Get-Date) - $started).TotalSeconds, 2)
  Write-Host ("OK {0,-24} {1,3} {2,6}s {3}" -f $check.Name, $response.StatusCode, $elapsed, $response.Headers["Content-Type"])
}
