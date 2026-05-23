use serde::Serialize;

use crate::tweaks::{ps_parse_error, run_ps, PsResult};

#[derive(Serialize, Clone)]
pub struct RecallStatus {
    pub data_present: bool,
    pub data_path: Option<String>,
    pub size_bytes: u64,
    pub snapshot_count: u64,
    pub appx_installed: bool,
    pub policy_disabled: bool,
}

const STATUS_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
$root = Join-Path $env:LOCALAPPDATA 'CoreAIPlatform.00'
$present = $false
$size = 0
$count = 0
$found = $null
if (Test-Path -LiteralPath $root) {
    $found = $root
    $present = $true
    $items = Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue
    if ($items) {
        $size = ($items | Measure-Object -Sum Length).Sum
        $count = ($items | Where-Object { $_.Extension -in '.jfif','.jpg','.jpeg','.png','.webp' }).Count
    }
}
$appxInstalled = $false
try {
    $pkg = Get-AppxPackage -Name 'MicrosoftWindows.Client.AIX' -ErrorAction SilentlyContinue
    if ($pkg) { $appxInstalled = $true }
} catch {}
$policy = Get-ItemProperty -Path 'HKLM:\Software\Policies\Microsoft\Windows\WindowsAI' -Name 'DisableAIDataAnalysis' -ErrorAction SilentlyContinue
$policyDisabled = if ($policy) { [int]$policy.DisableAIDataAnalysis -eq 1 } else { $false }
[pscustomobject]@{
    data_present     = $present
    data_path        = $found
    size_bytes       = [int64]$size
    snapshot_count   = [int64]$count
    appx_installed   = $appxInstalled
    policy_disabled  = $policyDisabled
} | ConvertTo-Json -Compress
"#;

#[tauri::command]
pub async fn recall_status() -> Result<RecallStatus, String> {
    let r = run_ps(STATUS_SCRIPT);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Err("Empty recall status payload".into());
    }
    let v: serde_json::Value = serde_json::from_str(out)
        .map_err(|e| ps_parse_error("Recall status", &e.to_string(), out, &r.stderr))?;
    let opt_s = |k: &str| -> Option<String> {
        v.get(k).and_then(|x| x.as_str()).map(|s| s.to_string())
    };
    Ok(RecallStatus {
        data_present: v.get("data_present").and_then(|x| x.as_bool()).unwrap_or(false),
        data_path: opt_s("data_path"),
        size_bytes: v.get("size_bytes").and_then(|x| x.as_u64()).unwrap_or(0),
        snapshot_count: v
            .get("snapshot_count")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        appx_installed: v
            .get("appx_installed")
            .and_then(|x| x.as_bool())
            .unwrap_or(false),
        policy_disabled: v
            .get("policy_disabled")
            .and_then(|x| x.as_bool())
            .unwrap_or(false),
    })
}

#[tauri::command]
pub async fn recall_wipe(also_remove_appx: bool, also_set_policy: bool) -> Result<PsResult, String> {
    let mut script = String::from("$ErrorActionPreference = 'SilentlyContinue'\n");
    script.push_str("Write-Host '>>> Stopping Recall-related processes...'\n");
    script.push_str(
        "$names = @('AIHost','ClickToDoSvc','StartMenuExperienceHost','SearchHost')\n\
         foreach ($n in $names) { Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }\n",
    );
    script.push_str("Start-Sleep -Milliseconds 400\n");
    script.push_str("Write-Host '>>> Wiping CoreAIPlatform.00 data...'\n");
    script.push_str(
        "$root = Join-Path $env:LOCALAPPDATA 'CoreAIPlatform.00'\n\
         if (Test-Path -LiteralPath $root) {\n\
           try {\n\
             takeown.exe /F $root /R /D Y | Out-Null\n\
             icacls.exe $root /grant \"$($env:USERNAME):(F)\" /T /Q | Out-Null\n\
             Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction Stop\n\
             Write-Host \"Deleted $root\"\n\
           } catch {\n\
             Write-Host \"Failed to delete: $_\"\n\
           }\n\
         } else {\n\
           Write-Host 'No CoreAIPlatform.00 directory found — nothing to wipe.'\n\
         }\n",
    );
    if also_set_policy {
        script.push_str("Write-Host '>>> Enabling DisableAIDataAnalysis policy...'\n");
        script.push_str(
            "$pol = 'HKLM:\\Software\\Policies\\Microsoft\\Windows\\WindowsAI'\n\
             if (-not (Test-Path $pol)) { New-Item -Path $pol -Force | Out-Null }\n\
             Set-ItemProperty -Path $pol -Name 'DisableAIDataAnalysis' -Value 1 -Type DWord -Force\n",
        );
    }
    if also_remove_appx {
        script.push_str("Write-Host '>>> Removing Recall AppX package(s)...'\n");
        script.push_str(
            "$names = @('MicrosoftWindows.Client.AIX')\n\
             foreach ($n in $names) {\n\
               Get-AppxPackage -Name $n -ErrorAction SilentlyContinue | ForEach-Object {\n\
                 try { Remove-AppxPackage -Package $_.PackageFullName -ErrorAction Stop; Write-Host \"Removed $($_.PackageFullName)\" } catch { Write-Host \"Removal failed: $_\" }\n\
               }\n\
               Get-AppxProvisionedPackage -Online | Where-Object { $_.DisplayName -eq $n } | ForEach-Object {\n\
                 try { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName | Out-Null; Write-Host \"Deprovisioned $($_.PackageName)\" } catch { Write-Host \"Deprovision failed: $_\" }\n\
               }\n\
             }\n",
        );
    }
    script.push_str("Write-Host '>>> Done.'\n");
    Ok(run_ps(&script))
}
