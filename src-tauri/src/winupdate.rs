use serde::Serialize;
use tauri::ipc::Channel;

use crate::maintenance::{run_streamed, StreamEvent};
use crate::tweaks::run_ps;

#[derive(Serialize, Clone)]
pub struct WuUpdate {
    pub id: String,
    pub revision: i32,
    pub title: String,
    pub description: String,
    pub kbs: String,
    pub severity: String,
    pub size_mb: f64,
    pub categories: String,
    pub is_downloaded: bool,
    pub is_driver: bool,
    pub is_optional: bool,
    pub reboot_required: i32,
}

#[derive(Serialize)]
pub struct WuInstallResult {
    pub ok: bool,
    pub installed: u32,
    pub failed: u32,
    pub reboot_required: bool,
    pub message: String,
}

#[tauri::command]
pub async fn search_windows_updates(driver_only: bool) -> Result<Vec<WuUpdate>, String> {
    let criteria = if driver_only {
        "IsInstalled=0 AND Type='Driver'"
    } else {
        "IsInstalled=0"
    };
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
try {{
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $searcher.Online = $true
    $result = $searcher.Search("{criteria}")
}} catch {{
    Write-Error "Search failed: $_"
    exit 1
}}
$entries = New-Object System.Collections.ArrayList
foreach ($u in $result.Updates) {{
    $isDriver = $false
    foreach ($c in $u.Categories) {{
        if ($c.Type -eq 'Driver') {{ $isDriver = $true; break }}
    }}
    $catNames = @()
    foreach ($c in $u.Categories) {{ $catNames += $c.Name }}
    [void]$entries.Add(@{{
        id = [string]$u.Identity.UpdateID
        revision = [int]$u.Identity.RevisionNumber
        title = [string]$u.Title
        description = [string]$u.Description
        kbs = (($u.KBArticleIDs) -join ', ')
        severity = if ($u.MsrcSeverity) {{ [string]$u.MsrcSeverity }} else {{ '' }}
        sizeMB = [Math]::Round([double]$u.MaxDownloadSize / 1MB, 1)
        categories = ($catNames -join ', ')
        isDownloaded = [bool]$u.IsDownloaded
        isDriver = $isDriver
        isOptional = [bool]$u.BrowseOnly
        rebootRequired = [int]$u.InstallationBehavior.RebootBehavior
    }})
}}
if ($entries.Count -eq 0) {{ '[]' }} else {{ ,$entries | ConvertTo-Json -Compress -Depth 4 }}
"#,
        criteria = criteria
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(r.stderr.trim().to_string());
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
    let mut updates = Vec::with_capacity(arr.len());
    for v in arr {
        updates.push(WuUpdate {
            id: v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            revision: v.get("revision").and_then(|x| x.as_i64()).unwrap_or(0) as i32,
            title: v.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            description: v
                .get("description")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            kbs: v.get("kbs").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            severity: v
                .get("severity")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            size_mb: v.get("sizeMB").and_then(|x| x.as_f64()).unwrap_or(0.0),
            categories: v
                .get("categories")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            is_downloaded: v
                .get("isDownloaded")
                .and_then(|x| x.as_bool())
                .unwrap_or(false),
            is_driver: v.get("isDriver").and_then(|x| x.as_bool()).unwrap_or(false),
            is_optional: v
                .get("isOptional")
                .and_then(|x| x.as_bool())
                .unwrap_or(false),
            reboot_required: v
                .get("rebootRequired")
                .and_then(|x| x.as_i64())
                .unwrap_or(0) as i32,
        });
    }
    Ok(updates)
}

