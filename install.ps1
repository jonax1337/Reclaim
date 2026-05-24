<#
.SYNOPSIS
    Reclaim Your Windows — one-line installer / portable runner.

.DESCRIPTION
    Downloads the latest GitHub release and either installs it or runs the
    portable build. Bypasses Edge's "publisher unknown" download prompt
    because the .exe arrives via PowerShell, not via the browser.

.EXAMPLE
    irm "https://github.com/jonax1337/reclaim/raw/main/install.ps1" | iex

.EXAMPLE
    # Non-interactive — pick the mode up front:
    $env:RECLAIM_MODE = 'portable'; irm "https://github.com/jonax1337/reclaim/raw/main/install.ps1" | iex

    # Valid RECLAIM_MODE values: install | portable | msi
.LINK
    https://github.com/jonax1337/reclaim
#>

$ErrorActionPreference = 'Stop'
# IWR's default progress bar repaints constantly and slows downloads ~10×.
$ProgressPreference = 'SilentlyContinue'

# Cross-platform sanity: $IsLinux/$IsMacOS exist on PS 7+; on Windows PS 5.1
# they're undefined (= $null, falsy) so this short-circuits to Windows.
if ($IsLinux -or $IsMacOS) {
    Write-Host "Reclaim is Windows-only." -ForegroundColor Red
    return
}

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Step($msg, $color = 'White') {
    Write-Host "  $msg" -ForegroundColor $color
}

function Write-Header {
    Write-Host ""
    Write-Host "  +-----------------------------------------+" -ForegroundColor Cyan
    Write-Host "  |  Reclaim Your Windows                   |" -ForegroundColor Cyan
    Write-Host "  |  Installer                              |" -ForegroundColor Cyan
    Write-Host "  +-----------------------------------------+" -ForegroundColor Cyan
    Write-Host ""
}

