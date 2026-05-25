//! System recovery: advanced restart options + Windows System Restore points.
//!
//! Three concerns bundled in one module:
//!   1. `advanced_restart(mode)` — reboot into a non-default boot target:
//!      "menu"      → Windows RE "Choose an option" screen (`shutdown /r /o`)
//!      "firmware"  → straight to UEFI firmware setup (`shutdown /r /fw`)
//!      "safe-minimal" / "safe-network" → bcdedit + shutdown; on next normal
//!      boot the safeboot flag must be removed (we surface the un-do command
//!      in the Tauri response so the GUI can show it to the user).
//!   2. `list_restore_points()` — enumerate real Windows System Restore points
//!      via `Get-ComputerRestorePoint`.
//!   3. `revert_to_restore_point(sequence_number)` — `Restore-Computer` +
//!      `shutdown /r`; the restore actually runs during the next boot.
//!
//! Every command is admin-only and uses static PS scripts (the only
//! user-controlled value is `sequence_number`, validated as u32 in Rust).

use crate::tweaks::run_ps;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct RestorePoint {
    pub sequence_number: u32,
    pub description: String,
    pub creation_time: String,
    pub restore_point_type: String,
    pub event_type: String,
}

#[derive(Serialize)]
pub struct AdvancedRestartResult {
    pub success: bool,
    pub message: String,
    /// Only non-empty for the safe-mode modes: the command the user must
    /// run AFTER they're done in safe mode and want a normal boot back.
    pub undo_hint: String,
}

#[tauri::command]
pub async fn list_restore_points() -> Result<Vec<RestorePoint>, String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
try {
    $points = Get-ComputerRestorePoint -ErrorAction Stop
    if (-not $points) { '[]'; return }
    $arr = @($points | ForEach-Object {
        [pscustomobject]@{
            sequence_number    = [int]$_.SequenceNumber
            description        = [string]$_.Description
            creation_time      = $_.ConvertToDateTime($_.CreationTime).ToString('o')
            restore_point_type = [string]$_.RestorePointType
            event_type         = [string]$_.EventType
        }
    })
    ConvertTo-Json -InputObject $arr -Depth 4 -Compress
} catch {
    if ($_.Exception.Message -match 'System Restore is not enabled' -or
        $_.Exception.Message -match 'WMI:.*not found') {
        '[]'
    } else {
        Write-Error $_.Exception.Message
    }
}
"#;
    let res = run_ps(script);
    if !res.success {
        return Err(if !res.stderr.trim().is_empty() {
            res.stderr.trim().to_string()
        } else {
            format!("PowerShell exit {}", res.code)
        });
    }
    let stdout = res.stdout.trim();
    if stdout.is_empty() || stdout == "[]" {
        return Ok(Vec::new());
    }
    serde_json::from_str(stdout).map_err(|e| format!("parse restore-points JSON failed: {}", e))
}

#[tauri::command]
pub async fn revert_to_restore_point(sequence_number: u32) -> Result<String, String> {
    // sequence_number is u32 already validated by serde; embed directly.
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
try {{
    Restore-Computer -RestorePoint {seq} -ErrorAction Stop
    "queued"
}} catch {{
    Write-Error $_.Exception.Message
}}
"#,
        seq = sequence_number
    );
    let res = run_ps(&script);
    if !res.success {
        return Err(if !res.stderr.trim().is_empty() {
            res.stderr.trim().to_string()
        } else {
            format!("PowerShell exit {}", res.code)
        });
    }
    // Restore-Computer normally schedules a restart itself, but the behavior
    // is inconsistent across builds. Force the reboot ourselves with a
    // 10-second grace window so the GUI can show feedback before the OS goes
    // down. The restore actually runs as part of the next boot.
    let _ = run_ps("shutdown /r /t 10 /c 'Reclaim: restoring system to selected restore point' /f");
    Ok(res.stdout.trim().to_string())
}

#[tauri::command]
pub async fn advanced_restart(mode: String) -> Result<AdvancedRestartResult, String> {
    // Allowed modes — anything else is rejected at the Rust boundary so the
    // shell call sites remain static.
    match mode.as_str() {
        "menu" => {
            // /r restart, /o go into advanced startup options on next boot,
            // /t 5 grace seconds, /c message, /f force-close apps.
            let res =
                run_ps("shutdown /r /o /t 5 /c 'Reclaim: entering Advanced Startup' /f");
            if res.success {
                Ok(AdvancedRestartResult {
                    success: true,
                    message: "Rebooting into Advanced Startup menu in 5 seconds.".into(),
                    undo_hint: String::new(),
                })
            } else {
                Err(res.stderr.trim().to_string())
            }
        }
        "firmware" => {
            let res =
                run_ps("shutdown /r /fw /t 5 /c 'Reclaim: rebooting to UEFI firmware setup' /f");
            if res.success {
                Ok(AdvancedRestartResult {
                    success: true,
                    message: "Rebooting to UEFI firmware in 5 seconds.".into(),
                    undo_hint: String::new(),
                })
            } else {
                // /fw fails on legacy BIOS systems; surface clearly.
                Err(format!(
                    "Could not reboot to firmware setup. This usually means the platform is not UEFI, or the firmware does not advertise the OS Indications capability. Original error: {}",
                    res.stderr.trim()
                ))
            }
        }
        "safe-minimal" => set_safeboot_and_restart("Minimal"),
        "safe-network" => set_safeboot_and_restart("Network"),
        other => Err(format!("unknown restart mode: {}", other)),
    }
}

fn set_safeboot_and_restart(flavor: &'static str) -> Result<AdvancedRestartResult, String> {
    // Use a static lookup table — never interpolate the flavor into the
    // shell command, because bcdedit will accept arbitrary strings and we
    // want exactly two allowed values.
    let bcd_value = match flavor {
        "Minimal" => "minimal",
        "Network" => "network",
        _ => return Err(format!("bad flavor: {}", flavor)),
    };
    let script = format!(
        "bcdedit /set {{current}} safeboot {} | Out-Null; shutdown /r /t 5 /c 'Reclaim: rebooting into Safe Mode ({})' /f",
        bcd_value, flavor
    );
    let res = run_ps(&script);
    if res.success {
        Ok(AdvancedRestartResult {
            success: true,
            message: format!(
                "Rebooting into Safe Mode ({}) in 5 seconds. The boot flag is sticky — to get back to a normal boot, run the undo command below from an elevated prompt.",
                flavor
            ),
            undo_hint: "bcdedit /deletevalue {current} safeboot".into(),
        })
    } else {
        Err(res.stderr.trim().to_string())
    }
}
