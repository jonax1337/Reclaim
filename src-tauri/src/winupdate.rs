use serde::Serialize;

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
