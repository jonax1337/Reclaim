<#
.SYNOPSIS
  Build Reclaim CLI + provision a Hyper-V test VM that boots a clean Win11
  install ready for PowerShell Direct, with reclaim.exe pre-staged.

.DESCRIPTION
  End-to-end harness setup for the v1.0.0 catalog roundtrip tests.

  Steps:
    1. (unless -SkipBuild) Builds the Tauri release binary via `pnpm tauri build`.
    2. Generates a bare-bones autounattend.xml that creates a local admin and
       skips OOBE, then packs it into a sidecar autounattend.iso via the
       Windows ADK oscdimg.exe.
    3. Creates a Generation-2 Hyper-V VM with the requested CPU/RAM/disk,
       attaches the Win11 ISO + the sidecar ISO, boots it.
    4. Polls for PowerShell Direct availability (Invoke-Command -VMName) until
       the guest accepts the credential.
    5. Copies the built reclaim.exe into the guest at C:\Reclaim\.

  WHY bare-bones autounattend instead of Reclaim's own Install-Media generator
  (the "Dogfooding" option): testing tweaks IS the goal; the unattend generator
  is a separate thing that should be validated separately. Mixing them means
  a generator regression would mask a tweak regression and vice versa. To
  validate the unattend generator, build an ISO from the GUI (Install Media
  -> Fully Automated template) and boot a second VM from it.

.PARAMETER IsoPath
  Absolute path to the Win11 install ISO (DE or EN, 24H2/25H2).

.PARAMETER VmName
  Hyper-V VM name. Default: "Reclaim-Test".

.PARAMETER MemoryGB
  Startup RAM in GiB. Default: 8.

.PARAMETER DiskGB
  Dynamic VHDX max size in GiB. Default: 80.

.PARAMETER AdminUser
  Local administrator username created by the unattend. Default: "TestAdmin".

.PARAMETER AdminPassword
  Plain-text local admin password. Default: "Reclaim!Test1".
  Note: written into the unattend (and stored in the sidecar ISO) in plain
  text -- this is a throwaway test VM, do not reuse real credentials.

.PARAMETER VhdRoot
  Directory for the new .vhdx. Default: same dir Hyper-V uses by default.

.PARAMETER SkipBuild
  Skip `pnpm tauri build`. Use when iterating on the harness itself.

.PARAMETER Recreate
  If the VM already exists, stop + remove it (keeps the .vhdx unless also
  -RecreateDisk is given).

.PARAMETER RecreateDisk
  Delete and recreate the .vhdx (implies -Recreate).

.EXAMPLE
  # First run, fresh VM:
  .\scripts\setup-test-vm.ps1 -IsoPath "D:\Downloads\Win11_25H2_German_x64_v2.iso"

.EXAMPLE
  # Re-stage reclaim.exe into existing VM without rebuilding:
  .\scripts\setup-test-vm.ps1 -IsoPath "D:\Downloads\Win11_25H2_German_x64_v2.iso" -SkipBuild

.NOTES
  Run from an elevated PowerShell 5.1 or 7+ session. PowerShell Direct
  (Invoke-Command -VMName) requires the host process to be elevated.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$IsoPath,

    [string]$VmName = "Reclaim-Test",
    [ValidateRange(2, 64)]
    [int]$MemoryGB = 8,
    [ValidateRange(40, 500)]
    [int]$DiskGB = 80,
    [string]$AdminUser = "TestAdmin",
    [string]$AdminPassword = "Reclaim!Test1",
    [string]$VhdRoot,
    [switch]$SkipBuild,
    [switch]$Recreate,
    [switch]$RecreateDisk
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ------------------------------------------------------------------------- #
# 0. preflight                                                              #
# ------------------------------------------------------------------------- #

function Assert-Elevated {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $isAdmin = (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        throw "Setup needs an elevated PowerShell session (PowerShell Direct requires it)."
    }
}

function Assert-HyperV {
    if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) {
        throw @"
Hyper-V PowerShell module is not available. Enable Hyper-V first:
  Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All
then reboot.
"@
    }
}

function Get-OscdimgPath {
    $adkBase = "$env:ProgramFiles (x86)\Windows Kits\10\Assessment and Deployment Kit\Deployment Tools"
    foreach ($arch in @("amd64", "x86")) {
        $candidate = Join-Path $adkBase "$arch\Oscdimg\oscdimg.exe"
        if (Test-Path $candidate) { return $candidate }
    }
    throw "oscdimg.exe not found in Windows ADK. Install the ADK Deployment Tools first."
}

