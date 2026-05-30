# ============================================================
# Scorebar Scheduler — WordPress Live-Reload Dev Setup
# ============================================================
# Run this ONCE (as Administrator) to symlink the plugin source
# folder into LocalWP so Ctrl+S in VS Code instantly updates the
# plugin with no reinstall needed.
#
# Usage (in an admin PowerShell from the project root):
#   .\scripts\setup-plugin-dev.ps1
#
# To target a different LocalWP site name:
#   .\scripts\setup-plugin-dev.ps1 -SiteName "my-other-site"
# ============================================================

param(
    [string]$SiteName = "scheduler"
)

$pluginSource = Resolve-Path "$PSScriptRoot\..\wordpress-plugin"
$localSitesBase = "$env:USERPROFILE\Local Sites"
$siteFolder = Join-Path $localSitesBase $SiteName
if (-not (Test-Path $siteFolder) -and (Test-Path $localSitesBase)) {
    $match = Get-ChildItem $localSitesBase -Directory | Where-Object { $_.Name -ieq $SiteName } | Select-Object -First 1
    if ($match) { $siteFolder = $match.FullName }
}
$pluginsDir = Join-Path $siteFolder "app\public\wp-content\plugins"
$linkTarget  = Join-Path $pluginsDir "scorebar-scheduler"

Write-Host ""
Write-Host "=== Scorebar Scheduler - Plugin Dev Symlink ===" -ForegroundColor Cyan
Write-Host ("  Source  : " + $pluginSource)
Write-Host ("  Link    : " + $linkTarget)
Write-Host ""

# Validate source
if (-not (Test-Path $pluginSource)) {
    Write-Error "Plugin source not found: $pluginSource"
    exit 1
}

# Validate LocalWP site
if (-not (Test-Path $pluginsDir)) {
    Write-Error "LocalWP plugins folder not found: $pluginsDir`nMake sure the site name matches exactly (case-sensitive)."
    exit 1
}

# Remove existing plugin (directory OR old symlink)
if (Test-Path $linkTarget) {
    $existing = Get-Item $linkTarget -Force
    if ($existing.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        Write-Host "Removing existing symlink..." -ForegroundColor Yellow
        $existing.Delete()
    } else {
        Write-Host "WARNING: A real directory already exists at $linkTarget" -ForegroundColor Yellow
        Write-Host "Rename or delete it manually first, then re-run this script." -ForegroundColor Yellow
        exit 1
    }
}

# Create a directory junction (no admin rights required on Windows)
try {
    $result = cmd /c mklink /J `"$linkTarget`" `"$pluginSource`" 2>&1
    if ($LASTEXITCODE -ne 0) { throw $result }
    Write-Host "[OK] Symlink created!" -ForegroundColor Green
    Write-Host ""
    Write-Host "HOW TO USE:" -ForegroundColor White
    Write-Host "  1. Make sure 'npm run dev' is running (http://localhost:3000)"
    Write-Host "  2. Open WordPress Admin > Scheduler > Settings"
    Write-Host "  3. Any change saved with Ctrl+S in VS Code is immediately live"
    Write-Host "  4. No zip, no reinstall needed during development"
    Write-Host ""
    Write-Host "NEXT STEP - Tell WordPress which URL to call:" -ForegroundColor White
    Write-Host ("  Edit: " + $siteFolder + "\app\public\wp-config.php")
    Write-Host "  Add BEFORE the 'That is all, stop editing!' line:"
    Write-Host ""
    Write-Host "    define('SCOREBAR_APP_BASE_URL', 'http://localhost:3000');" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  The plugin also accepts the newer SCHEDULE_APP_DOMAIN constant," -ForegroundColor DarkGray
    Write-Host "  but SCOREBAR_APP_BASE_URL is kept for the original local workflow." -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  If localhost fails from PHP (LocalWP routing varies), try:" -ForegroundColor Yellow
    Write-Host "    define('SCOREBAR_APP_BASE_URL', 'http://host.docker.internal:3000');" -ForegroundColor Yellow
    Write-Host ""
} catch {
    $errMsg = $_.Exception.Message
    Write-Error ("Failed to create symlink: " + $errMsg + "`n`nTry: Run as Administrator, OR enable Windows Developer Mode in Settings > For Developers.")
    exit 1
}
