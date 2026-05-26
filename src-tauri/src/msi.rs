//! MSI (Message-Signaled Interrupts) mode manager for PCI devices.
//!
//! Reads / writes the per-device `MSISupported` and `MessageNumberLimit`
//! values under
//!   HKLM\SYSTEM\CurrentControlSet\Enum\<DeviceInstanceId>\Device Parameters\
//!     Interrupt Management\MessageSignaledInterruptProperties
//!
//! Toggling these is famously the "Holy Grail" latency tweak in OC circles —
//! flipping the GPU, NVMe controller and audio chip from line-based IRQs to
//! MSI mode shaves a few µs off interrupt latency and (more importantly)
//! eliminates IRQ sharing contention.
//!
//! **Danger:** wrong values on the wrong device prevent boot. Validation is
//! aggressive; the route adds a fat warning + restore-point prompt.

use serde::{Deserialize, Serialize};

use crate::tweaks::{ps_parse_error, run_ps};

#[derive(Serialize, Deserialize, Clone)]
pub struct MsiDevice {
    /// PnP device-instance ID. Used as the lookup key under Enum\.
    pub instance_id: String,
    pub friendly_name: String,
    pub class: String,
    pub manufacturer: String,
    pub status: String,
    pub present: bool,
    /// Current MSISupported value if the key exists; None if not configured.
    pub msi_supported: Option<u32>,
    pub message_number_limit: Option<u32>,
    /// True iff the device's Interrupt Management subtree exists.
    pub has_interrupt_props: bool,
}

/// PnP device-instance IDs look like:
///   PCI\VEN_10DE&DEV_2204&SUBSYS_xxxxxxxx&REV_A1\3&11583659&0&00E0
/// We accept that pattern plus ACPI\ for completeness, but write operations
/// only touch the `PCI\` namespace via [validate_pci_instance_id].
fn validate_pci_instance_id(id: &str) -> Result<(), String> {
    if id.len() > 256 {
        return Err("Device instance id too long".into());
    }
    if !id.starts_with("PCI\\") {
        return Err("Only PCI devices can have MSI toggled".into());
    }
    for c in id.chars() {
        if !(c.is_ascii_alphanumeric() || matches!(c, '\\' | '&' | '_' | '.' | '-' | '#')) {
            return Err(format!("Invalid character in device id: {c:?}"));
        }
    }
    Ok(())
}

const LIST_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'

# Pull every PnP device in the device-manager classes that benefit from MSI:
# Display (GPU), SCSIAdapter (NVMe / SATA), MEDIA (audio), Net, HIDClass, System.
# Get-PnpDevice (Win10+) preferred; fall back to WMI Win32_PnPEntity if the
# cmdlet isn't there (some stripped-down Server SKUs).
$classes = @('Display','SCSIAdapter','MEDIA','Net','HIDClass','System','USB')
$devices = @()
try {
    $devices = @(Get-PnpDevice -PresentOnly -ErrorAction Stop | Where-Object { $classes -contains $_.Class } | ForEach-Object {
        [pscustomobject]@{
            InstanceId    = $_.InstanceId
            FriendlyName  = $_.FriendlyName
            Class         = $_.Class
            Manufacturer  = $_.Manufacturer
            Status        = "$($_.Status)"
            Present       = [bool]$_.Present
        }
    })
} catch {
    $devices = @(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.Present -and ($classes -contains $_.PNPClass) } | ForEach-Object {
        [pscustomobject]@{
            InstanceId    = $_.DeviceID
            FriendlyName  = $_.Name
            Class         = $_.PNPClass
            Manufacturer  = $_.Manufacturer
            Status        = "$($_.Status)"
            Present       = $true
        }
    })
}

