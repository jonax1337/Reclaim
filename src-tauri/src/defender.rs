use serde::{Deserialize, Serialize};

use crate::tweaks::{ps_parse_error, run_ps};

#[derive(Serialize, Clone)]
pub struct DefenderStatus {
    pub realtime_protection: bool,
    pub cloud_protection: bool,
    pub sample_submission: bool,
    pub pua_protection: bool,
    pub network_protection: bool,
    pub controlled_folder_access: bool,
    pub tamper_protection: bool,
    pub smartscreen_explorer: bool,
    pub smartscreen_edge: bool,
    pub smartscreen_store: bool,
    pub service_running: bool,
    /// True if the system is managed by an MDM/Group Policy that overrides
    /// local Defender settings — toggles still attempt but may silently revert.
    pub managed_by_policy: bool,
}

const STATUS_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
$pref = Get-MpPreference
$svc = Get-Service -Name WinDefend -ErrorAction SilentlyContinue
$tamperKey = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows Defender\Features' -Name 'TamperProtection' -ErrorAction SilentlyContinue
$ssExp = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' -Name 'SmartScreenEnabled' -ErrorAction SilentlyContinue
$ssEdgePol = Get-ItemProperty -Path 'HKLM:\Software\Policies\Microsoft\Edge' -Name 'SmartScreenEnabled' -ErrorAction SilentlyContinue
$ssStore = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AppHost' -Name 'EnableWebContentEvaluation' -ErrorAction SilentlyContinue
$polRoot = Get-Item -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender' -ErrorAction SilentlyContinue
[pscustomobject]@{
    realtime_protection       = -not [bool]$pref.DisableRealtimeMonitoring
    cloud_protection          = ([int]$pref.MAPSReporting -gt 0)
    sample_submission         = ([int]$pref.SubmitSamplesConsent -ne 2)
    pua_protection            = ([int]$pref.PUAProtection -eq 1)
    network_protection        = ([int]$pref.EnableNetworkProtection -eq 1)
    controlled_folder_access  = ([int]$pref.EnableControlledFolderAccess -eq 1)
    tamper_protection         = if ($tamperKey) { [int]$tamperKey.TamperProtection -eq 5 } else { $false }
    smartscreen_explorer      = if ($ssExp) { $ssExp.SmartScreenEnabled -ne 'Off' } else { $true }
    smartscreen_edge          = if ($ssEdgePol) { [int]$ssEdgePol.SmartScreenEnabled -ne 0 } else { $true }
    smartscreen_store         = if ($ssStore) { [int]$ssStore.EnableWebContentEvaluation -ne 0 } else { $true }
    service_running           = if ($svc) { $svc.Status -eq 'Running' } else { $false }
    managed_by_policy         = $polRoot -ne $null
} | ConvertTo-Json -Compress
"#;

#[tauri::command]
pub async fn defender_status() -> Result<DefenderStatus, String> {
    let r = run_ps(STATUS_SCRIPT);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Err("Empty defender status payload".into());
    }
    let v: serde_json::Value = serde_json::from_str(out)
        .map_err(|e| ps_parse_error("Defender status", &e.to_string(), out, &r.stderr))?;
    let b = |k: &str| v.get(k).and_then(|x| x.as_bool()).unwrap_or(false);
    Ok(DefenderStatus {
        realtime_protection: b("realtime_protection"),
        cloud_protection: b("cloud_protection"),
        sample_submission: b("sample_submission"),
        pua_protection: b("pua_protection"),
        network_protection: b("network_protection"),
        controlled_folder_access: b("controlled_folder_access"),
        tamper_protection: b("tamper_protection"),
        smartscreen_explorer: b("smartscreen_explorer"),
        smartscreen_edge: b("smartscreen_edge"),
        smartscreen_store: b("smartscreen_store"),
        service_running: b("service_running"),
        managed_by_policy: b("managed_by_policy"),
    })
}

