use serde::Serialize;

use crate::tweaks::run_ps;

#[derive(Serialize, Clone)]
pub struct StartupApp {
    pub id: String,
    pub name: String,
    pub command: String,
    pub source: String,
    pub enabled: bool,
}

#[derive(Serialize, Clone)]
pub struct ServiceEntry {
    pub name: String,
    pub display_name: String,
    pub status: String,
    pub start_type: String,
    pub can_pause_and_continue: bool,
}

fn ps_quote(s: &str) -> String {
    s.replace('\'', "''")
}

#[tauri::command]
pub async fn get_hardware_info() -> Result<serde_json::Value, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$cpu = Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed
$gpu = Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, DriverDate, AdapterRAM, VideoModeDescription, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate
$cs = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, SystemFamily, TotalPhysicalMemory
$os = Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory, TotalVisibleMemorySize, InstallDate, LastBootUpTime
$ram = Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed, Manufacturer, PartNumber, ConfiguredClockSpeed, FormFactor, DeviceLocator
$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, Size, FreeSpace, VolumeName, FileSystem
$pdisks = Get-CimInstance Win32_DiskDrive | Select-Object Model, Size, InterfaceType, MediaType, SerialNumber
$mb = Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product, Version
$bios = Get-CimInstance Win32_BIOS | Select-Object SMBIOSBIOSVersion, ReleaseDate, Manufacturer
@{
    cpu = @($cpu)
    gpu = @($gpu)
    system = $cs
    os = $os
    ram = @($ram)
    disks = @($disks)
    physicalDisks = @($pdisks)
    motherboard = $mb
    bios = $bios
} | ConvertTo-Json -Depth 5 -Compress
"#;
    let r = run_ps(script);
    if !r.success {
        return Err(r.stderr);
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(out).map_err(|e| format!("JSON parse failed: {}", e))
}

#[tauri::command]
pub async fn list_startup_apps() -> Result<Vec<StartupApp>, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'

function GetApprovedState($keyPath, $name) {
    try {
        $item = Get-ItemProperty -Path $keyPath -Name $name -ErrorAction Stop
        $val = $item.$name
        if ($val -is [byte[]] -and $val.Count -ge 1) {
            return ($val[0] -lt 0x03)
        }
    } catch {}
    return $true
}

$entries = New-Object System.Collections.ArrayList

