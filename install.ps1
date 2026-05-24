<#
.SYNOPSIS
    Reclaim Your Windows — one-line installer / portable runner.

.DESCRIPTION
    Downloads the latest GitHub release and either installs it or runs the
    portable build. Bypasses Edge's "publisher unknown" download prompt
    because the .exe arrives via PowerShell, not via the browser.

    Env-var overrides (all optional, all string '1' / mode-name to opt in):
      $env:RECLAIM_MODE      install | portable | msi   Skip the interactive picker.
      $env:RECLAIM_SILENT    '1'                        Run the installer silently — no NSIS wizard,
                                                        no MSI UI. Terminal output only. Honored for
                                                        the 'install' and 'msi' modes.
      $env:RECLAIM_FORCE     '1'                        Reinstall even if the latest version is already
                                                        installed. Without this, the script exits cleanly
                                                        when the installed version matches the release.
      $env:RECLAIM_NO_LAUNCH '1'                        After a portable download, don't auto-launch.

.EXAMPLE
    irm "https://github.com/jonax1337/reclaim/raw/main/install.ps1" | iex

.EXAMPLE
    # Non-interactive, silent install — useful for autounattend.xml /
    # FirstLogonCommands or scripted provisioning:
    $env:RECLAIM_MODE='install'; $env:RECLAIM_SILENT='1'; irm "https://github.com/jonax1337/reclaim/raw/main/install.ps1" | iex

.LINK
    https://github.com/jonax1337/reclaim
#>

$ErrorActionPreference = 'Stop'
# IWR's default progress bar repaints constantly and slows downloads ~10×.
# We render our own (see Invoke-Download) below.
$ProgressPreference = 'SilentlyContinue'

# Cross-platform sanity: $IsLinux/$IsMacOS exist on PS 7+; on Windows PS 5.1
# they're undefined (= $null, falsy) so this short-circuits to Windows.
if ($IsLinux -or $IsMacOS) {
    Write-Host "Reclaim is Windows-only." -ForegroundColor Red
    return
}

$IsSilent  = $env:RECLAIM_SILENT -eq '1'
$IsForce   = $env:RECLAIM_FORCE  -eq '1'
$NoLaunch  = $env:RECLAIM_NO_LAUNCH -eq '1'

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
            'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', `
            'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' `
            -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like 'Reclaim*' } |
            Select-Object -First 1
    } catch { $null }
}

function Format-Bytes($n) {
    if ($null -eq $n -or $n -le 0) { return '? MB' }
    return ('{0:N1} MB' -f ($n / 1MB))
}