#[tauri::command]
pub async fn install_windows_updates(ids: Vec<String>) -> Result<WuInstallResult, String> {
    if ids.is_empty() {
        return Ok(WuInstallResult {
            ok: false,
            installed: 0,
            failed: 0,
            reboot_required: false,
            message: "No updates selected".into(),
        });
    }
    let ids_quoted: Vec<String> = ids
        .iter()
        .map(|id| format!("'{}'", id.replace('\'', "''")))
        .collect();
    let ids_array = format!("@({})", ids_quoted.join(","));
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$ids = {ids}
try {{
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $result = $searcher.Search('IsInstalled=0')
    $toInstall = New-Object -ComObject Microsoft.Update.UpdateColl
    foreach ($u in $result.Updates) {{
        if ($ids -contains [string]$u.Identity.UpdateID) {{
            if (-not $u.EulaAccepted) {{ try {{ $u.AcceptEula() }} catch {{}} }}
            [void]$toInstall.Add($u)
        }}
    }}
    if ($toInstall.Count -eq 0) {{
        @{{ ok = $false; installed = 0; failed = 0; rebootRequired = $false; message = 'No matching updates found' }} | ConvertTo-Json -Compress
        exit
    }}
    $downloader = $session.CreateUpdateDownloader()
    $downloader.Updates = $toInstall
    $dlResult = $downloader.Download()
    $readyColl = New-Object -ComObject Microsoft.Update.UpdateColl
    foreach ($u in $toInstall) {{ if ($u.IsDownloaded) {{ [void]$readyColl.Add($u) }} }}
    if ($readyColl.Count -eq 0) {{
        @{{ ok = $false; installed = 0; failed = $toInstall.Count; rebootRequired = $false; message = 'Download failed' }} | ConvertTo-Json -Compress
        exit
    }}
    $installer = $session.CreateUpdateInstaller()
    $installer.Updates = $readyColl
    $installResult = $installer.Install()
    $installed = 0
    $failed = 0
    for ($i = 0; $i -lt $readyColl.Count; $i++) {{
        $code = $installResult.GetUpdateResult($i).ResultCode
        # 2 = Succeeded, 3 = SucceededWithErrors
        if ($code -eq 2 -or $code -eq 3) {{ $installed++ }} else {{ $failed++ }}
    }}
    @{{
        ok = $true
        installed = $installed
        failed = $failed
        rebootRequired = [bool]$installResult.RebootRequired
        message = "Installed $installed of $($readyColl.Count)"
    }} | ConvertTo-Json -Compress
}} catch {{
    @{{ ok = $false; installed = 0; failed = 0; rebootRequired = $false; message = "Error: $_" }} | ConvertTo-Json -Compress
}}
"#,
        ids = ids_array
    );
    let r = run_ps(&script);
    if !r.success && r.stdout.trim().is_empty() {
        return Err(r.stderr.trim().to_string());
    }
    let out = r.stdout.trim();
    let v: serde_json::Value =
        serde_json::from_str(out).map_err(|e| format!("JSON parse failed: {}", e))?;
    Ok(WuInstallResult {
        ok: v.get("ok").and_then(|x| x.as_bool()).unwrap_or(false),
        installed: v.get("installed").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
        failed: v.get("failed").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
        reboot_required: v
            .get("rebootRequired")
            .and_then(|x| x.as_bool())
            .unwrap_or(false),
        message: v
            .get("message")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

fn is_valid_update_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '{' || c == '}')
}

