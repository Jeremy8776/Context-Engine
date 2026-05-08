param(
  [string]$Source = "mcpb/context-engine",
  [string]$Output = "dist/context-engine-claude-desktop.mcpb"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$sourcePath = Resolve-Path (Join-Path $root $Source)
$outputPath = Join-Path $root $Output
$outputDir = Split-Path -Parent $outputPath
$tempZip = [System.IO.Path]::ChangeExtension($outputPath, ".zip")
$staging = Join-Path $outputDir "mcpb-context-engine"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
if (Test-Path $tempZip) { Remove-Item -LiteralPath $tempZip -Force }
if (Test-Path $outputPath) { Remove-Item -LiteralPath $outputPath -Force }
if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null

Copy-Item -Path (Join-Path $sourcePath "*") -Destination $staging -Recurse -Force

$iconSource = Join-Path $root "ui/assets/brand/icon.png"
$iconTarget = Join-Path $staging "icon.png"
Copy-Item -LiteralPath $iconSource -Destination $iconTarget -Force

# Sync the canonical tool schema file into the bundle so the zero-dep server
# can read the same schemas/version as the in-repo MCP transports.
$schemasSource = Join-Path $root "mcp-schemas.json"
$schemasTarget = Join-Path $staging "server/schemas.json"
Copy-Item -LiteralPath $schemasSource -Destination $schemasTarget -Force

# Keep manifest version aligned with mcp-schemas.json single source of truth.
$schemas = Get-Content -LiteralPath $schemasSource -Raw | ConvertFrom-Json
$manifestPath = Join-Path $staging "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$manifest.version = $schemas.version
$manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manifestPath -Encoding utf8

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $tempZip -Force
Move-Item -LiteralPath $tempZip -Destination $outputPath -Force
Remove-Item -LiteralPath $staging -Recurse -Force

Write-Host "Packed $outputPath"
