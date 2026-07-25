<#
.SYNOPSIS
    StoX App Version Bump Script
.DESCRIPTION
    Bumps the SemVer version across all versioned files:
      - app-core.js   (window.__STOX_APP_VERSION + fallback)
      - sw.js         (CACHE_NAME)
      - manifest.json (version field)
.USAGE
    ./bump-version.ps1 patch          # 1.0.0 -> 1.0.1
    ./bump-version.ps1 minor          # 1.0.0 -> 1.1.0
    ./bump-version.ps1 major          # 1.0.0 -> 2.0.0
    ./bump-version.ps1 2.3.4          # explicit version
#>

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$BumpType
)

$ErrorActionPreference = "Stop"

# ── Resolve script directory (project root) ──────────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PWD.Path }

$AppCorePath  = Join-Path $ScriptDir "app-core.js"
$SwPath       = Join-Path $ScriptDir "sw.js"
$ManifestPath = Join-Path $ScriptDir "manifest.json"

# ── Read current version from app-core.js ────────────────────────────────
$appCoreContent = [System.IO.File]::ReadAllText($AppCorePath, [System.Text.Encoding]::UTF8)
$currentMatch = [regex]::Match($appCoreContent, 'window\.__STOX_APP_VERSION\s*=\s*"(\d+\.\d+\.\d+)"')
if (-not $currentMatch.Success) {
    Write-Error "Could not find window.__STOX_APP_VERSION in app-core.js"
    exit 1
}
$currentVersion = $currentMatch.Groups[1].Value
$parts = $currentVersion -split '\.'
$major = [int]$parts[0]
$minor = [int]$parts[1]
$patch = [int]$parts[2]

# ── Compute new version ──────────────────────────────────────────────────
switch ($BumpType.ToLower()) {
    "major" {
        $major++; $minor = 0; $patch = 0
    }
    "minor" {
        $minor++; $patch = 0
    }
    "patch" {
        $patch++
    }
    default {
        if ($BumpType -match '^(\d+)\.(\d+)\.(\d+)$') {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            $patch = [int]$Matches[3]
        } else {
            Write-Error "Invalid argument: '$BumpType'. Use 'major', 'minor', 'patch', or an explicit version like '1.2.3'."
            exit 1
        }
    }
}

$newVersion = "$major.$minor.$patch"

if ($newVersion -eq $currentVersion) {
    Write-Host "Version is already $currentVersion - nothing to bump." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "  StoX Version Bump" -ForegroundColor Cyan
Write-Host "  =================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Current : $currentVersion" -ForegroundColor Gray
Write-Host "  New     : $newVersion" -ForegroundColor Green
Write-Host ""

# ── Update app-core.js ───────────────────────────────────────────────────
# 1. Replace window.__STOX_APP_VERSION = "X.Y.Z"
$appCoreContent = [regex]::Replace(
    $appCoreContent,
    '(window\.__STOX_APP_VERSION\s*=\s*")\d+\.\d+\.\d+(")',
    '${1}' + $newVersion + '${2}'
)

# 2. Replace fallback version in About section: || "X.Y.Z"
$appCoreContent = [regex]::Replace(
    $appCoreContent,
    '(\|\| ")\d+\.\d+\.\d+(")',
    '${1}' + $newVersion + '${2}'
)

[System.IO.File]::WriteAllText($AppCorePath, $appCoreContent, [System.Text.Encoding]::UTF8)
Write-Host "  Updated app-core.js" -ForegroundColor Gray

# ── Update sw.js ─────────────────────────────────────────────────────────
# Matches both old format (stox-v3) and new semver format (stox-v1.0.0)
$swContent = [System.IO.File]::ReadAllText($SwPath, [System.Text.Encoding]::UTF8)
$swContent = [regex]::Replace(
    $swContent,
    "(const CACHE_NAME\s*=\s*')stox-v[\d\.]+(')",
    '${1}stox-v' + $newVersion + '${2}'
)
[System.IO.File]::WriteAllText($SwPath, $swContent, [System.Text.Encoding]::UTF8)
Write-Host "  Updated sw.js" -ForegroundColor Gray

# ── Update manifest.json ─────────────────────────────────────────────────
$manifestContent = [System.IO.File]::ReadAllText($ManifestPath, [System.Text.Encoding]::UTF8)
$manifest = $manifestContent | ConvertFrom-Json

if ($manifest.PSObject.Properties['version']) {
    $manifest.version = $newVersion
} else {
    $manifest | Add-Member -NotePropertyName "version" -NotePropertyValue $newVersion
}

$manifestJson = $manifest | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($ManifestPath, $manifestJson, [System.Text.Encoding]::UTF8)
Write-Host "  Updated manifest.json" -ForegroundColor Gray

# ── Done ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Bumped $currentVersion -> $newVersion" -ForegroundColor Green
Write-Host ""
