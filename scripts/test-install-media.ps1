<#
.SYNOPSIS
  Validate Reclaim's install-media generator end-to-end by booting a fresh
  Hyper-V VM with the generated autounattend.xml + setupcomplete.cmd.

.DESCRIPTION
  Steps:
    1. Pack autounattend.xml + $OEM$\$$\Setup\Scripts\setupcomplete.cmd into
       a sidecar ISO via Windows ADK oscdimg.exe.
    2. Create a fresh Hyper-V Gen2 VM (Secure Boot ON, Microsoft Windows
       template) with the Win11 ISO + sidecar ISO attached.
    3. Boot. Setup runs unattended end-to-end: the Reclaim XML's
       <DiskConfiguration> wipes disk 0, partitions it, installs Windows 11,
       writes the OOBE-skip + sponsored-apps-blocker policies, creates the
       admin account, then setupcomplete.cmd does two AppX-removal passes.
    4. Wait for PowerShell Direct. Read the setupcomplete log + enumerate
       residual AppX packages to verify the bloatware purge worked.

.PARAMETER UnattendXml
  Path to autounattend.xml (default: test-output/install-media/autounattend.xml)
.PARAMETER SetupCompleteCmd
  Path to setupcomplete.cmd (default: test-output/install-media/setupcomplete.cmd)
.PARAMETER IsoPath
  Path to Win11 install ISO.
.PARAMETER VmName
  Default 'Reclaim-IM-Test' so we don't collide with the tweak-test VM.