Assert-Elevated
Assert-HyperV
$oscdimg = Get-OscdimgPath

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$buildDir = Join-Path $repoRoot "src-tauri\target\release"
$reclaimExe = Join-Path $buildDir "reclaim.exe"
$work = Join-Path $env:TEMP "reclaim-test-vm"
New-Item -ItemType Directory -Path $work -Force | Out-Null

Write-Host "[setup] repo:    $repoRoot" -ForegroundColor Cyan
Write-Host "[setup] vm:      $VmName ($MemoryGB GB / $DiskGB GB)" -ForegroundColor Cyan
Write-Host "[setup] iso:     $IsoPath" -ForegroundColor Cyan
Write-Host "[setup] work:    $work" -ForegroundColor Cyan
Write-Host "[setup] oscdimg: $oscdimg" -ForegroundColor Cyan

# ------------------------------------------------------------------------- #
# 1. build reclaim.exe (release)                                            #
# ------------------------------------------------------------------------- #

if (-not $SkipBuild) {
    Write-Host "`n[1/5] Building reclaim.exe via pnpm tauri build ..." -ForegroundColor Yellow
    Push-Location $repoRoot
    try {
        pnpm tauri build --no-bundle
        if ($LASTEXITCODE -ne 0) { throw "pnpm tauri build failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}
if (-not (Test-Path $reclaimExe)) {
    throw "Build did not produce $reclaimExe -- pass -SkipBuild only after a successful build."
}
Write-Host "[1/5] reclaim.exe ready: $reclaimExe ($([math]::Round((Get-Item $reclaimExe).Length / 1MB, 1)) MB)" -ForegroundColor Green

# ------------------------------------------------------------------------- #
# 2. generate bare-bones autounattend.xml + pack into sidecar ISO           #
# ------------------------------------------------------------------------- #

Write-Host "`n[2/5] Generating autounattend sidecar ISO ..." -ForegroundColor Yellow

# Win11 25H2 Pro generic install key (publicly documented by Microsoft as the
# "Pro" KMS Client Setup Key -- used to bypass the "Which edition" prompt
# during unattended setup; activation status is irrelevant for a throwaway VM).
$proKey = "W269N-WFGWX-YVC9B-4J6C9-T83GX"

$unattendXml = @"
<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend">
  <settings pass="windowsPE">
    <component name="Microsoft-Windows-International-Core-WinPE" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
      <SetupUILanguage><UILanguage>en-US</UILanguage></SetupUILanguage>
      <InputLocale>0407:00000407</InputLocale>
      <SystemLocale>de-DE</SystemLocale>
      <UILanguage>en-US</UILanguage>
      <UserLocale>de-DE</UserLocale>
    </component>
    <component name="Microsoft-Windows-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
      <UserData>
        <ProductKey>
          <Key>$proKey</Key>
          <WillShowUI>OnError</WillShowUI>
        </ProductKey>
        <AcceptEula>true</AcceptEula>
      </UserData>
      <DiskConfiguration>
        <Disk wcm:action="add">
          <DiskID>0</DiskID>
          <WillWipeDisk>true</WillWipeDisk>
          <CreatePartitions>
            <CreatePartition wcm:action="add"><Order>1</Order><Type>EFI</Type><Size>300</Size></CreatePartition>
            <CreatePartition wcm:action="add"><Order>2</Order><Type>MSR</Type><Size>16</Size></CreatePartition>
            <CreatePartition wcm:action="add"><Order>3</Order><Type>Primary</Type><Extend>true</Extend></CreatePartition>
          </CreatePartitions>
          <ModifyPartitions>
            <ModifyPartition wcm:action="add"><Order>1</Order><PartitionID>1</PartitionID><Label>System</Label><Format>FAT32</Format></ModifyPartition>
            <ModifyPartition wcm:action="add"><Order>2</Order><PartitionID>2</PartitionID></ModifyPartition>
            <ModifyPartition wcm:action="add"><Order>3</Order><PartitionID>3</PartitionID><Label>Windows</Label><Format>NTFS</Format></ModifyPartition>
          </ModifyPartitions>
        </Disk>
      </DiskConfiguration>
      <ImageInstall>
        <OSImage>
          <InstallTo><DiskID>0</DiskID><PartitionID>3</PartitionID></InstallTo>
          <InstallFrom>
            <MetaData wcm:action="add"><Key>/IMAGE/NAME</Key><Value>Windows 11 Pro</Value></MetaData>
          </InstallFrom>
        </OSImage>
      </ImageInstall>
      <RunSynchronous>
        <RunSynchronousCommand wcm:action="add">
          <Order>1</Order>
          <Path>reg add HKLM\SYSTEM\Setup\LabConfig /v BypassTPMCheck    /t REG_DWORD /d 1 /f</Path>
        </RunSynchronousCommand>
        <RunSynchronousCommand wcm:action="add">
          <Order>2</Order>
          <Path>reg add HKLM\SYSTEM\Setup\LabConfig /v BypassSecureBootCheck /t REG_DWORD /d 1 /f</Path>
        </RunSynchronousCommand>
        <RunSynchronousCommand wcm:action="add">
          <Order>3</Order>
          <Path>reg add HKLM\SYSTEM\Setup\LabConfig /v BypassRAMCheck    /t REG_DWORD /d 1 /f</Path>
        </RunSynchronousCommand>
      </RunSynchronous>
    </component>
  </settings>

  <settings pass="specialize">
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
      <ComputerName>RECLAIM-TEST</ComputerName>
      <TimeZone>W. Europe Standard Time</TimeZone>
    </component>
  </settings>

  <settings pass="oobeSystem">
    <component name="Microsoft-Windows-International-Core" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
      <InputLocale>0407:00000407</InputLocale>
      <SystemLocale>de-DE</SystemLocale>
      <UILanguage>en-US</UILanguage>
      <UserLocale>de-DE</UserLocale>
    </component>
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
      <OOBE>
        <HideEULAPage>true</HideEULAPage>
        <HideOEMRegistrationScreen>true</HideOEMRegistrationScreen>
        <HideOnlineAccountScreens>true</HideOnlineAccountScreens>
        <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE>
        <NetworkLocation>Work</NetworkLocation>
        <ProtectYourPC>3</ProtectYourPC>
      </OOBE>
      <UserAccounts>
        <LocalAccounts>
          <LocalAccount wcm:action="add">
            <Name>$AdminUser</Name>
            <Group>Administrators</Group>
            <DisplayName>$AdminUser</DisplayName>
            <Password><Value>$AdminPassword</Value><PlainText>true</PlainText></Password>
          </LocalAccount>
        </LocalAccounts>
      </UserAccounts>
      <AutoLogon>
        <Username>$AdminUser</Username>
        <Enabled>true</Enabled>
        <LogonCount>3</LogonCount>
        <Password><Value>$AdminPassword</Value><PlainText>true</PlainText></Password>
      </AutoLogon>
      <FirstLogonCommands>
        <SynchronousCommand wcm:action="add">
          <Order>1</Order>
          <CommandLine>powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy -Scope LocalMachine Bypass -Force; Enable-PSRemoting -Force; Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False"</CommandLine>
          <Description>Enable PS remoting + drop firewall (lab VM only)</Description>
        </SynchronousCommand>
      </FirstLogonCommands>
    </component>
  </settings>
</unattend>
"@

$unattendDir = Join-Path $work "unattend"
New-Item -ItemType Directory -Path $unattendDir -Force | Out-Null
$unattendXmlPath = Join-Path $unattendDir "autounattend.xml"
[System.IO.File]::WriteAllText($unattendXmlPath, $unattendXml, [System.Text.Encoding]::UTF8)

$sidecarIso = Join-Path $work "autounattend.iso"
if (Test-Path $sidecarIso) { Remove-Item $sidecarIso -Force }
& $oscdimg -n -m "-l$VmName-UA" $unattendDir $sidecarIso | Out-Null
if ($LASTEXITCODE -ne 0) { throw "oscdimg failed (exit $LASTEXITCODE)" }
Write-Host "[2/5] sidecar ISO: $sidecarIso ($((Get-Item $sidecarIso).Length) bytes)" -ForegroundColor Green

# ------------------------------------------------------------------------- #
# 3. Hyper-V VM                                                             #
# ------------------------------------------------------------------------- #

Write-Host "`n[3/5] Provisioning Hyper-V VM ..." -ForegroundColor Yellow

$existing = Get-VM -Name $VmName -ErrorAction SilentlyContinue
if ($existing) {
    if ($Recreate -or $RecreateDisk) {
        if ($existing.State -ne "Off") {
            Stop-VM -Name $VmName -TurnOff -Force
            (Get-VM -Name $VmName).State | Out-Null
        }
        Remove-VM -Name $VmName -Force
        Write-Host "       removed previous VM" -ForegroundColor DarkGray
    } else {
        throw "VM '$VmName' already exists. Use -Recreate (keeps disk) or -RecreateDisk (wipes too)."
    }
}

if (-not $VhdRoot) {
    $VhdRoot = (Get-VMHost).VirtualHardDiskPath
}
if (-not (Test-Path $VhdRoot)) { New-Item -ItemType Directory -Path $VhdRoot -Force | Out-Null }
$vhd = Join-Path $VhdRoot "$VmName.vhdx"

if ($RecreateDisk -and (Test-Path $vhd)) {
    Remove-Item $vhd -Force
}
if (-not (Test-Path $vhd)) {
    New-VHD -Path $vhd -SizeBytes ($DiskGB * 1GB) -Dynamic | Out-Null
}

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

# Generation 2 boots UEFI. Secure Boot must be ON with the MicrosoftWindows
# template so bootmgfw.efi from the install ISO can run -- with SB off the
# Win11 boot manager bails out even before Setup starts. The LabConfig
# BypassTPM/BypassSecureBoot reg writes in windowsPE handle the *Setup*-stage
# TPM/SB checks; they do not (and cannot) affect firmware-level boot signing.
Set-VMFirmware -VMName $VmName -EnableSecureBoot On -SecureBootTemplate "MicrosoftWindows"

Add-VMDvdDrive -VMName $VmName -Path $IsoPath
Add-VMDvdDrive -VMName $VmName -Path $sidecarIso

# Boot order: install ISO first, then HDD.
$dvd = Get-VMDvdDrive -VMName $VmName | Where-Object { $_.Path -eq $IsoPath }
Set-VMFirmware -VMName $VmName -FirstBootDevice $dvd

Write-Host "[3/5] VM created with $((Get-VMDvdDrive -VMName $VmName).Count) DVDs attached" -ForegroundColor Green

# ------------------------------------------------------------------------- #
# 4. start + poll PSDirect                                                  #
# ------------------------------------------------------------------------- #

Write-Host "`n[4/5] Starting VM + waiting for PowerShell Direct ..." -ForegroundColor Yellow
Write-Host "       (Win11 unattended install typically takes 8-15 minutes)" -ForegroundColor DarkGray

Start-VM -Name $VmName

$securePw = ConvertTo-SecureString $AdminPassword -AsPlainText -Force
$cred = New-Object PSCredential ("$VmName\$AdminUser", $securePw)

$deadline = (Get-Date).AddMinutes(25)
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
        Write-Host ("       still waiting (VM state: {0}, last error: {1})" -f $vmState, $_.Exception.Message.Split([Environment]::NewLine)[0]) -ForegroundColor DarkGray
    }
}

if (-not $ready) { throw "PSDirect did not become available within 25 minutes -- check the VM console." }
Write-Host "[4/5] PSDirect ready" -ForegroundColor Green

# ------------------------------------------------------------------------- #
# 5. stage reclaim.exe inside the VM                                        #
# ------------------------------------------------------------------------- #

Write-Host "`n[5/5] Staging reclaim.exe inside the VM ..." -ForegroundColor Yellow

$session = New-PSSession -VMName $VmName -Credential $cred
try {
    Invoke-Command -Session $session -ScriptBlock {
        New-Item -ItemType Directory -Path "C:\Reclaim" -Force | Out-Null
    }
    Copy-Item -ToSession $session -Path $reclaimExe -Destination "C:\Reclaim\reclaim.exe" -Force
    $remoteHash = Invoke-Command -Session $session -ScriptBlock {
        (Get-FileHash "C:\Reclaim\reclaim.exe" -Algorithm SHA256).Hash
    }
    $localHash = (Get-FileHash $reclaimExe -Algorithm SHA256).Hash
    if ($remoteHash -ne $localHash) {
        throw "Hash mismatch after copy: local=$localHash remote=$remoteHash"
    }
    Write-Host "[5/5] reclaim.exe staged at C:\Reclaim\reclaim.exe (sha256 verified)" -ForegroundColor Green
} finally {
    Remove-PSSession $session
}

# ------------------------------------------------------------------------- #
# done                                                                      #
# ------------------------------------------------------------------------- #

Write-Host "`n[setup] VM ready. Next:" -ForegroundColor Cyan
Write-Host "  `$cred = [pscredential]::new('$VmName\$AdminUser', (ConvertTo-SecureString '$AdminPassword' -AsPlainText -Force))" -ForegroundColor White
Write-Host "  .\scripts\test-tweaks-in-vm.ps1 -VmName '$VmName' -Credential `$cred" -ForegroundColor White
