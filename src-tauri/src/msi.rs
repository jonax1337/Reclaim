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
$classes = @('Display','SCSIAdapter','MEDIA','Net','HIDClass','System','USB')
$devices = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $classes -contains $_.Class }
if (-not $devices) { '[]'; return }

$out = @()
foreach ($d in $devices) {
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
$out = $out | Sort-Object class, friendly_name
$out | ConvertTo-Json -Depth 4 -AsArray -Compress
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
/// the value (and the surrounding subkey if empty) is removed entirely so the
/// device falls back to its driver-default IRQ handling.
#[tauri::command]
pub async fn msi_set_supported(instance_id: String, enabled: bool) -> Result<(), String> {
    validate_pci_instance_id(&instance_id)?;
    let script = if enabled {
        format!(
            r#"
$base = "HKLM:\SYSTEM\CurrentControlSet\Enum\{id}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
if (-not (Test-Path -LiteralPath $base)) {{ New-Item -Path $base -Force | Out-Null }}
New-ItemProperty -LiteralPath $base -Name MSISupported -PropertyType DWord -Value 1 -Force | Out-Null
"#,
            id = instance_id
        )
    } else {
        format!(
            r#"
$base = "HKLM:\SYSTEM\CurrentControlSet\Enum\{id}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
if (Test-Path -LiteralPath $base) {{
    Remove-ItemProperty -LiteralPath $base -Name MSISupported -ErrorAction SilentlyContinue
}}
"#,
            id = instance_id
        )
    };
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
$base = "HKLM:\SYSTEM\CurrentControlSet\Enum\{id}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
if (-not (Test-Path -LiteralPath $base)) {{ New-Item -Path $base -Force | Out-Null }}
New-ItemProperty -LiteralPath $base -Name MessageNumberLimit -PropertyType DWord -Value {n} -Force | Out-Null
"#,
            id = instance_id,
            n = n
        ),
        None => format!(
            r#"
$base = "HKLM:\SYSTEM\CurrentControlSet\Enum\{id}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
if (Test-Path -LiteralPath $base) {{
    Remove-ItemProperty -LiteralPath $base -Name MessageNumberLimit -ErrorAction SilentlyContinue
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