/// Known setting ids. Anything else is rejected — no string interpolation
/// from the frontend lands in a PowerShell script unchecked.
fn setting_script(setting: &str, enabled: bool) -> Option<String> {
    let b = if enabled { "$false" } else { "$true" };
    let enable_int = if enabled { "1" } else { "0" };
    let script = match setting {
        // MpPreference-based toggles — value-only (no path) so no injection surface.
        "realtime_protection" => format!("Set-MpPreference -DisableRealtimeMonitoring {b}"),
        "cloud_protection" => {
            // 0 = Disabled, 2 = Advanced
            let v = if enabled { "2" } else { "0" };
            format!("Set-MpPreference -MAPSReporting {v}")
        }
        "sample_submission" => {
            // 1 = SendSafeSamples, 2 = NeverSend
            let v = if enabled { "1" } else { "2" };
            format!("Set-MpPreference -SubmitSamplesConsent {v}")
        }
        "pua_protection" => format!("Set-MpPreference -PUAProtection {enable_int}"),
        "network_protection" => {
            format!("Set-MpPreference -EnableNetworkProtection {enable_int}")
        }
        "controlled_folder_access" => {
            format!("Set-MpPreference -EnableControlledFolderAccess {enable_int}")
        }
        // SmartScreen — registry writes, hardcoded paths/names/types.
        "smartscreen_explorer" => {
            let val = if enabled { "RequireAdmin" } else { "Off" };
            format!(
                "New-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer' -Force | Out-Null; \
                 Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer' -Name 'SmartScreenEnabled' -Value '{val}' -Type String -Force"
            )
        }
        "smartscreen_edge" => {
            format!(
                "New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge' -Force | Out-Null; \
                 Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge' -Name 'SmartScreenEnabled' -Value {enable_int} -Type DWord -Force"
            )
        }
        "smartscreen_store" => {
            format!(
                "New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AppHost' -Force | Out-Null; \
                 Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AppHost' -Name 'EnableWebContentEvaluation' -Value {enable_int} -Type DWord -Force"
            )
        }
        _ => return None,
    };
    Some(format!("$ErrorActionPreference='Stop'; {script}"))
}

#[tauri::command]
pub async fn defender_set_setting(setting: String, enabled: bool) -> Result<(), String> {
    let script = setting_script(&setting, enabled)
        .ok_or_else(|| format!("Unknown defender setting: {setting}"))?;
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

#[derive(Serialize, Clone, Default)]
pub struct DefenderExclusions {
    pub paths: Vec<String>,
    pub processes: Vec<String>,
    pub extensions: Vec<String>,
}

#[tauri::command]
pub async fn defender_list_exclusions() -> Result<DefenderExclusions, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$p = Get-MpPreference
[pscustomobject]@{
    paths      = @($p.ExclusionPath) | Where-Object { $_ }
    processes  = @($p.ExclusionProcess) | Where-Object { $_ }
    extensions = @($p.ExclusionExtension) | Where-Object { $_ }
} | ConvertTo-Json -Compress -Depth 3
"#;
    let r = run_ps(script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(DefenderExclusions::default());
    }
    let v: serde_json::Value = serde_json::from_str(out)
        .map_err(|e| ps_parse_error("Defender exclusions", &e.to_string(), out, &r.stderr))?;
    let arr = |k: &str| -> Vec<String> {
        v.get(k)
            .and_then(|x| x.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|s| s.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    };
    Ok(DefenderExclusions {
        paths: arr("paths"),
        processes: arr("processes"),
        extensions: arr("extensions"),
    })
}

#[derive(Deserialize)]
pub struct ExclusionRequest {
    pub kind: String,  // "path" | "process" | "extension"
    pub value: String,
}

fn valid_exclusion_value(kind: &str, value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 1024 {
        return Err("Empty or oversized value".into());
    }
    if value.contains('\n') || value.contains('\r') || value.contains('\'') || value.contains('"') {
        return Err("Value contains forbidden characters".into());
    }
    match kind {
        "path" | "process" => Ok(()),
        "extension" => {
            // Accept "log" or ".log"; reject paths.
            if value.contains('\\') || value.contains('/') || value.contains(':') {
                return Err("Extension must not contain a path".into());
            }
            Ok(())
        }
        _ => Err(format!("Unknown exclusion kind: {kind}")),
    }
}

fn exclusion_param(kind: &str) -> Option<&'static str> {
    match kind {
        "path" => Some("ExclusionPath"),
        "process" => Some("ExclusionProcess"),
        "extension" => Some("ExclusionExtension"),
        _ => None,
    }
}

#[tauri::command]
pub async fn defender_add_exclusion(req: ExclusionRequest) -> Result<(), String> {
    valid_exclusion_value(&req.kind, &req.value)?;
    let param = exclusion_param(&req.kind).ok_or("Unknown exclusion kind")?;
    let mut value = req.value.clone();
    if req.kind == "extension" {
        // Get-MpPreference returns extensions without leading dot. Add-MpPreference
        // accepts either; normalize so the round-trip is consistent.
        if let Some(stripped) = value.strip_prefix('.') {
            value = stripped.to_string();
        }
    }
    let script = format!(
        "$ErrorActionPreference='Stop'; Add-MpPreference -{param} '{value}'",
        value = value.replace('\'', "''"),
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

#[tauri::command]
pub async fn defender_remove_exclusion(req: ExclusionRequest) -> Result<(), String> {
    valid_exclusion_value(&req.kind, &req.value)?;
    let param = exclusion_param(&req.kind).ok_or("Unknown exclusion kind")?;
    let value = if req.kind == "extension" {
        req.value.strip_prefix('.').unwrap_or(&req.value).to_string()
    } else {
        req.value.clone()
    };
    let script = format!(
        "$ErrorActionPreference='Stop'; Remove-MpPreference -{param} '{value}'",
        value = value.replace('\'', "''"),
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}
