use serde::Serialize;
#[cfg(windows)]
use tauri::ipc::Channel;

#[cfg(windows)]
use crate::maintenance::{run_pty_script, StreamEvent};
#[cfg(windows)]
use crate::tweaks::run_ps;

#[derive(Debug, Serialize, Clone)]
pub struct DevFeature {
    pub name: String,
    pub display_name: String,
    pub category: String,
    pub description: String,
    pub state: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct WslDistro {
    pub name: String,
    pub state: String,
    pub version: u32,
    pub default: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct DevDriveInfo {
    pub supported: bool,
    pub build: u32,
    pub note: String,
}

/// Tuple: (DISM feature name, label, category, short description).
/// The first three are also embedded into the Rust binary; only entries in this
/// list are accepted by `set_optional_feature_stream` (allow-list).
const FEATURE_NAMES: &[(&str, &str, &str, &str)] = &[
    (
        "Microsoft-Windows-Subsystem-Linux",
        "Windows Subsystem for Linux (WSL)",
        "wsl",
        "Core WSL platform. Required for running Linux distros via the wsl.exe CLI.",
    ),
    (
        "VirtualMachinePlatform",
        "Virtual Machine Platform",
        "wsl",
        "Hyper-V-based virtualization layer used by WSL 2, Windows Sandbox and Hyper-V containers.",
    ),
    (
        "HypervisorPlatform",
        "Windows Hypervisor Platform",
        "hyperv",
        "Third-party hypervisor API (used by VirtualBox, Docker Desktop, Android emulators).",
    ),
    (
        "Microsoft-Hyper-V-All",
        "Hyper-V",
        "hyperv",
        "Full Microsoft Hyper-V stack — Manager UI, services, command-line tools. Pro / Enterprise only.",
    ),
    (
        "Containers-DisposableClientVM",
        "Windows Sandbox",
        "sandbox",
        "Throwaway desktop VM that resets on close. Useful for testing untrusted installers.",
    ),
];

#[cfg(windows)]
#[tauri::command]
pub async fn list_optional_features() -> Result<Vec<DevFeature>, String> {
    let names_array = FEATURE_NAMES
        .iter()
        .map(|(n, _, _, _)| format!("'{}'", n))
        .collect::<Vec<_>>()
        .join(",");
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue'; \
         $names = @({names_array}); \
         $items = $names | ForEach-Object {{ \
             $f = Get-WindowsOptionalFeature -Online -FeatureName $_ -ErrorAction SilentlyContinue; \
             if ($f) {{ [pscustomobject]@{{ name=$f.FeatureName; state=$f.State.ToString() }} }} \
             else {{ [pscustomobject]@{{ name=$_; state='Unknown' }} }} \
         }}; \
         @($items) | ConvertTo-Json -Compress -Depth 3"
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let stdout = r.stdout.trim();
    let parsed: Vec<serde_json::Value> = if stdout.is_empty() {
        Vec::new()
    } else if stdout.starts_with('[') {
        serde_json::from_str(stdout).map_err(|e| format!("parse: {e}"))?
    } else if stdout.starts_with('{') {
        vec![serde_json::from_str(stdout).map_err(|e| format!("parse: {e}"))?]
    } else {
        return Err(format!("Unexpected PS output: {stdout}"));
    };
    let mut out = Vec::with_capacity(FEATURE_NAMES.len());
    for (name, label, category, description) in FEATURE_NAMES {
        let state = parsed
            .iter()
            .find(|v| v.get("name").and_then(|x| x.as_str()) == Some(*name))
            .and_then(|v| v.get("state").and_then(|x| x.as_str()))
            .unwrap_or("Unknown")
            .to_string();
        out.push(DevFeature {
            name: (*name).to_string(),
            display_name: (*label).to_string(),
            category: (*category).to_string(),
            description: (*description).to_string(),
            state,
        });
    }
    Ok(out)
}

#[cfg(windows)]
#[tauri::command]
pub async fn set_optional_feature_stream(
    task_id: String,
    name: String,
    enable: bool,
    cols: u16,
    rows: u16,
    on_event: Channel<StreamEvent>,
) -> Result<i32, String> {
    if !FEATURE_NAMES.iter().any(|(n, _, _, _)| *n == name) {
        return Err(format!("Unknown feature: {name}"));
    }
    // Re-validate that the name only contains the safe set; the allow-list
    // entries are static so this is belt-and-braces, but stops anyone editing
    // the table later from accidentally inserting a payload that PowerShell
    // would re-parse.
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("Invalid feature name: {name}"));
    }
    let cmdlet = if enable {
        "Enable-WindowsOptionalFeature"
    } else {
        "Disable-WindowsOptionalFeature"
    };
    let verb = if enable { "Enabling" } else { "Disabling" };
    let script = format!(
        "chcp 65001 2>&1 | Out-Null; \
         [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
         $OutputEncoding = [System.Text.Encoding]::UTF8; \
         Write-Host '>>> {verb} Windows feature: {name}' -ForegroundColor Cyan; \
         {cmdlet} -Online -FeatureName '{name}' -NoRestart -All -ErrorAction Stop | Out-Host; \
         Write-Host ''; \
         Write-Host '>>> Done. A reboot may be required to finish the change.' -ForegroundColor Green; \
         exit 0"
    );
    run_pty_script(task_id, script, cols, rows, on_event).await
}

