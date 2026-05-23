use serde::{Deserialize, Serialize};

use crate::tweaks::{run_ps, PsResult};

#[derive(Serialize, Clone)]
pub struct OneDriveStatus {
    pub installed: bool,
    pub process_running: bool,
    pub sync_folder: Option<String>,
    pub redirected_documents: Option<String>,
    pub redirected_desktop: Option<String>,
    pub redirected_pictures: Option<String>,
}

#[tauri::command]
pub async fn onedrive_detect() -> Result<OneDriveStatus, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$status = [ordered]@{
    installed = $false
    process_running = $false
    sync_folder = $null
    redirected_documents = $null
    redirected_desktop = $null
    redirected_pictures = $null
}
if (Get-Process OneDrive) { $status.process_running = $true }

$od = $env:OneDriveConsumer
if (-not $od) { $od = $env:OneDrive }
if ($od) { $status.sync_folder = $od }

$exes = @(
    "$env:LOCALAPPDATA\Microsoft\OneDrive\OneDrive.exe",
    "$env:PROGRAMFILES\Microsoft OneDrive\OneDrive.exe"
)
foreach ($e in $exes) { if (Test-Path -LiteralPath $e) { $status.installed = $true; break } }

$ush = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
$paths = Get-ItemProperty -Path $ush
function Resolve-IfOnedrive($val) {
    if (-not $val) { return $null }
    $expanded = [Environment]::ExpandEnvironmentVariables($val)
    if ($expanded -like '*OneDrive*') { return $expanded } else { return $null }
}
$status.redirected_documents = Resolve-IfOnedrive $paths.Personal
$status.redirected_desktop = Resolve-IfOnedrive $paths.Desktop
$status.redirected_pictures = Resolve-IfOnedrive $paths.'My Pictures'

[pscustomobject]$status | ConvertTo-Json -Compress
"#;
    let r = run_ps(script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Err("Empty status payload".into());
    }
    let v: serde_json::Value =
        serde_json::from_str(out).map_err(|e| format!("JSON parse failed: {e}"))?;
    let opt_str = |k: &str| -> Option<String> {
        v.get(k).and_then(|x| x.as_str()).map(|s| s.to_string())
    };
    let opt_bool = |k: &str| -> bool {
        v.get(k).and_then(|x| x.as_bool()).unwrap_or(false)
    };
    Ok(OneDriveStatus {
        installed: opt_bool("installed"),
        process_running: opt_bool("process_running"),
        sync_folder: opt_str("sync_folder"),
        redirected_documents: opt_str("redirected_documents"),
        redirected_desktop: opt_str("redirected_desktop"),
        redirected_pictures: opt_str("redirected_pictures"),
    })
}

#[derive(Deserialize)]
pub struct BackupRequest {
    pub target_dir: String,
    pub items: Vec<String>, // absolute source paths
}

fn looks_like_safe_path(p: &str) -> bool {
    // Must be a non-empty absolute path with no quote or newline injection,
    // no parent-traversal token.
    !p.is_empty()
        && p.len() < 1024
        && !p.contains('\n')
        && !p.contains('\r')
        && !p.contains('"')
        && !p.contains("..")
        && p.contains(':')
}

#[tauri::command]
pub async fn onedrive_backup(req: BackupRequest) -> Result<PsResult, String> {
    if !looks_like_safe_path(&req.target_dir) {
        return Err("Invalid target directory".into());
    }
    if req.items.is_empty() {
        return Err("No folders selected for backup".into());
    }
    for it in &req.items {
        if !looks_like_safe_path(it) {
            return Err(format!("Rejected source path: {it}"));
        }
    }

    let mut script = String::new();
    script.push_str("$ErrorActionPreference = 'SilentlyContinue'\n");
    script.push_str(&format!(
        "$target = '{}'\n",
        req.target_dir.replace('\'', "''")
    ));
    script.push_str("if (-not (Test-Path -LiteralPath $target)) { New-Item -ItemType Directory -Force -Path $target | Out-Null }\n");
    for src in &req.items {
        let src_esc = src.replace('\'', "''");
        script.push_str(&format!(
            "$src = '{src_esc}'\n\
             $name = Split-Path -Leaf $src\n\
             $dst = Join-Path $target $name\n\
             Write-Host \">>> Backing up $src -> $dst\"\n\
             & robocopy $src $dst /E /R:1 /W:1 /XJ /NFL /NDL /NJH /NJS | Out-Null\n"
        ));
    }
    script.push_str("Write-Host '>>> Backup complete.'\n");
    Ok(run_ps(&script))
}