$sources = @(
    @{ run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; approved = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'; sourceLabel = 'HKCU\Run'; idPrefix = 'hkcu' },
    @{ run = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'; approved = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'; sourceLabel = 'HKLM\Run'; idPrefix = 'hklm' },
    @{ run = 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; approved = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32'; sourceLabel = 'HKLM\Run (32-bit)'; idPrefix = 'hklm32' }
)

foreach ($s in $sources) {
    if (Test-Path $s.run) {
        $props = Get-ItemProperty -Path $s.run
        foreach ($p in $props.PSObject.Properties) {
            if ($p.Name -like 'PS*') { continue }
            [void]$entries.Add(@{
                id = "$($s.idPrefix):$($p.Name)"
                name = $p.Name
                command = [string]$p.Value
                source = $s.sourceLabel
                enabled = GetApprovedState $s.approved $p.Name
            })
        }
    }
}

$userFolder = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$userApprovedKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder'
Get-ChildItem -Path $userFolder -ErrorAction SilentlyContinue | ForEach-Object {
    [void]$entries.Add(@{
        id = "userfolder:$($_.Name)"
        name = $_.BaseName
        command = $_.FullName
        source = 'Startup folder (user)'
        enabled = GetApprovedState $userApprovedKey $_.Name
    })
}

$allFolder = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\StartUp'
Get-ChildItem -Path $allFolder -ErrorAction SilentlyContinue | ForEach-Object {
    [void]$entries.Add(@{
        id = "allfolder:$($_.Name)"
        name = $_.BaseName
        command = $_.FullName
        source = 'Startup folder (all users)'
        enabled = $true
    })
}

# Modern AppX / UWP startup entries — the registry key holds AUMID values
# (e.g. 'Microsoft.WindowsTerminal_8wekyb3d8bbwe!App'). These are the entries
# you see toggled in Settings > Apps > Startup, in addition to classic Run.
$appxSources = @(
    @{ key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolderPackagedAppX'; label = 'AppX (user)' },
    @{ key = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolderPackagedAppX'; label = 'AppX (machine)' }
)
foreach ($src in $appxSources) {
    if (-not (Test-Path $src.key)) { continue }
    $approvedItem = Get-ItemProperty -Path $src.key -ErrorAction SilentlyContinue
    if (-not $approvedItem) { continue }
    foreach ($prop in $approvedItem.PSObject.Properties) {
        if ($prop.Name -like 'PS*') { continue }
        $aumid = $prop.Name
        # AUMID = '<PackageFamilyName>!<AppId>'. Resolve to a display name.
        $familyName = ($aumid -split '!')[0]
        $packageName = ($familyName -split '_')[0]
        $display = $packageName
        $pkg = Get-AppxPackage -Name $packageName -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pkg) {
            $manifestPath = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
            if (Test-Path -LiteralPath $manifestPath) {
                try {
                    [xml]$mx = Get-Content -LiteralPath $manifestPath -Raw
                    $vd = $mx.Package.Properties.DisplayName
                    if ($vd) { $display = $vd }
                } catch {}
            }
        }
        $val = $prop.Value
        $enabled = $true
        if ($val -is [byte[]] -and $val.Count -ge 1) { $enabled = ($val[0] -lt 0x03) }
        [void]$entries.Add(@{
            id = "packagedappx:$aumid"
            name = $display
            command = "appx:$aumid"
            source = $src.label
            enabled = $enabled
        })
    }
}

if ($entries.Count -eq 0) { '[]' } else { ,$entries | ConvertTo-Json -Compress -Depth 3 }
"#;
    let r = run_ps(script);
    if !r.success {
        return Err(r.stderr);
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(vec![]);
    }
    let parsed: serde_json::Value =
        serde_json::from_str(out).map_err(|e| format!("JSON parse failed: {}", e))?;
    let arr: Vec<serde_json::Value> = match parsed {
        serde_json::Value::Array(a) => a,
        serde_json::Value::Null => vec![],
        other => vec![other],
    };
    let mut out = Vec::with_capacity(arr.len());
    for v in arr {
        out.push(StartupApp {
            id: v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            name: v.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            command: v.get("command").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            source: v.get("source").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            enabled: v.get("enabled").and_then(|x| x.as_bool()).unwrap_or(true),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn set_startup_enabled(id: String, enabled: bool) -> Result<(), String> {
    let (source, name) = id
        .split_once(':')
        .ok_or_else(|| format!("Bad id: {}", id))?;
    let approved_key = match source {
        "hkcu" => "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run",
        "hklm" => "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run",
        "hklm32" => "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32",
        "userfolder" => "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder",
        "allfolder" => "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder",
        "packagedappx" => "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolderPackagedAppX",
        other => return Err(format!("Unknown startup source: {}", other)),
    };
    let first_byte = if enabled { "0x02" } else { "0x03" };
    let script = format!(
        r#"
$key = '{key}'
$name = '{name}'
if (-not (Test-Path $key)) {{ New-Item -Path $key -Force | Out-Null }}
$bytes = [byte[]]({first},0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00)
Set-ItemProperty -Path $key -Name $name -Value $bytes -Type Binary -Force
"#,
        key = approved_key,
        name = ps_quote(name),
        first = first_byte,
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(r.stderr.trim().to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn list_services() -> Result<Vec<ServiceEntry>, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
Get-Service | Select-Object Name, DisplayName,
    @{n='Status';e={[string]$_.Status}},
    @{n='StartType';e={[string]$_.StartType}},
    @{n='CanPauseAndContinue';e={[bool]$_.CanPauseAndContinue}} |
    ConvertTo-Json -Compress -Depth 2
"#;
    let r = run_ps(script);
    if !r.success {
        return Err(r.stderr);
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(vec![]);
    }
    let parsed: serde_json::Value =
        serde_json::from_str(out).map_err(|e| format!("JSON parse failed: {}", e))?;
    let arr: Vec<serde_json::Value> = match parsed {
        serde_json::Value::Array(a) => a,
        other => vec![other],
    };
    let mut services = Vec::with_capacity(arr.len());
    for v in arr {
        services.push(ServiceEntry {
            name: v.get("Name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            display_name: v.get("DisplayName").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            status: v.get("Status").and_then(|x| x.as_str()).unwrap_or("Unknown").to_string(),
            start_type: v.get("StartType").and_then(|x| x.as_str()).unwrap_or("Unknown").to_string(),
            can_pause_and_continue: v.get("CanPauseAndContinue").and_then(|x| x.as_bool()).unwrap_or(false),
        });
    }
    Ok(services)
}

#[tauri::command]
pub async fn set_service(name: String, start_type: String, run_state: Option<String>) -> Result<(), String> {
    let allowed_start = ["Automatic", "AutomaticDelayedStart", "Manual", "Disabled"];
    if !allowed_start.contains(&start_type.as_str()) {
        return Err(format!("Invalid start type: {}", start_type));
    }
    let name_q = ps_quote(&name);
    let start_q = ps_quote(&start_type);
    let action = match run_state.as_deref() {
        Some("Running") => "if ((Get-Service -Name $name -ErrorAction Stop).Status -ne 'Running') { Start-Service -Name $name -ErrorAction Stop }",
        Some("Stopped") => "if ((Get-Service -Name $name -ErrorAction Stop).Status -ne 'Stopped') { Stop-Service -Name $name -Force -ErrorAction Stop }",
        _ => "",
    };
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$name = '{name}'
Set-Service -Name $name -StartupType '{start}'
{action}
"#,
        name = name_q,
        start = start_q,
        action = action,
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(r.stderr.trim().to_string());
    }
    Ok(())
}
