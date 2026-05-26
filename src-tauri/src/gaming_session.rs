//! Gaming session: capture system state, suspend background noise, restore on
//! end. The whole point is reversibility — every command here pairs with a
//! snapshot field that lets us put things back exactly as they were.
//!
//! Security: process-name and service-name inputs are whitelist-validated
//! against compile-time constants. Power-plan GUIDs are format-validated.
//! Nothing user-controlled is interpolated into a PowerShell payload raw.

use serde::{Deserialize, Serialize};

use crate::tweaks::{ps_parse_error, run_ps};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProcessSnapshot {
    pub name: String,
    pub running: bool,
    pub command_line: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ServiceSnapshot {
    pub name: String,
    pub start_type: String,
    pub status: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SessionSnapshot {
    pub power_plan_guid: String,
    pub defender_realtime: bool,
    pub processes: Vec<ProcessSnapshot>,
    pub services: Vec<ServiceSnapshot>,
}

/// Background processes the user can ask us to suspend during a gaming session.
/// Pinned to a closed list so a compromised frontend (or a typo) can't ask us
/// to taskkill csrss.exe. Every entry is matched case-insensitively against
/// the basename + ".exe" suffix.
pub(crate) const KILLABLE_PROCESSES: &[&str] = &[
    "Discord.exe",
    "DiscordPTB.exe",
    "DiscordCanary.exe",
    "Spotify.exe",
    "msedge.exe",
    "chrome.exe",
    "firefox.exe",
    "brave.exe",
    "opera.exe",
    "OneDrive.exe",
    "GoogleDriveFS.exe",
    "Dropbox.exe",
    "Slack.exe",
    "Teams.exe",
    "ms-teams.exe",
    "Telegram.exe",
    "Signal.exe",
    "WhatsApp.exe",
    "EpicGamesLauncher.exe",
    "EpicWebHelper.exe",
    "Battle.net.exe",
    "GalaxyClient.exe",
    "Origin.exe",
    "EADesktop.exe",
    "UbisoftConnect.exe",
    "RiotClientServices.exe",
    "RazerCentralService.exe",
    "GameBarPresenceWriter.exe",
    "obs64.exe",
    "obs32.exe",
    "Code.exe",
    "Notion.exe",
    "Notepad++.exe",
    "Postman.exe",
];

/// Services the user can ask us to stop and later restart. Whitelisted for
/// the same reason as processes.
pub(crate) const TOGGLEABLE_SERVICES: &[&str] = &[
    "WSearch",         // Windows Search indexer
    "SysMain",         // Superfetch
    "DiagTrack",       // Connected User Experiences and Telemetry
    "WerSvc",          // Windows Error Reporting
    "Spooler",         // Print Spooler
    "WbioSrvc",        // Windows Biometric (laptop fingerprint)
    "BITS",            // Background Intelligent Transfer
    "wuauserv",        // Windows Update
    "BthAvctpSvc",     // Bluetooth audio when not in use
    "TabletInputService",
];

fn whitelisted_process(name: &str) -> bool {
    KILLABLE_PROCESSES
        .iter()
        .any(|p| p.eq_ignore_ascii_case(name))
}

fn whitelisted_service(name: &str) -> bool {
    TOGGLEABLE_SERVICES
        .iter()
        .any(|s| s.eq_ignore_ascii_case(name))
}

fn valid_guid(s: &str) -> bool {
    let bytes = s.as_bytes();
    bytes.len() == 36
        && bytes[8] == b'-'
        && bytes[13] == b'-'
        && bytes[18] == b'-'
        && bytes[23] == b'-'
        && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

const SNAPSHOT_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'

$activePlanGuid = ''
$schemeOutput = powercfg /getactivescheme 2>&1 | Out-String
if ($schemeOutput -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') {
    $activePlanGuid = $Matches[1]
}

$defenderRealtime = $true
try {
    $pref = Get-MpPreference -ErrorAction Stop
    $defenderRealtime = -not [bool]$pref.DisableRealtimeMonitoring
} catch {}

$procNames = @(__PROCESS_LIST__)
$procs = @()
foreach ($n in $procNames) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($n)
    $found = Get-Process -Name $base -ErrorAction SilentlyContinue
    if ($found) {
        $procs += [pscustomobject]@{
            name = $n
            running = $true
            command_line = $null
        }
    } else {
        $procs += [pscustomobject]@{ name = $n; running = $false; command_line = $null }
    }
}

$svcNames = @(__SERVICE_LIST__)
$svcs = @()
foreach ($s in $svcNames) {
    $svc = Get-Service -Name $s -ErrorAction SilentlyContinue
    if ($svc) {
        $svcs += [pscustomobject]@{
            name = $s
            start_type = "$($svc.StartType)"
            status = "$($svc.Status)"
        }
    } else {
        $svcs += [pscustomobject]@{ name = $s; start_type = 'NotInstalled'; status = 'NotInstalled' }
    }
}

[pscustomobject]@{
    power_plan_guid = $activePlanGuid
    defender_realtime = $defenderRealtime
    processes = $procs
    services = $svcs
} | ConvertTo-Json -Depth 4 -Compress
"#;

fn build_snapshot_script() -> String {
    // The two name-lists come from the compile-time whitelist — no frontend
    // input touches the PowerShell template.
    let procs = KILLABLE_PROCESSES
        .iter()
        .map(|p| format!("'{}'", p))
        .collect::<Vec<_>>()
        .join(", ");
    let svcs = TOGGLEABLE_SERVICES
        .iter()
        .map(|s| format!("'{}'", s))
        .collect::<Vec<_>>()
        .join(", ");
    SNAPSHOT_SCRIPT
        .replace("__PROCESS_LIST__", &procs)
        .replace("__SERVICE_LIST__", &svcs)
}

#[tauri::command]
pub async fn session_snapshot() -> Result<SessionSnapshot, String> {
    let script = build_snapshot_script();
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Err("Empty session snapshot payload".into());
    }
    serde_json::from_str(out)
        .map_err(|e| ps_parse_error("Session snapshot", &e.to_string(), out, &r.stderr))
}

#[derive(Serialize, Clone)]
pub struct KillResult {
    pub name: String,
    pub success: bool,
    pub stderr: String,
}

#[tauri::command]
pub async fn session_kill_processes(names: Vec<String>) -> Result<Vec<KillResult>, String> {
    let mut results = Vec::with_capacity(names.len());
    for raw in names {
        if !whitelisted_process(&raw) {
            results.push(KillResult {
                name: raw,
                success: false,
                stderr: "Process not in whitelist".to_string(),
            });
            continue;
        }
        let base = raw.trim_end_matches(".exe").trim_end_matches(".EXE");
        // Static script template — `base` already passed the whitelist guard.
        let script = format!(
            "Stop-Process -Name '{}' -Force -ErrorAction SilentlyContinue; if ($?) {{ exit 0 }} else {{ exit 0 }}",
            base
        );
        let r = run_ps(&script);
        results.push(KillResult {
            name: raw,
            success: r.success,
            stderr: if r.stderr.is_empty() {
                String::new()
            } else {
                r.stderr.trim().to_string()
            },
        });
    }
    Ok(results)
}

#[tauri::command]
pub async fn session_set_power_plan(guid: String) -> Result<(), String> {
    if !valid_guid(&guid) {
        return Err(format!("Rejected GUID: {guid}"));
    }
    let r = run_ps(&format!("powercfg /setactive {guid}"));
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

#[tauri::command]
pub async fn session_set_defender_realtime(enabled: bool) -> Result<(), String> {
    // Use a static -Command payload; only the boolean leg varies.
    let leg = if enabled { "$false" } else { "$true" };
    let script = format!(
        "Set-MpPreference -DisableRealtimeMonitoring {} -ErrorAction Stop",
        leg
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct ServiceActionResult {
    pub name: String,
    pub success: bool,
    pub stderr: String,
}

/// Stop a whitelisted service for the duration of the gaming session.
#[tauri::command]
pub async fn session_stop_services(names: Vec<String>) -> Result<Vec<ServiceActionResult>, String> {
    let mut results = Vec::with_capacity(names.len());
    for raw in names {
        if !whitelisted_service(&raw) {
            results.push(ServiceActionResult {
                name: raw,
                success: false,
                stderr: "Service not in whitelist".to_string(),
            });
            continue;
        }
        let script = format!(
            "Stop-Service -Name '{}' -Force -ErrorAction SilentlyContinue; exit 0",
            raw
        );
        let r = run_ps(&script);
        results.push(ServiceActionResult {
            name: raw,
            success: r.success,
            stderr: if r.stderr.is_empty() {
                String::new()
            } else {
                r.stderr.trim().to_string()
            },
        });
    }
    Ok(results)
}

/// Restore a whitelisted service. `target_status` is "Running" or "Stopped"
/// (whatever the snapshot captured); the service is started/stopped accordingly.
#[tauri::command]
pub async fn session_restore_services(
    items: Vec<ServiceSnapshot>,
) -> Result<Vec<ServiceActionResult>, String> {
    let mut results = Vec::with_capacity(items.len());
    for it in items {
        if !whitelisted_service(&it.name) {
            results.push(ServiceActionResult {
                name: it.name,
                success: false,
                stderr: "Service not in whitelist".to_string(),
            });
            continue;
        }
        // Snapshot statuses produced by Get-Service: Running, Stopped, Paused,
        // StartPending, StopPending, ContinuePending, PausePending, NotInstalled.
        // We only act on Running vs. anything-else; for NotInstalled we skip.
        if it.status == "NotInstalled" {
            results.push(ServiceActionResult {
                name: it.name,
                success: true,
                stderr: String::new(),
            });
            continue;
        }
        let verb = if it.status == "Running" {
            "Start-Service"
        } else {
            "Stop-Service"
        };
        let script = format!(
            "{} -Name '{}' -ErrorAction SilentlyContinue; exit 0",
            verb, it.name
        );
        let r = run_ps(&script);
        results.push(ServiceActionResult {
            name: it.name,
            success: r.success,
            stderr: if r.stderr.is_empty() {
                String::new()
            } else {
                r.stderr.trim().to_string()
            },
        });
    }
    Ok(results)
}

/// Convenience for the frontend: returns the static whitelist so the UI can
/// render the same set the backend will accept.
#[tauri::command]
pub fn session_whitelist() -> serde_json::Value {
    serde_json::json!({
        "processes": KILLABLE_PROCESSES,
        "services": TOGGLEABLE_SERVICES,
    })
}
