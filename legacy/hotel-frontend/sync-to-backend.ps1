param(
  [string]$BackendDir = "..\hotel-backend"
)

$backendWeb = Join-Path $BackendDir "app\web"
if (-not (Test-Path $backendWeb)) {
  Write-Error "Backend dir must contain app\web. Got: $BackendDir"
  exit 1
}

# Update frontend-version.json if we're in a git checkout
if (Get-Command git -ErrorAction SilentlyContinue) {
  if (Test-Path ".git") {
    $commit = (git rev-parse --short HEAD 2>$null)
    if ($commit) {
      $json = "{`n  \"frontend_commit\": \"$commit\"`n}`n"
      Set-Content -LiteralPath "static\frontend-version.json" -Value $json -Encoding UTF8
    }
  }
}

# Sync static + templates
$srcStatic = Join-Path (Get-Location) "static"
$dstStatic = Join-Path $backendWeb "static"
$srcTemplates = Join-Path (Get-Location) "templates"
$dstTemplates = Join-Path $backendWeb "templates"

robocopy $srcStatic $dstStatic /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy $srcTemplates $dstTemplates /MIR /NFL /NDL /NJH /NJS /NP | Out-Null

# Optional convenience copies
$extra = @("hotel-webapp.css","hotel-webapp.js","public_landing.html","web_app.html","web_app_landing.html")
foreach ($f in $extra) {
  if (Test-Path $f) {
    Copy-Item -LiteralPath $f -Destination (Join-Path $backendWeb $f) -Force
  }
}

Write-Host "OK: Synced templates + static into $backendWeb"