# Stream a download to disk with a real progress bar — character-only so it
# works in plain cmd.exe, conhost, and Windows Terminal alike. Buffered every
# ~120 ms so it doesn't melt the terminal on fast connections.
function Invoke-Download {
    param(
        [Parameter(Mandatory)] [string] $Url,
        [Parameter(Mandatory)] [string] $OutFile,
        [string] $Label = 'Downloading'
    )

    Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue

    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
    $client  = New-Object System.Net.Http.HttpClient($handler)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('Reclaim-Installer') | Out-Null
    $client.Timeout = [TimeSpan]::FromMinutes(10)

    try {
        $resp = $client.GetAsync($Url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        if (-not $resp.IsSuccessStatusCode) {
            throw "HTTP $([int]$resp.StatusCode) $($resp.ReasonPhrase)"
        }
        $total      = $resp.Content.Headers.ContentLength
        $stream     = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $fs         = [System.IO.File]::Create($OutFile)
        $buffer     = New-Object byte[] 131072
        $totalRead  = [long]0
        $lastTick   = 0
        $started    = [Environment]::TickCount
        $barWidth   = 28

        try {
            while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $fs.Write($buffer, 0, $read)
                $totalRead += $read
                $now = [Environment]::TickCount
                if ($now - $lastTick -gt 120) {
                    $lastTick = $now
                    $elapsed  = [Math]::Max(1, ($now - $started) / 1000)
                    $speedMb  = ($totalRead / 1MB) / $elapsed
                    if ($total) {
                        $pct  = [Math]::Min(100, [Math]::Round(($totalRead / $total) * 100))
                        $fill = [Math]::Floor($barWidth * ($pct / 100))
                        $bar  = ('=' * $fill) + (' ' * ($barWidth - $fill))
                        $line = "  $Label  [{0}] {1,3}%  {2} / {3}  @ {4:N1} MB/s   " -f `
                            $bar, $pct, (Format-Bytes $totalRead), (Format-Bytes $total), $speedMb
                    } else {
                        $line = "  $Label  {0} downloaded @ {1:N1} MB/s   " -f (Format-Bytes $totalRead), $speedMb
                    }
                    Write-Host "`r$line" -NoNewline
                }
            }
            # Final 100% line + newline so subsequent output isn't on the same row.
            if ($total) {
                $bar  = '=' * $barWidth
                $line = "  $Label  [{0}] 100%  {1} / {1}                  " -f $bar, (Format-Bytes $total)
            } else {
                $line = "  $Label  {0} downloaded                       " -f (Format-Bytes $totalRead)
            }
            Write-Host "`r$line"
        } finally {
            $fs.Dispose()
            $stream.Dispose()
        }
    } finally {
        $client.Dispose()
        $handler.Dispose()
    }
}

# Tail the live "Reclaim*" uninstall registry entry, so the silent installer
# (NSIS /S) gives the user a visible "Installing..." beat instead of dead air.
# Spinner advances every ~250 ms while the installer process is alive.
function Wait-ForInstaller {
    param([System.Diagnostics.Process] $Proc, [string] $Label)
    $spin = @('|', '/', '-', [char]92)
    $i = 0
    while (-not $Proc.HasExited) {
        $sym = $spin[$i % $spin.Count]
        Write-Host "`r  $Label $sym" -NoNewline -ForegroundColor White
        Start-Sleep -Milliseconds 250
        $i++
    }
    # Clear the spinner line.
    Write-Host "`r$(' ' * (4 + $Label.Length + 2))" -NoNewline
    Write-Host "`r" -NoNewline
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

# Same-version short-circuit. Opt-out via $env:RECLAIM_FORCE='1'.
if ($installed -and $installed.DisplayVersion -eq $version -and -not $IsForce) {
    Write-Host ""
    Write-Step "Reclaim v$version is already installed - nothing to do." 'Green'
    if ($installed.InstallLocation) {
        Write-Step "Install location: $($installed.InstallLocation)" 'DarkGray'
    }
    Write-Step "Set `$env:RECLAIM_FORCE='1' and re-run to reinstall." 'DarkGray'
    Write-Host ""
    return
}

if ($installed -and $installed.DisplayVersion -eq $version -and $IsForce) {
    Write-Step "RECLAIM_FORCE=1 - proceeding with reinstall of v$version." 'DarkYellow'
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
    $modeLabel = if ($IsSilent) { "$mode (silent)" } else { $mode }
    Write-Step "Mode (from RECLAIM_MODE): $modeLabel" 'DarkGray'
} else {
    if ($IsSilent) {
        Write-Step "ERROR: RECLAIM_SILENT=1 requires RECLAIM_MODE (install | msi)." 'Red'
        return
    }
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

# 'portable' has no installer to silence — friendly message rather than fail.
if ($IsSilent -and $mode -eq 'portable') {
    Write-Step "RECLAIM_SILENT is ignored for portable mode (no installer to silence)." 'DarkGray'
}

# Download to temp with progress bar.
$dest = Join-Path $env:TEMP $asset.name
Write-Host ""
try {
    Invoke-Download -Url $asset.browser_download_url -OutFile $dest -Label "Downloading $($asset.name)"
} catch {
    Write-Step "ERROR: Download failed: $($_.Exception.Message)" 'Red'
    return
}

# Strip Mark-of-the-Web so Windows doesn't second-guess what we just chose to
# run. The whole point of the irm|iex flow is that the user is consciously
# trusting this script — propagating MOTW would re-introduce the SmartScreen
# prompt we're trying to avoid.
try { Unblock-File -Path $dest -ErrorAction SilentlyContinue } catch {}

Write-Step "Saved -> $dest" 'Green'
Write-Host ""

switch ($mode) {
    'install' {
        if ($IsSilent) {
            # NSIS supports /S for fully silent install. UAC still triggers if
            # the elevation hasn't been granted yet — that's by design.
            Write-Step "Running NSIS installer silently (UAC prompt incoming)..." 'White'
            try {
                $proc = Start-Process -FilePath $dest -ArgumentList '/S' -Verb RunAs -PassThru -WindowStyle Hidden
                Wait-ForInstaller -Proc $proc -Label "Installing Reclaim v$version"
                if ($proc.ExitCode -ne 0) {
                    Write-Step "Installer exited with code $($proc.ExitCode)." 'Yellow'
                } else {
                    $post = Get-InstalledReclaim
                    if ($post -and $post.DisplayVersion -eq $version) {
                        Write-Step "Installed Reclaim v$version." 'Green'
                        if ($post.InstallLocation) {
                            Write-Step "Location: $($post.InstallLocation)" 'DarkGray'
                        }
                    } else {
                        Write-Step "Installer finished, but uninstall key wasn't updated yet." 'DarkYellow'
                    }
                }
            } catch {
                Write-Step "Installer cancelled or failed: $($_.Exception.Message)" 'Yellow'
            }
        } else {
            Write-Step "Starting installer (UAC prompt incoming)..." 'White'
            try {
                Start-Process -FilePath $dest -Verb RunAs -Wait
                Write-Host ""
                Write-Step "Done. Reclaim is in your Start menu." 'Green'
            } catch {
                Write-Step "Installer cancelled or failed: $($_.Exception.Message)" 'Yellow'
            }
        }
    }
    'msi' {
        if ($IsSilent) {
            Write-Step "Running MSI installer silently (UAC prompt incoming)..." 'White'
            try {
                $proc = Start-Process -FilePath 'msiexec.exe' `
                    -ArgumentList '/i', "`"$dest`"", '/qn', '/norestart' `
                    -Verb RunAs -PassThru
                Wait-ForInstaller -Proc $proc -Label "Installing Reclaim v$version"
                if ($proc.ExitCode -ne 0) {
                    Write-Step "msiexec exited with code $($proc.ExitCode)." 'Yellow'
                } else {
                    Write-Step "Installed Reclaim v$version (MSI)." 'Green'
                }
            } catch {
                Write-Step "Installer cancelled or failed: $($_.Exception.Message)" 'Yellow'
            }
        } else {
            Write-Step "Starting MSI installer (UAC prompt incoming)..." 'White'
            try {
                Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i', "`"$dest`"" -Verb RunAs -Wait
                Write-Host ""
                Write-Step "Done. Reclaim is in your Start menu." 'Green'
            } catch {
                Write-Step "Installer cancelled or failed: $($_.Exception.Message)" 'Yellow'
            }
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

        if ($NoLaunch) {
            Write-Step "RECLAIM_NO_LAUNCH=1 - skipping launch. Run later with: $final" 'DarkGray'
        } else {
            $shouldLaunch = $true
            if (-not $IsSilent -and -not $env:RECLAIM_MODE) {
                $launch = Read-Host '  Launch Reclaim now? [Y/n]'
                $shouldLaunch = ($launch -notin 'n', 'N')
            }
            if ($shouldLaunch) {
                Start-Process -FilePath $final
                Write-Step "Launched." 'Green'
            } else {
                Write-Step "Run it later with: $final" 'DarkGray'
            }
        }
    }
}

Write-Host ""