#[cfg(windows)]
#[tauri::command]
pub async fn list_wsl_distros() -> Result<Vec<WslDistro>, String> {
    // wsl.exe emits UTF-16 LE with embedded NULs when its stdout is captured.
    // We flip the console's output encoding to Unicode, capture, then strip
    // NULs before parsing. Empty output (= wsl installed but no distros) is OK.
    let script = "\
$ErrorActionPreference='SilentlyContinue'; \
$prev = [Console]::OutputEncoding; \
try { \
    [Console]::OutputEncoding = [System.Text.Encoding]::Unicode; \
    $raw = & wsl.exe --list --verbose 2>&1; \
    if ($LASTEXITCODE -ne 0) { Write-Output '[]'; return }; \
    $text = ($raw | Out-String) -replace [char]0,''; \
    $lines = $text -split [environment]::NewLine | Where-Object { $_ -match '\\S' }; \
    if ($lines.Length -lt 2) { Write-Output '[]'; return }; \
    $rows = $lines | Select-Object -Skip 1; \
    $out = @(); \
    foreach ($l in $rows) { \
        $isDefault = $l.TrimStart().StartsWith('*'); \
        $parts = ($l -replace '^\\s*\\*?\\s*','') -split '\\s+' | Where-Object { $_ }; \
        if ($parts.Count -ge 3) { \
            $ver = 0; [void][int]::TryParse($parts[2], [ref]$ver); \
            $out += [pscustomobject]@{ name=$parts[0]; state=$parts[1]; version=$ver; default=$isDefault } \
        } \
    }; \
    @($out) | ConvertTo-Json -Compress -Depth 3 \
} finally { [Console]::OutputEncoding = $prev }";
    let r = run_ps(script);
    if !r.success {
        return Ok(Vec::new());
    }
    let stdout = r.stdout.trim();
    if stdout.is_empty() || stdout == "[]" {
        return Ok(Vec::new());
    }
    let parsed: serde_json::Value =
        serde_json::from_str(stdout).map_err(|e| format!("parse: {e}"))?;
    let arr: Vec<serde_json::Value> = if parsed.is_array() {
        parsed.as_array().cloned().unwrap_or_default()
    } else {
        vec![parsed]
    };
    let mut out = Vec::with_capacity(arr.len());
    for v in arr {
        out.push(WslDistro {
            name: v.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            state: v.get("state").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            version: v.get("version").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            default: v.get("default").and_then(|x| x.as_bool()).unwrap_or(false),
        });
    }
    Ok(out)
}

#[cfg(windows)]
#[tauri::command]
pub async fn dev_drive_info() -> Result<DevDriveInfo, String> {
    // Dev Drive needs Windows 11 22H2 (build 22621) or later. We surface the
    // build number so the frontend can give an honest "your build is old"
    // message instead of just disabling the card without explanation.
    let r = run_ps(
        "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' -ErrorAction SilentlyContinue).CurrentBuild",
    );
    let build: u32 = r.stdout.trim().parse().unwrap_or(0);
    let supported = build >= 22621;
    let note = if !supported {
        format!(
            "Dev Drive needs Windows 11 22H2 or later (build 22621+). This system reports build {build}."
        )
    } else {
        "Dev Drive is supported on this build. Create one in Settings → System → Storage → Disks & volumes.".to_string()
    };
    Ok(DevDriveInfo {
        supported,
        build,
        note,
    })
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn list_optional_features() -> Result<Vec<DevFeature>, String> {
    Err("Developer features are only available on Windows.".into())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn set_optional_feature_stream(
    _task_id: String,
    _name: String,
    _enable: bool,
    _cols: u16,
    _rows: u16,
    _on_event: tauri::ipc::Channel<serde_json::Value>,
) -> Result<i32, String> {
    Err("Developer features are only available on Windows.".into())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn list_wsl_distros() -> Result<Vec<WslDistro>, String> {
    Ok(Vec::new())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn dev_drive_info() -> Result<DevDriveInfo, String> {
    Ok(DevDriveInfo {
        supported: false,
        build: 0,
        note: "Dev Drive is a Windows feature.".into(),
    })
}