#[derive(Deserialize)]
pub struct UninstallRequest {
    pub disable_policy: bool,
    pub remove_leftovers: bool,
}

#[tauri::command]
pub async fn onedrive_uninstall(req: UninstallRequest) -> Result<PsResult, String> {
    let disable_policy = req.disable_policy;
    let remove_leftovers = req.remove_leftovers;
    let mut script = String::from("$ErrorActionPreference = 'SilentlyContinue'\n");

    // Stop OneDrive
    script.push_str("Write-Host '>>> Stopping OneDrive...'\n");
    script.push_str("taskkill /f /im OneDrive.exe 2>$null | Out-Null\n");

    // Run official uninstaller (both architectures, whichever exists)
    script.push_str("Write-Host '>>> Running OneDrive uninstaller...'\n");
    script.push_str(
        "$paths = @(\"$env:SystemRoot\\System32\\OneDriveSetup.exe\", \"$env:SystemRoot\\SysWOW64\\OneDriveSetup.exe\")\n\
         foreach ($p in $paths) {\n\
           if (Test-Path -LiteralPath $p) {\n\
             Start-Process -FilePath $p -ArgumentList '/uninstall' -Wait -NoNewWindow\n\
           }\n\
         }\n",
    );

    if remove_leftovers {
        script.push_str("Write-Host '>>> Removing leftover folders...'\n");
        script.push_str(
            "$leftovers = @(\n\
               \"$env:LOCALAPPDATA\\Microsoft\\OneDrive\",\n\
               \"$env:LOCALAPPDATA\\OneDrive\",\n\
               \"$env:PROGRAMDATA\\Microsoft OneDrive\",\n\
               'C:\\OneDriveTemp'\n\
             )\n\
             foreach ($d in $leftovers) {\n\
               if (Test-Path -LiteralPath $d) {\n\
                 Remove-Item -Recurse -Force -LiteralPath $d -ErrorAction SilentlyContinue\n\
               }\n\
             }\n",
        );
    }

    // Unpin OneDrive from Explorer sidebar
    script.push_str("Write-Host '>>> Unpinning from Explorer sidebar...'\n");
    script.push_str(
        "$cids = @(\n\
           'Registry::HKEY_CLASSES_ROOT\\CLSID\\{018D5C66-4533-4307-9B53-224DE2ED1FE6}',\n\
           'Registry::HKEY_CLASSES_ROOT\\Wow6432Node\\CLSID\\{018D5C66-4533-4307-9B53-224DE2ED1FE6}'\n\
         )\n\
         foreach ($k in $cids) {\n\
           if (Test-Path $k) { Set-ItemProperty -Path $k -Name 'System.IsPinnedToNameSpaceTree' -Value 0 -Type DWord -Force }\n\
         }\n",
    );

    if disable_policy {
        script.push_str("Write-Host '>>> Blocking re-install via group policy...'\n");
        script.push_str(
            "$pol = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\OneDrive'\n\
             if (-not (Test-Path $pol)) { New-Item -Path $pol -Force | Out-Null }\n\
             Set-ItemProperty -Path $pol -Name 'DisableFileSyncNGSC' -Value 1 -Type DWord -Force\n",
        );
    }

    script.push_str("Write-Host '>>> Restarting Explorer...'\n");
    script.push_str("Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue\n");
    script.push_str("Start-Sleep -Milliseconds 400\n");
    script.push_str("if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }\n");
    script.push_str("Write-Host '>>> OneDrive removed.'\n");

    Ok(run_ps(&script))
}
