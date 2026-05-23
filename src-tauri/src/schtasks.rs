use serde::{Deserialize, Serialize};

use crate::tweaks::{ps_parse_error, run_ps};

#[derive(Serialize, Clone)]
pub struct ScheduledTask {
    pub path: String,
    pub name: String,
    pub state: String,
    pub author: String,
    pub description: String,
    pub last_run: Option<String>,
    pub last_result: i64,
    pub next_run: Option<String>,
    pub triggers: String,
    pub actions: String,
}

const LIST_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
Get-ScheduledTask | ForEach-Object {
    $t = $_
    $info = $t | Get-ScheduledTaskInfo
    $triggers = if ($t.Triggers) {
        ($t.Triggers | ForEach-Object { ($_.CimClass.CimClassName -replace 'MSFT_Task','') -replace 'Trigger','' }) -join ', '
    } else { '' }
    $actions = if ($t.Actions) {
        ($t.Actions | ForEach-Object {
            if ($_.Execute) { Split-Path -Leaf $_.Execute } else { 'COM' }
        }) -join ', '
    } else { '' }
    [pscustomobject]@{
        path        = $t.TaskPath
        name        = $t.TaskName
        state       = $t.State.ToString()
        author      = if ($t.Author) { $t.Author } else { '' }
        description = if ($t.Description) { $t.Description } else { '' }
        last_run    = if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1) { $info.LastRunTime.ToString('o') } else { $null }
        last_result = [int64]$info.LastTaskResult
        next_run    = if ($info.NextRunTime -and $info.NextRunTime.Year -gt 1) { $info.NextRunTime.ToString('o') } else { $null }
        triggers    = $triggers
        actions     = $actions
    }
} | ConvertTo-Json -Compress -Depth 4
"#;

#[tauri::command]
pub async fn list_scheduled_tasks() -> Result<Vec<ScheduledTask>, String> {
    let r = run_ps(LIST_SCRIPT);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(vec![]);
    }
    let v: serde_json::Value = serde_json::from_str(out)
        .map_err(|e| ps_parse_error("Scheduled tasks", &e.to_string(), out, &r.stderr))?;
    let arr: Vec<serde_json::Value> = match v {
        serde_json::Value::Array(a) => a,
        other => vec![other],
    };
    let mut tasks = Vec::with_capacity(arr.len());
    for v in arr {
        let s = |k: &str| -> String {
            v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
        };
        let opt_s = |k: &str| -> Option<String> {
            v.get(k).and_then(|x| x.as_str()).map(|s| s.to_string())
        };
        let path = s("path");
        let name = s("name");
        if name.is_empty() {
            continue;
        }
        tasks.push(ScheduledTask {
            path,
            name,
            state: s("state"),
            author: s("author"),
            description: s("description"),
            last_run: opt_s("last_run"),
            last_result: v.get("last_result").and_then(|x| x.as_i64()).unwrap_or(0),
            next_run: opt_s("next_run"),
            triggers: s("triggers"),
            actions: s("actions"),
        });
    }
    Ok(tasks)
}

#[derive(Deserialize)]
pub struct TaskRef {
    pub path: String,
    pub name: String,
}

fn valid_task_ref(r: &TaskRef) -> Result<(), String> {
    if r.name.is_empty() || r.name.len() > 260 {
        return Err("Invalid task name".into());
    }
    if r.path.is_empty() || r.path.len() > 1024 {
        return Err("Invalid task path".into());
    }
    if r.path.contains('\'')
        || r.name.contains('\'')
        || r.path.contains('\n')
        || r.name.contains('\n')
        || r.path.contains('\r')
        || r.name.contains('\r')
        || r.path.contains('"')
        || r.name.contains('"')
    {
        return Err("Task ref contains forbidden characters".into());
    }
    if !r.path.starts_with('\\') {
        return Err("Task path must be absolute (start with \\)".into());
    }
    Ok(())
}

fn schtask_call(verb: &str, r: &TaskRef, extra: &str) -> Result<(), String> {
    valid_task_ref(r)?;
    let script = format!(
        "$ErrorActionPreference='Stop'; {verb} -TaskPath '{path}' -TaskName '{name}' {extra}",
        path = r.path,
        name = r.name,
    );
    let res = run_ps(&script);
    if !res.success {
        return Err(if res.stderr.is_empty() {
            res.stdout
        } else {
            res.stderr
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn set_scheduled_task(task: TaskRef, enabled: bool) -> Result<(), String> {
    let verb = if enabled {
        "Enable-ScheduledTask"
    } else {
        "Disable-ScheduledTask"
    };
    schtask_call(verb, &task, "| Out-Null")
}

#[tauri::command]
pub async fn run_scheduled_task(task: TaskRef) -> Result<(), String> {
    schtask_call("Start-ScheduledTask", &task, "")
}

#[tauri::command]
pub async fn delete_scheduled_task(task: TaskRef) -> Result<(), String> {
    schtask_call("Unregister-ScheduledTask", &task, "-Confirm:$false")
}
