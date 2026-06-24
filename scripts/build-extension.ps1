$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"
$DistDir = Join-Path $FrontendDir "dist"
$ReleaseDir = Join-Path $RepoRoot "release"
$ZipPath = Join-Path $ReleaseDir "mypage-extension.zip"

Push-Location $FrontendDir
try {
  if (-not (Test-Path "node_modules")) {
    npm install
  }

  npm run build
}
finally {
  Pop-Location
}

if (-not (Test-Path (Join-Path $DistDir "manifest.json"))) {
  throw "Build did not produce frontend/dist/manifest.json"
}

if (-not (Test-Path $ReleaseDir)) {
  New-Item -ItemType Directory -Path $ReleaseDir | Out-Null
}

if (Test-Path $ZipPath) {
  Remove-Item -LiteralPath $ZipPath
}

Compress-Archive -Path (Join-Path $DistDir "*") -DestinationPath $ZipPath

Write-Host "Built extension:"
Write-Host "  unpacked: $DistDir"
Write-Host "  zip:      $ZipPath"
