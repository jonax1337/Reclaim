// SYSTEM-context persistence: a single scheduled task that re-applies the
// user's tracked admin-tweaks (HKLM + shell ops) at logon plus on a repeating
// interval. The task runs as SYSTEM with RunLevel Highest, so HKLM + shell
// ops succeed without any UAC prompt visible to the user.
//
// v0.15.2 model: one task `\Reclaim\Persist-Current` for ALL tracked admin
// tweaks (ids embedded in the action arguments), instead of v0.15.1's
// `\Reclaim\Persist-<profile-id>` per profile. Whenever the user toggles a
// tweak on/off or changes the global interval, the GUI re-installs the task
// with the updated id list — `-Force` makes the Register call idempotent.
//
// The HKCU side of persistence stays in the tray companion (checker.ts).
// Splitting this way avoids ever writing HKCU under S-1-5-18 (SYSTEM's
// profile) — the `--admin-only` CLI flag enforces it.

use serde::{Deserialize, Serialize};

use crate::tweaks::run_ps;

const TASK_PATH: &str = "\\Reclaim\\";
const TASK_NAME: &str = "Persist-Current";

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
    /// Number of tweak ids embedded in the task's argument list. 0 when the
    /// task is installed but currently scheduled to apply nothing (kept around
    /// so the GUI can hint "you have admin persistence on but nothing tracked").
    #[serde(rename = "tweakCount", default)]
    pub tweak_count: usize,
}

fn validate_tweak_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 128 {
        return Err(format!("invalid tweak id length: {id:?}"));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("tweak id contains forbidden characters: {id:?}"));
    }
    Ok(())
}

fn current_exe_path() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(exe.to_string_lossy().replace('\'', "''"))
}

/// Install (or replace) the singleton SYSTEM scheduled task with the given
/// tweak id list. Empty list → fall through to uninstall (no point in running
/// a task that applies nothing). Idempotent via `-Force`.
#[tauri::command]
pub async fn persistence_install_task(
    tweak_ids: Vec<String>,
    interval_hours: u32,
) -> Result<(), String> {
    if tweak_ids.is_empty() {
        // The frontend should call uninstall in this case, but be tolerant.
        return persistence_uninstall_task().await;
    }
    for id in &tweak_ids {
        validate_tweak_id(id)?;
    }
    let exe = current_exe_path()?;
    let interval = interval_hours.clamp(1, 168);
    let ids_joined = tweak_ids.join(",");

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$action = New-ScheduledTaskAction -Execute '{exe}' -Argument '--apply-tweak {ids} --admin-only --silent --no-elevate'
$trigger1 = New-ScheduledTaskTrigger -AtLogOn
$trigger2 = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(5)) -RepetitionInterval (New-TimeSpan -Hours {interval})
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskPath '{path}' -TaskName '{name}' -Action $action -Trigger @($trigger1,$trigger2) -Principal $principal -Settings $settings -Description 'Reclaim auto-persist - re-applies tracked admin tweaks after Windows updates' -Force | Out-Null
"#,
        exe = exe,
        ids = ids_joined,
        interval = interval,
        path = TASK_PATH,
        name = TASK_NAME,
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

/// Remove the singleton task. Safe to call when no task exists.
#[tauri::command]
pub async fn persistence_uninstall_task() -> Result<(), String> {
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue'; Unregister-ScheduledTask -TaskPath '{path}' -TaskName '{name}' -Confirm:$false",
        path = TASK_PATH,
        name = TASK_NAME,
    );
    let r = run_ps(&script);
    if !r.success && !r.stderr.contains("does not exist") {
        return Err(if r.stderr.trim().is_empty() {
            r.stdout
        } else {
            r.stderr
        });
    }
    Ok(())
}

/// Read Task Scheduler state for the singleton task. Also parses the action
/// arguments to count how many tweak ids are currently embedded — useful for
/// the GUI to detect drift between service.json and the actual task command.
#[tauri::command]
pub async fn persistence_task_status() -> Result<PersistenceTaskStatus, String> {
    let script = format!(
        r#"
$ErrorActionPreference='SilentlyContinue'
$t = Get-ScheduledTask -TaskPath '{path}' -TaskName '{name}'
if ($null -eq $t) {{
    @{{ installed = $false; tweakCount = 0 }} | ConvertTo-Json -Compress
}} else {{
    $info = $t | Get-ScheduledTaskInfo
    $count = 0
    foreach ($a in $t.Actions) {{
        if ($a.Arguments) {{
            $m = [regex]::Match($a.Arguments, '--apply-tweak\s+([^\s]+)')
            if ($m.Success) {{
                $count = ($m.Groups[1].Value -split ',').Count
            }}
        }}
    }}
    @{{
        installed = $true
        state = $t.State.ToString()
        lastRun = if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1) {{ $info.LastRunTime.ToString('o') }} else {{ $null }}
        lastResult = [int64]$info.LastTaskResult
        nextRun = if ($info.NextRunTime -and $info.NextRunTime.Year -gt 1) {{ $info.NextRunTime.ToString('o') }} else {{ $null }}
        tweakCount = $count
    }} | ConvertTo-Json -Compress
}}
"#,
        path = TASK_PATH,
        name = TASK_NAME,
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

/// Trigger the singleton task immediately. Equivalent to right-clicking →
/// "Run" in Task Scheduler.
#[tauri::command]
pub async fn persistence_run_task_now() -> Result<(), String> {
    let script = format!(
        "$ErrorActionPreference='Stop'; Start-ScheduledTask -TaskPath '{path}' -TaskName '{name}'",
        path = TASK_PATH,
        name = TASK_NAME,
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

/// One-shot cleanup for v0.15.1 leftovers: tear down any per-profile
/// `\Reclaim\Persist-<profile-id>` tasks. Idempotent; returns the count of
/// tasks actually removed so the migration code can log it.
#[tauri::command]
pub async fn persistence_cleanup_legacy_tasks() -> Result<usize, String> {
    // List every task under \Reclaim\ that isn't the new singleton, then
    // unregister each one. The static script does the filtering — no string
    // interpolation of any user-controlled value here.
    let script = format!(
        r#"
$ErrorActionPreference='Stop'
$removed = 0
Get-ScheduledTask -TaskPath '{path}' -ErrorAction SilentlyContinue | Where-Object {{ $_.TaskName -ne '{singleton}' -and $_.TaskName -like 'Persist-*' }} | ForEach-Object {{
    try {{ Unregister-ScheduledTask -TaskPath $_.TaskPath -TaskName $_.TaskName -Confirm:$false; $removed++ }} catch {{}}
}}
$removed
"#,
        path = TASK_PATH,
        singleton = TASK_NAME,
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.trim().is_empty() {
            r.stdout
        } else {
            r.stderr
        });
    }
    Ok(r.stdout.trim().parse().unwrap_or(0))
}