#>
[CmdletBinding()]
param(
    [string]$UnattendXml = "E:\DEV\reclaim\test-output\install-media\autounattend.xml",
    [string]$SetupCompleteCmd = "E:\DEV\reclaim\test-output\install-media\setupcomplete.cmd",
    [Parameter(Mandatory)][string]$IsoPath,
    [string]$VmName = "Reclaim-IM-Test",
    [string]$AdminUser = "TestAdmin",
    [string]$AdminPassword = "Reclaim!Test1",
    [int]$MemoryGB = 8,
    [int]$DiskGB = 80,
    [switch]$Recreate,
    [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# preflight
if (-not (Test-Path $UnattendXml)) { throw "missing $UnattendXml -- run gen-unattend-config.mjs + reclaim --gen-install-media first" }
if (-not (Test-Path $SetupCompleteCmd)) { throw "missing $SetupCompleteCmd" }
if (-not (Test-Path $IsoPath -PathType Leaf)) { throw "missing $IsoPath" }
$adkBase = "${env:ProgramFiles(x86)}\Windows Kits\10\Assessment and Deployment Kit\Deployment Tools"
$oscdimg = $null
foreach ($arch in 'amd64','x86') {
    $c = Join-Path $adkBase "$arch\Oscdimg\oscdimg.exe"
    if (Test-Path $c) { $oscdimg = $c; break }
}
if (-not $oscdimg) { throw "oscdimg.exe not found in Windows ADK" }

$work = Join-Path $env:TEMP "reclaim-im-test"
Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $work -Force | Out-Null

Write-Host "[1/4] Packing sidecar ISO ..." -ForegroundColor Yellow

$staging = Join-Path $work "staging"
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Copy-Item $UnattendXml (Join-Path $staging "autounattend.xml") -Force

# $OEM$\$$\Setup\Scripts\ — Windows Setup auto-copies $OEM$\$$\<x> into %WINDIR%\<x>
# when <UseConfigurationSet>true</UseConfigurationSet> is set in the unattend.
$oemDir = Join-Path $staging '$OEM$\$$\Setup\Scripts'
New-Item -ItemType Directory -Path $oemDir -Force | Out-Null
Copy-Item $SetupCompleteCmd (Join-Path $oemDir "setupcomplete.cmd") -Force

$sidecarIso = Join-Path $work "reclaim-sidecar.iso"
& $oscdimg -n -m "-l$VmName-IM" $staging $sidecarIso | Out-Null
if ($LASTEXITCODE -ne 0) { throw "oscdimg failed (exit $LASTEXITCODE)" }
Write-Host ("[1/4] sidecar: $sidecarIso ({0} KB)" -f [math]::Round((Get-Item $sidecarIso).Length / 1KB, 1)) -ForegroundColor Green

# ── 2/4: VM ────────────────────────────────────────────────────────────────
Write-Host "`n[2/4] Provisioning VM '$VmName' ..." -ForegroundColor Yellow

$existing = Get-VM -Name $VmName -ErrorAction SilentlyContinue
if ($existing) {
    if ($Recreate) {
        if ($existing.State -ne 'Off') { Stop-VM -Name $VmName -TurnOff -Force }
        Remove-VM -Name $VmName -Force
        Write-Host "       removed previous VM" -ForegroundColor DarkGray
    } else {
        throw "VM '$VmName' already exists. Pass -Recreate to replace it."
    }
}

$vhdRoot = (Get-VMHost).VirtualHardDiskPath
$vhd = Join-Path $vhdRoot "$VmName.vhdx"
if (Test-Path $vhd) { Remove-Item $vhd -Force }
New-VHD -Path $vhd -SizeBytes ($DiskGB * 1GB) -Dynamic | Out-Null

New-VM -Name $VmName `
    -Generation 2 `
    -MemoryStartupBytes ($MemoryGB * 1GB) `
    -VHDPath $vhd `
    -SwitchName (Get-VMSwitch | Select-Object -First 1).Name | Out-Null

Set-VM -Name $VmName -ProcessorCount 2 `
    -CheckpointType Disabled `
    -AutomaticCheckpointsEnabled $false `
    -DynamicMemory `
    -MemoryMinimumBytes 2GB -MemoryMaximumBytes ($MemoryGB * 1GB)

Set-VMFirmware -VMName $VmName -EnableSecureBoot On -SecureBootTemplate "MicrosoftWindows"
Add-VMDvdDrive -VMName $VmName -Path $IsoPath
Add-VMDvdDrive -VMName $VmName -Path $sidecarIso
$winDvd = Get-VMDvdDrive -VMName $VmName | Where-Object { $_.Path -eq $IsoPath }
Set-VMFirmware -VMName $VmName -FirstBootDevice $winDvd

Write-Host "[2/4] VM created (SecureBoot On, $((Get-VMDvdDrive -VMName $VmName).Count) DVDs)" -ForegroundColor Green

# ── 3/4: boot + poll PSDirect ──────────────────────────────────────────────
Write-Host "`n[3/4] Booting + waiting for PowerShell Direct ..." -ForegroundColor Yellow
Write-Host "       Install + AppX purge ~15-25 min (extra time vs bare unattend)" -ForegroundColor DarkGray

Start-VM -Name $VmName
$cred = [pscredential]::new("$VmName\$AdminUser", (ConvertTo-SecureString $AdminPassword -AsPlainText -Force))
$deadline = (Get-Date).AddMinutes(35)
$ready = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 30
    try {
        $r = Invoke-Command -VMName $VmName -Credential $cred -ScriptBlock { $env:COMPUTERNAME } -ErrorAction Stop
        if ($r) {
            Write-Host "       PSDirect responded: COMPUTERNAME=$r" -ForegroundColor Green
            $ready = $true; break
        }
    } catch {
        $vmState = (Get-VM -Name $VmName).State
        Write-Host ("       still waiting (VM state: {0}, error: {1})" -f $vmState, $_.Exception.Message.Split([Environment]::NewLine)[0]) -ForegroundColor DarkGray
    }
}
if (-not $ready) { throw "PSDirect did not become available within 35 minutes" }

# ── 4/4: verify ────────────────────────────────────────────────────────────
if ($SkipVerify) {
    Write-Host "`n[4/4] Skipping verification (-SkipVerify)" -ForegroundColor DarkGray
    Write-Host "`nVM ready. Manually inspect with:" -ForegroundColor Cyan
    Write-Host "  Enter-PSSession -VMName $VmName -Credential `$cred"
    return
}

Write-Host "`n[4/4] Verifying bloatware purge ..." -ForegroundColor Yellow

$session = New-PSSession -VMName $VmName -Credential $cred
try {
    Write-Host "`n-- setupcomplete.log (head) --" -ForegroundColor Cyan
    $log = Invoke-Command -Session $session -ScriptBlock {
        $p = "C:\Windows\Setup\Scripts\setupcomplete.log"
        if (Test-Path $p) { Get-Content $p -TotalCount 40 } else { "(log not found at $p)" }
    }
    $log | ForEach-Object { Write-Host "  $_" }

    Write-Host "`n-- setupcomplete.log (tail, last 15) --" -ForegroundColor Cyan
    $tail = Invoke-Command -Session $session -ScriptBlock {
        $p = "C:\Windows\Setup\Scripts\setupcomplete.log"
        if (Test-Path $p) { Get-Content $p -Tail 15 } else { @() }
    }
    $tail | ForEach-Object { Write-Host "  $_" }

    Write-Host "`n-- Residual sponsored-apps probe --" -ForegroundColor Cyan
    $patterns = "whatsapp","spotify","disney","netflix","tiktok","instagram","facebook","linkedin","solitaire","candycrush","bingnews","getstarted","feedback","clipchamp","todos"
    foreach ($pat in $patterns) {
        $hits = Invoke-Command -Session $session -ArgumentList $pat -ScriptBlock {
            param($p)
            Get-AppxPackage -AllUsers | Where-Object Name -Match $p | Select-Object -ExpandProperty Name
        }
        $verdict = if ($hits) { "PRESENT: $($hits -join ', ')" } else { "absent" }
        $color = if ($hits) { "Red" } else { "Green" }
        Write-Host ("  {0,-15} {1}" -f $pat, $verdict) -ForegroundColor $color
    }

    Write-Host "`n-- Total AppX count (lower is better) --" -ForegroundColor Cyan
    $count = Invoke-Command -Session $session -ScriptBlock {
        @{
            AllUsers     = (Get-AppxPackage -AllUsers).Count
            Provisioned  = (Get-AppxProvisionedPackage -Online).Count
        }
    }
    Write-Host ("  Get-AppxPackage -AllUsers   : {0}" -f $count.AllUsers)
    Write-Host ("  Get-AppxProvisionedPackage  : {0}" -f $count.Provisioned)

} finally {
    Remove-PSSession $session
}

Write-Host "`n[done] Install-media e2e test complete." -ForegroundColor Green
