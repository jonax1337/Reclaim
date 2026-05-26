//! Anti-cheat compatibility readout. Reports the platform-security state
//! that modern kernel-level anti-cheats care about — Secure Boot, TPM 2.0,
//! VBS / HVCI / Memory Integrity, Test Mode, kernel debugging.
//!
//! Read-only. No changes happen here; the route surfaces "you need to flip X
//! in your UEFI" guidance instead.

use serde::Serialize;

use crate::tweaks::{ps_parse_error, run_ps};

/// Each field is `Some(true)` / `Some(false)` when the probe succeeded,
/// `None` when the query was not possible (legacy BIOS, no TPM module
/// installed, PowerShell cmdlet missing, etc.).
#[derive(Serialize, Clone)]
pub struct AntiCheatState {
    pub secure_boot: Option<bool>,
    pub tpm_present: Option<bool>,
    pub tpm_ready: Option<bool>,
    pub tpm_spec_version: Option<String>,
    /// True when Virtualization-Based Security is actually running (VBSStatus = 2).
    pub vbs_running: bool,
    /// True when HVCI / Memory Integrity is running (SecurityServicesRunning contains 2).
    pub hvci_running: bool,
    /// True when `bcdedit testsigning Yes` (driver signature enforcement off).
    pub test_mode: bool,
    /// True when `bcdedit debug Yes`.
    pub kernel_debug: bool,
    /// True when running on 64-bit Windows — anti-cheats require this.
    pub is_64bit: bool,
    /// Build number (e.g. 22631) — useful to flag pre-Win11 hosts.
    pub build_number: u32,
}

const PROBE_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'

# Secure Boot: Confirm-SecureBootUEFI throws on legacy BIOS — catch it.
$secureBoot = $null
try {
    $secureBoot = [bool](Confirm-SecureBootUEFI)
} catch {
    $secureBoot = $null
}

# TPM: Get-Tpm is admin-only and only available when a TPM driver is loaded.
# Fall back to WMI Win32_Tpm so non-admin reads still succeed.
$tpmPresent = $null
$tpmReady = $null
$tpmSpec = $null
try {
    $tpm = Get-CimInstance -Namespace 'root\cimv2\security\microsofttpm' -ClassName Win32_Tpm -ErrorAction Stop
    if ($tpm) {
        $tpmPresent = [bool]$tpm.IsActivated_InitialValue -or [bool]$tpm.IsEnabled_InitialValue
        $tpmReady = [bool]$tpm.IsActivated_InitialValue -and [bool]$tpm.IsEnabled_InitialValue -and [bool]$tpm.IsOwned_InitialValue
        $tpmSpec = "$($tpm.SpecVersion)"
    } else {
        $tpmPresent = $false
    }
} catch {
    # Namespace missing → no TPM driver.
    $tpmPresent = $false
}

# Device Guard / VBS / HVCI.
$vbsRunning = $false
$hvciRunning = $false
try {
    $dg = Get-CimInstance -Namespace 'root\Microsoft\Windows\DeviceGuard' -ClassName Win32_DeviceGuard -ErrorAction Stop
    if ($dg) {
        $vbsRunning = ([int]$dg.VirtualizationBasedSecurityStatus -eq 2)
        if ($dg.SecurityServicesRunning) {
            foreach ($s in $dg.SecurityServicesRunning) {
                if ([int]$s -eq 2) { $hvciRunning = $true }
            }
        }
    }
} catch {}

# Test signing / kernel debug via bcdedit. bcdedit needs admin to enumerate the
# current entry on some platforms; fall back to false if we can't read it.
$testMode = $false
$kernelDebug = $false
try {
    $bcd = bcdedit /enum '{current}' 2>$null | Out-String
    if ($bcd -match '(?m)^\s*testsigning\s+Yes\s*$') { $testMode = $true }
    if ($bcd -match '(?m)^\s*debug\s+Yes\s*$') { $kernelDebug = $true }
} catch {}

$is64 = [Environment]::Is64BitOperatingSystem
$build = 0
try {
    $build = [int](Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuildNumber
} catch {}

[pscustomobject]@{
    secure_boot      = $secureBoot
    tpm_present      = $tpmPresent
    tpm_ready        = $tpmReady
    tpm_spec_version = $tpmSpec
    vbs_running      = $vbsRunning
    hvci_running     = $hvciRunning
    test_mode        = $testMode
    kernel_debug     = $kernelDebug
    is_64bit         = $is64
    build_number     = $build
} | ConvertTo-Json -Compress
"#;

#[tauri::command]
pub async fn ac_get_state() -> Result<AntiCheatState, String> {
    let r = run_ps(PROBE_SCRIPT);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Err("Empty anti-cheat state payload".into());
    }
    let v: serde_json::Value = serde_json::from_str(out)
        .map_err(|e| ps_parse_error("AntiCheat state", &e.to_string(), out, &r.stderr))?;

    fn opt_bool(v: &serde_json::Value, k: &str) -> Option<bool> {
        match v.get(k) {
            Some(serde_json::Value::Bool(b)) => Some(*b),
            Some(serde_json::Value::Null) => None,
            _ => None,
        }
    }
    fn req_bool(v: &serde_json::Value, k: &str) -> bool {
        v.get(k).and_then(|x| x.as_bool()).unwrap_or(false)
    }

    Ok(AntiCheatState {
        secure_boot: opt_bool(&v, "secure_boot"),
        tpm_present: opt_bool(&v, "tpm_present"),
        tpm_ready: opt_bool(&v, "tpm_ready"),
        tpm_spec_version: v
            .get("tpm_spec_version")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        vbs_running: req_bool(&v, "vbs_running"),
        hvci_running: req_bool(&v, "hvci_running"),
        test_mode: req_bool(&v, "test_mode"),
        kernel_debug: req_bool(&v, "kernel_debug"),
        is_64bit: req_bool(&v, "is_64bit"),
        build_number: v
            .get("build_number")
            .and_then(|x| x.as_u64())
            .unwrap_or(0) as u32,
    })
}

#[tauri::command]
pub async fn ac_disable_test_mode() -> Result<(), String> {
    let r = run_ps("bcdedit /set testsigning off | Out-Null");
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

#[tauri::command]
pub async fn ac_disable_kernel_debug() -> Result<(), String> {
    let r = run_ps("bcdedit /debug off | Out-Null");
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}