/// Streaming variant of `install_windows_updates`. Emits one JSON line per
/// progress tick on the channel so the UI can render per-update phase + %.
///
/// Event shapes (each `data` field is a single-line JSON object):
/// - `{"t":"queued","id":"<guid>","index":i,"total":N,"title":"..."}`
/// - `{"t":"download_start","total":N}`
/// - `{"t":"download_progress","percent":P,"currentIndex":i,"currentPercent":Q}`
/// - `{"t":"download_done","id":"<guid>","index":i,"ok":bool,"code":int}`
/// - `{"t":"install_start","total":N}`
/// - `{"t":"install_progress","percent":P,"currentIndex":i,"currentPercent":Q}`
/// - `{"t":"install_done","id":"<guid>","index":i,"ok":bool,"code":int}`
/// - `{"t":"finished","installed":N,"failed":M,"rebootRequired":bool,"message":"..."}`
/// - `{"t":"info","message":"..."}` | `{"t":"error","message":"..."}`
#[tauri::command]
pub async fn install_windows_updates_stream(
    ids: Vec<String>,
    on_event: Channel<StreamEvent>,
) -> Result<i32, String> {
    if ids.is_empty() {
        return Err("No updates selected".into());
    }
    for id in &ids {
        if !is_valid_update_id(id) {
            return Err(format!("Rejected update id: {id}"));
        }
    }
    let ids_quoted: Vec<String> = ids.iter().map(|id| format!("'{}'", id)).collect();
    let ids_array = format!("@({})", ids_quoted.join(","));

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$ids = {ids_array}

function Emit($obj) {{
    $json = $obj | ConvertTo-Json -Compress -Depth 4
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}}

try {{
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $search = $searcher.Search('IsInstalled=0')
    $coll = New-Object -ComObject Microsoft.Update.UpdateColl
    $orderedIds = @()
    $titles = @{{}}
    foreach ($u in $search.Updates) {{
        if ($ids -contains [string]$u.Identity.UpdateID) {{
            if (-not $u.EulaAccepted) {{ try {{ $u.AcceptEula() }} catch {{}} }}
            [void]$coll.Add($u)
            $orderedIds += [string]$u.Identity.UpdateID
            $titles[[string]$u.Identity.UpdateID] = [string]$u.Title
        }}
    }}
    if ($coll.Count -eq 0) {{
        Emit @{{ t = 'finished'; installed = 0; failed = 0; rebootRequired = $false; message = 'No matching updates found' }}
        exit 0
    }}
    $total = $coll.Count
    for ($i = 0; $i -lt $total; $i++) {{
        Emit @{{ t = 'queued'; id = $orderedIds[$i]; index = $i; total = $total; title = $titles[$orderedIds[$i]] }}
    }}

    # Download phase — try async BeginDownload for live progress; fall back to sync Download() if the COM call rejects null callbacks.
    $downloader = $session.CreateUpdateDownloader()
    $downloader.Updates = $coll
    Emit @{{ t = 'download_start'; total = $total }}
    $dlResult = $null
    try {{
        $dlJob = $downloader.BeginDownload($null, $null, $null)
        while (-not $dlJob.IsCompleted) {{
            Start-Sleep -Milliseconds 600
            try {{
                $p = $dlJob.GetProgress()
                Emit @{{
                    t = 'download_progress'
                    percent = [int]$p.PercentComplete
                    currentIndex = [int]$p.CurrentUpdateIndex
                    currentPercent = [int]$p.CurrentUpdatePercentComplete
                }}
            }} catch {{}}
        }}
        $dlResult = $downloader.EndDownload($dlJob)
    }} catch {{
        Emit @{{ t = 'info'; message = 'Async download unavailable, falling back to synchronous download' }}
        $dlResult = $downloader.Download()
    }}
    for ($i = 0; $i -lt $coll.Count; $i++) {{
        $code = $dlResult.GetUpdateResult($i).ResultCode
        $ok = ($code -eq 2 -or $code -eq 3)
        Emit @{{ t = 'download_done'; id = $orderedIds[$i]; index = $i; ok = $ok; code = [int]$code }}
    }}

    # Install phase — only updates that actually downloaded.
    $readyColl = New-Object -ComObject Microsoft.Update.UpdateColl
    $readyIds = @()
    for ($i = 0; $i -lt $coll.Count; $i++) {{
        if ($coll.Item($i).IsDownloaded) {{
            [void]$readyColl.Add($coll.Item($i))
            $readyIds += $orderedIds[$i]
        }}
    }}
    if ($readyColl.Count -eq 0) {{
        Emit @{{ t = 'finished'; installed = 0; failed = $coll.Count; rebootRequired = $false; message = 'Download failed for all updates' }}
        exit 0
    }}

    $installer = $session.CreateUpdateInstaller()
    $installer.Updates = $readyColl
    Emit @{{ t = 'install_start'; total = $readyColl.Count }}
    $instResult = $null
    try {{
        $instJob = $installer.BeginInstall($null, $null, $null)
        while (-not $instJob.IsCompleted) {{
            Start-Sleep -Milliseconds 600
            try {{
                $p = $instJob.GetProgress()
                Emit @{{
                    t = 'install_progress'
                    percent = [int]$p.PercentComplete
                    currentIndex = [int]$p.CurrentUpdateIndex
                    currentPercent = [int]$p.CurrentUpdatePercentComplete
                }}
            }} catch {{}}
        }}
        $instResult = $installer.EndInstall($instJob)
    }} catch {{
        Emit @{{ t = 'info'; message = 'Async install unavailable, falling back to synchronous install' }}
        $instResult = $installer.Install()
    }}
    $installed = 0
    $failed = 0
    for ($i = 0; $i -lt $readyColl.Count; $i++) {{
        $code = $instResult.GetUpdateResult($i).ResultCode
        $ok = ($code -eq 2 -or $code -eq 3)
        if ($ok) {{ $installed++ }} else {{ $failed++ }}
        Emit @{{ t = 'install_done'; id = $readyIds[$i]; index = $i; ok = $ok; code = [int]$code }}
    }}
    $failed += ($coll.Count - $readyColl.Count)
    Emit @{{
        t = 'finished'
        installed = $installed
        failed = $failed
        rebootRequired = [bool]$instResult.RebootRequired
        message = "Installed $installed of $($coll.Count)"
    }}
}} catch {{
    Emit @{{ t = 'error'; message = "$_" }}
    exit 1
}}
"#,
        ids_array = ids_array
    );

    let event_clone = on_event.clone();
    let exit = tokio::task::spawn_blocking(move || run_streamed(script, event_clone))
        .await
        .map_err(|e| format!("task join failed: {e}"))??;
    let _ = on_event.send(StreamEvent {
        kind: "exit".into(),
        data: exit.to_string(),
        progress: false,
    });
    Ok(exit)
}