function Get-InstalledReclaim {
    try {
        Get-ItemProperty `
            'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', `
            'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' `
            -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like 'Reclaim*' } |
            Select-Object -First 1
    } catch { $null }
}

# ── Main ─────────────────────────────────────────────────────────────────────

Write-Header

$installed = Get-InstalledReclaim
if ($installed) {
    Write-Step "Existing install: $($installed.DisplayName) v$($installed.DisplayVersion)" 'DarkYellow'
}

Write-Step "Fetching latest release from GitHub..." 'White'
try {
    $release = Invoke-RestMethod `
        -Uri 'https://api.github.com/repos/jonax1337/reclaim/releases/latest' `
        -Headers @{ 'User-Agent' = 'Reclaim-Installer' }
} catch {
    Write-Step "ERROR: GitHub API unreachable: $($_.Exception.Message)" 'Red'
    return
}

$version = $release.tag_name -replace '^v', ''
Write-Step "Latest version: v$version" 'Green'

if ($installed -and $installed.DisplayVersion -eq $version) {
    Write-Host ""
    Write-Step "You already have v$version installed." 'Green'
    Write-Step "Continue to reinstall / switch to portable, or Ctrl+C to cancel." 'DarkGray'
}
Write-Host ""

# Match assets by filename. Each release exposes a setup .exe, a portable
# .exe, an MSI, and matching .sig sidecars — we want the real binaries only.
$nsis     = $release.assets | Where-Object { $_.name -like '*setup.exe' }     | Select-Object -First 1
$portable = $release.assets | Where-Object { $_.name -like '*Portable*.exe' } | Select-Object -First 1
$msi      = $release.assets | Where-Object { $_.name -like '*.msi' -and $_.name -notlike '*.sig' } | Select-Object -First 1

if (-not ($nsis -or $portable -or $msi)) {
    Write-Step "ERROR: No installable assets found in release v$version." 'Red'
    return
}

# Pick mode — env override wins, otherwise interactive menu.
$mode  = $env:RECLAIM_MODE
$asset = $null

if ($mode) {
    $asset = switch ($mode.ToLower()) {
        'install'  { $nsis }
        'portable' { $portable }
        'msi'      { $msi }
        default    { $null }
    }
    if (-not $asset) {
        Write-Step "ERROR: RECLAIM_MODE='$mode' has no matching asset in v$version." 'Red'
        return
    }
    $mode = $mode.ToLower()
    Write-Step "Mode (from RECLAIM_MODE): $mode" 'DarkGray'
} else {
    $options = @()
    if ($nsis)     { $options += [pscustomobject]@{ Key='1'; Label='Installer (NSIS, recommended)';      Asset=$nsis;     Mode='install'  } }
    if ($portable) { $options += [pscustomobject]@{ Key='2'; Label='Portable (single .exe, no install)'; Asset=$portable; Mode='portable' } }
    if ($msi)      { $options += [pscustomobject]@{ Key='3'; Label='MSI (managed deployment)';            Asset=$msi;      Mode='msi'      } }

    Write-Step "Choose how to install Reclaim v$($version):" 'White'
    Write-Host ""
    foreach ($opt in $options) {
        $sizeMb = [Math]::Round($opt.Asset.size / 1MB, 1)
        Write-Host "    [$($opt.Key)]  $($opt.Label)  ($sizeMb MB)"
    }
    Write-Host  "    [q]  Cancel"
    Write-Host  ""

    do {
        $choice = Read-Host '  Your choice'
        if ($choice -in 'q', 'Q') {
            Write-Step 'Cancelled.' 'Yellow'
            return
        }
        $selected = $options | Where-Object { $_.Key -eq $choice } | Select-Object -First 1
        if (-not $selected) {
            Write-Step "Unknown option '$choice'." 'Red'
        }
    } while (-not $selected)
    $mode  = $selected.Mode
    $asset = $selected.Asset
}

# Download to temp.
$dest = Join-Path $env:TEMP $asset.name
$sizeMb = [Math]::Round($asset.size / 1MB, 1)
Write-Host ""
Write-Step "Downloading $($asset.name) ($sizeMb MB)..." 'White'
try {
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $dest -UseBasicParsing
} catch {
    Write-Step "ERROR: Download failed: $($_.Exception.Message)" 'Red'
    return
}

# Strip Mark-of-the-Web so Windows doesn't second-guess what we just chose to
# run. The whole point of the irm|iex flow is that the user is consciously
# trusting this script — propagating MOTW would re-introduce the SmartScreen
# prompt we're trying to avoid.
try { Unblock-File -Path $dest -ErrorAction SilentlyContinue } catch {}

Write-Step "Downloaded -> $dest" 'Green'
Write-Host ""

switch ($mode) {
    'install' {
        Write-Step "Starting installer (UAC prompt incoming)..." 'White'
        try {
            Start-Process -FilePath $dest -Verb RunAs -Wait
            Write-Host ""
            Write-Step "Done. Reclaim is in your Start menu." 'Green'
        } catch {
            Write-Step "Installer cancelled or failed: $($_.Exception.Message)" 'Yellow'
        }
    }
    'msi' {
        Write-Step "Starting MSI installer (UAC prompt incoming)..." 'White'
        try {
            Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i', "`"$dest`"" -Verb RunAs -Wait
            Write-Host ""
            Write-Step "Done. Reclaim is in your Start menu." 'Green'
        } catch {
            Write-Step "Installer cancelled or failed: $($_.Exception.Message)" 'Yellow'
        }
    }
    'portable' {
        # Park the binary somewhere stable so it survives %TEMP% cleanup.
        $userHome = [Environment]::GetFolderPath('UserProfile')
        $dir = Join-Path $userHome 'Reclaim'
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
        $final = Join-Path $dir $asset.name
        Move-Item -Force -Path $dest -Destination $final
        Write-Step "Portable binary placed at: $final" 'Green'
        Write-Host ""

        $launch = Read-Host '  Launch Reclaim now? [Y/n]'
        if ($launch -notin 'n', 'N') {
            Start-Process -FilePath $final
            Write-Step "Launched." 'Green'
        } else {
            Write-Step "Run it later with: $final" 'DarkGray'
        }
    }
}

Write-Host ""
