// SYSTEM-context persistence: per-profile scheduled tasks that run
// `reclaim.exe --apply-profile <id> --admin-only --silent --no-elevate`
// at logon plus on a repeating interval. The task runs as the SYSTEM
// principal with RunLevel Highest, so HKLM + shell ops succeed without
// any UAC prompt visible to the user.
//
// Why a separate task per profile (instead of one task with a list of
// profile ids): each profile is a unit the user toggles independently;
// having one task per profile lets the user disable / re-arm them
// individually via the GUI without re-creating the others, and lets
// Task Scheduler track Last-Run / Next-Run state per profile.
//
// The HKCU side of persistence stays in the tray companion (checker.ts).
// Splitting it this way avoids the trap of writing HKCU under S-1-5-18
// (SYSTEM's profile) and avoids ever needing to prompt the user for UAC
// at every Windows login.

use serde::{Deserialize, Serialize};

use crate::tweaks::run_ps;

/// Single task scope used by every Reclaim persistence task. Anchored under
/// `\Reclaim\` so a sysadmin can find / disable them all at once via
/// `Get-ScheduledTask -TaskPath '\Reclaim\*'`.
const TASK_PATH: &str = "\\Reclaim\\";
const TASK_NAME_PREFIX: &str = "Persist-";

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PersistenceTaskStatus {
    pub installed: bool,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(rename = "lastRun", default)]
    pub last_run: Option<String>,
    #[serde(rename = "lastResult", default)]
    pub last_result: Option<i64>,
    #[serde(rename = "nextRun", default)]
    pub next_run: Option<String>,
}

/// Profile ids come from the TypeScript catalog (kebab-case) and from custom
/// profiles (timestamp-based ids). Both contain only ASCII alphanumerics, `-`,
/// `_` and digits. Anything else is rejected before we ever splice it into a
/// PowerShell argument.
fn validate_profile_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 128 {
        return Err("invalid profile id length".into());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("profile id contains forbidden characters".into());
    }
    Ok(())
}

fn task_name_for(profile_id: &str) -> String {
    format!("{TASK_NAME_PREFIX}{profile_id}")
}

fn current_exe_path() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(exe.to_string_lossy().replace('\'', "''"))
}

/// Install (or replace) the SYSTEM scheduled task for one profile. Idempotent:
/// passing `-Force` to `Register-ScheduledTask` overwrites an existing task
/// with the same TaskPath/TaskName.
#[tauri::command]
pub async fn persistence_install_task(
    profile_id: String,
    profile_name: String,
    interval_hours: u32,
) -> Result<(), String> {
    validate_profile_id(&profile_id)?;
    let exe = current_exe_path()?;
    let interval = interval_hours.clamp(1, 168);
    let task_name = task_name_for(&profile_id);
    // Display name surfaced in Task Scheduler's Description column. Plain text;
    // single-quote escape against the rare profile with an apostrophe.
    let display_name = profile_name.replace('\'', "''");

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$action = New-ScheduledTaskAction -Execute '{exe}' -Argument '--apply-profile {pid} --admin-only --silent --no-elevate'
$trigger1 = New-ScheduledTaskTrigger -AtLogOn
$trigger2 = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(5)) -RepetitionInterval (New-TimeSpan -Hours {interval})
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskPath '{path}' -TaskName '{name}' -Action $action -Trigger @($trigger1,$trigger2) -Principal $principal -Settings $settings -Description 'Reclaim persistence - re-applies admin tweaks from profile "{display}" after Windows updates' -Force | Out-Null
"#,
        exe = exe,
        pid = profile_id,
        interval = interval,
        path = TASK_PATH,
        name = task_name,
        display = display_name,
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.trim().is_empty() {
            r.stdout
        } else {
            r.stderr
        });
    }
    Ok(())
}

/// Remove the SYSTEM task for one profile. Safe to call when the task does not
/// exist — we swallow the "Cannot find" error.
#[tauri::command]
pub async fn persistence_uninstall_task(profile_id: String) -> Result<(), String> {
    validate_profile_id(&profile_id)?;
    let task_name = task_name_for(&profile_id);
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue'; Unregister-ScheduledTask -TaskPath '{path}' -TaskName '{name}' -Confirm:$false",
        path = TASK_PATH,
        name = task_name,
    );
    let r = run_ps(&script);
    // Unregister-ScheduledTask returns success even when nothing matched (with
    // -ErrorAction SilentlyContinue). Treat actual stderr as failure only when
    // the task did exist and removal failed.
    if !r.success && !r.stderr.contains("does not exist") {
        return Err(if r.stderr.trim().is_empty() {
            r.stdout
        } else {
            r.stderr
        });
    }
    Ok(())
}

/// Query Task Scheduler for the current state of one profile's task.
/// Returns `{installed: false}` when no task exists.
#[tauri::command]
pub async fn persistence_task_status(profile_id: String) -> Result<PersistenceTaskStatus, String> {
    validate_profile_id(&profile_id)?;
    let task_name = task_name_for(&profile_id);
    let script = format!(
        r#"
$ErrorActionPreference='SilentlyContinue'
$t = Get-ScheduledTask -TaskPath '{path}' -TaskName '{name}'
if ($null -eq $t) {{
    @{{ installed = $false }} | ConvertTo-Json -Compress
}} else {{
    $info = $t | Get-ScheduledTaskInfo
    @{{
        installed = $true
        state = $t.State.ToString()
        lastRun = if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1) {{ $info.LastRunTime.ToString('o') }} else {{ $null }}
        lastResult = [int64]$info.LastTaskResult
        nextRun = if ($info.NextRunTime -and $info.NextRunTime.Year -gt 1) {{ $info.NextRunTime.ToString('o') }} else {{ $null }}
    }} | ConvertTo-Json -Compress
}}
"#,
        path = TASK_PATH,
        name = task_name,
    );
    let r = run_ps(&script);
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(PersistenceTaskStatus::default());
    }
    serde_json::from_str(out).map_err(|e| {
        format!(
            "task status parse failed: {e} (stdout={}, stderr={})",
            out, r.stderr
        )
    })
}

/// Trigger one profile's task immediately. Equivalent to right-clicking →
/// "Run" in Task Scheduler. Useful for "Test now" buttons in the UI.
#[tauri::command]
pub async fn persistence_run_task_now(profile_id: String) -> Result<(), String> {
    validate_profile_id(&profile_id)?;
    let task_name = task_name_for(&profile_id);
    let script = format!(
        "$ErrorActionPreference='Stop'; Start-ScheduledTask -TaskPath '{path}' -TaskName '{name}'",
        path = TASK_PATH,
        name = task_name,
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.trim().is_empty() {
            r.stdout
        } else {
            r.stderr
        });
    }
    Ok(())
}