$out = @()
foreach ($d in $devices) {
    if (-not $d.InstanceId) { continue }
    if (-not $d.InstanceId.StartsWith('PCI\')) { continue }
    $base = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($d.InstanceId)\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
    $msi = $null
    $limit = $null
    $hasProps = Test-Path -LiteralPath $base
    if ($hasProps) {
        try {
            $p = Get-ItemProperty -LiteralPath $base -ErrorAction SilentlyContinue
            if ($p -and $null -ne $p.MSISupported) { $msi = [uint32]$p.MSISupported }
            if ($p -and $null -ne $p.MessageNumberLimit) { $limit = [uint32]$p.MessageNumberLimit }
        } catch {}
    }
    $out += [pscustomobject]@{
        instance_id            = "$($d.InstanceId)"
        friendly_name          = "$($d.FriendlyName)"
        class                  = "$($d.Class)"
        manufacturer           = "$($d.Manufacturer)"
        status                 = "$($d.Status)"
        present                = [bool]$d.Present
        msi_supported          = $msi
        message_number_limit   = $limit
        has_interrupt_props    = $hasProps
    }
}

# Stable sort: class, then friendly name.
$out = @($out | Sort-Object class, friendly_name)
ConvertTo-Json -InputObject @($out) -Depth 4 -Compress
"#;

#[tauri::command]
pub async fn msi_list_devices() -> Result<Vec<MsiDevice>, String> {
    let r = run_ps(LIST_SCRIPT);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(out)
        .map_err(|e| ps_parse_error("MSI device list", &e.to_string(), out, &r.stderr))
}

/// Toggle MSISupported. When `enabled` is true the value is set to 1, otherwise
/// the value is removed entirely so the device falls back to its driver-default
/// IRQ handling.
///
/// `HKLM\SYSTEM\CurrentControlSet\Enum\...` is owned by SYSTEM and grants
/// Administrators read-only access — direct writes get ACCESS_DENIED even on
/// an elevated process. The script first tries the direct path (some keys
/// happen to be admin-writable after a recent driver install) and falls back
/// to a SYSTEM-context one-shot scheduled task that performs `reg.exe add` /
/// `reg.exe delete`.
#[tauri::command]
pub async fn msi_set_supported(instance_id: String, enabled: bool) -> Result<(), String> {
    validate_pci_instance_id(&instance_id)?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let task_name = format!("ReclaimMsiToggle-{}", nonce);
    let value_op = if enabled {
        // reg.exe add ... /t REG_DWORD /d 1 /f
        format!(
            "add \\\"HKLM\\\\SYSTEM\\\\CurrentControlSet\\\\Enum\\\\{id}\\\\Device Parameters\\\\Interrupt Management\\\\MessageSignaledInterruptProperties\\\" /v MSISupported /t REG_DWORD /d 1 /f",
            id = instance_id
        )
    } else {
        // reg.exe delete ... /v MSISupported /f
        format!(
            "delete \\\"HKLM\\\\SYSTEM\\\\CurrentControlSet\\\\Enum\\\\{id}\\\\Device Parameters\\\\Interrupt Management\\\\MessageSignaledInterruptProperties\\\" /v MSISupported /f",
            id = instance_id
        )
    };
    let direct_script = if enabled {
        format!(
            r#"
$base = "HKLM:\SYSTEM\CurrentControlSet\Enum\{id}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
if (-not (Test-Path -LiteralPath $base)) {{ New-Item -Path $base -Force -ErrorAction Stop | Out-Null }}
Set-ItemProperty -LiteralPath $base -Name MSISupported -Value 1 -Type DWord -Force -ErrorAction Stop
"#,
            id = instance_id
        )
    } else {
        format!(
            r#"
$base = "HKLM:\SYSTEM\CurrentControlSet\Enum\{id}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
if (Test-Path -LiteralPath $base) {{
    Remove-ItemProperty -LiteralPath $base -Name MSISupported -Force -ErrorAction Stop
}}
"#,
            id = instance_id
        )
    };
    let expected_present = if enabled { "$true" } else { "$false" };
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$directOk = $true
try {{
{direct}
}} catch {{
    $directOk = $false
}}

if (-not $directOk) {{
    # Fallback: run reg.exe as SYSTEM through a one-shot scheduled task. The
    # Enum subkey grants SYSTEM Full Control even when Administrators is
    # read-only.
    $task = '{task}'
    $tr   = 'reg.exe {op}'
    schtasks /create /tn $task /tr $tr /sc once /st 00:00 /ru SYSTEM /f /rl HIGHEST 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {{ throw "schtasks /create failed (LASTEXITCODE=$LASTEXITCODE)" }}
    schtasks /run /tn $task 2>&1 | Out-Null
    # Poll for completion up to ~4 s.
    $done = $false
    for ($i = 0; $i -lt 40; $i++) {{
        Start-Sleep -Milliseconds 100
        $q = schtasks /query /tn $task /fo csv /nh 2>$null
        if (-not $q) {{ $done = $true; break }}
        if ($q -notmatch 'Running') {{ $done = $true; break }}
    }}
    schtasks /delete /tn $task /f 2>&1 | Out-Null
    if (-not $done) {{ throw "SYSTEM task did not finish within 4s" }}
}}

# Verify the change actually landed.
$base = "HKLM:\SYSTEM\CurrentControlSet\Enum\{id}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
$present = $false
if (Test-Path -LiteralPath $base) {{
    $cur = Get-ItemProperty -LiteralPath $base -Name MSISupported -ErrorAction SilentlyContinue
    if ($cur -and $null -ne $cur.MSISupported) {{ $present = $true }}
}}
if ($present -ne {expected}) {{
    throw "Verification failed — MSISupported present=$present after toggle"
}}
"#,
        direct = direct_script,
        task = task_name,
        op = value_op,
        id = instance_id,
        expected = expected_present,
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

/// Set the maximum number of MSI/MSI-X message vectors the device can use.
/// Pass `None` to remove the override. Driver default applies when absent.
#[tauri::command]
pub async fn msi_set_message_limit(
    instance_id: String,
    limit: Option<u32>,
) -> Result<(), String> {
    validate_pci_instance_id(&instance_id)?;
    if let Some(n) = limit {
        if n == 0 || n > 2048 {
            return Err("MessageNumberLimit must be 1..2048".into());
        }
    }
    let script = match limit {
        Some(n) => format!(
            r#"
$ErrorActionPreference = 'Stop'
$base = "HKLM:\SYSTEM\CurrentControlSet\Enum\{id}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
if (-not (Test-Path -LiteralPath $base)) {{ New-Item -Path $base -Force | Out-Null }}
Set-ItemProperty -LiteralPath $base -Name MessageNumberLimit -Value {n} -Type DWord -Force
"#,
            id = instance_id,
            n = n
        ),
        None => format!(
            r#"
$ErrorActionPreference = 'Stop'
$base = "HKLM:\SYSTEM\CurrentControlSet\Enum\{id}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
if (Test-Path -LiteralPath $base) {{
    Remove-ItemProperty -LiteralPath $base -Name MessageNumberLimit -Force -ErrorAction SilentlyContinue
}}
"#,
            id = instance_id
        ),
    };
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}
