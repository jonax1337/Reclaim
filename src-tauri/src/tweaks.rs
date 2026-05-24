use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
pub struct PsResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

#[derive(Serialize, Clone)]
pub struct AppxPackage {
    pub name: String,
    pub package_full_name: String,
    pub publisher: String,
    pub installed: bool,
    pub provisioned: bool,
}

#[derive(Deserialize)]
pub struct RegValue {
    pub hive: String, // "HKCU" | "HKLM"
    pub path: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String, // "DWORD" | "SZ" | "EXPANDSZ"
    pub value: serde_json::Value,
}

#[derive(Deserialize)]
pub struct RegLocator {
    pub hive: String,
    pub path: String,
    pub name: String,
}

#[cfg(windows)]
pub(crate) fn run_ps(script: &str) -> PsResult {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    // Force UTF-8 on both PowerShell streams. Default on German Windows is
    // Windows-1252; any ä/ö/ü in service display names, app titles or driver
    // info would otherwise come back as 0xFC byte and lose to from_utf8_lossy.
    let wrapped = format!(
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
         $OutputEncoding = [System.Text.Encoding]::UTF8; \
         {}",
        script
    );
    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &wrapped,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    match output {
        Ok(o) => PsResult {
            success: o.status.success(),
            stdout: String::from_utf8_lossy(&o.stdout).to_string(),
            stderr: String::from_utf8_lossy(&o.stderr).to_string(),
            code: o.status.code().unwrap_or(-1),
        },
        Err(e) => PsResult {
            success: false,
            stdout: String::new(),
            stderr: format!("PowerShell-Aufruf fehlgeschlagen: {}", e),
            code: -1,
        },
    }
}

#[cfg(not(windows))]
pub(crate) fn run_ps(_script: &str) -> PsResult {
    PsResult {
        success: false,
        stdout: String::new(),
        stderr: "PowerShell ist nur unter Windows verfügbar.".into(),
        code: -1,
    }
}

#[tauri::command]
pub async fn run_powershell(script: String, elevated: bool) -> PsResult {
    if elevated {
        #[cfg(windows)]
        {
            // Wrap script so that an elevated PowerShell runs it and writes output
            // back to a temp file. We then read that file. This is needed because
            // Start-Process -Verb RunAs detaches stdout.
            // The script is base64-encoded as UTF-8 bytes and decoded back to a
            // string inside PowerShell with `[Text.Encoding]::UTF8.GetString` —
            // so non-ASCII (umlauts in service names, etc.) round-trips
            // correctly. We pass the wrapper via -Command, not -EncodedCommand,
            // so no UTF-16 LE concerns apply at this layer.
            let encoded = base64_encode(script.as_bytes());
            // Unique per-call temp path so two concurrent elevated calls don't
            // clobber each other's output file.
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let tmp = std::env::temp_dir().join(format!(
                "reclaim-out-{}-{}.txt",
                std::process::id(),
                nonce
            ));
            let tmp_path = tmp.to_string_lossy().replace('\\', "\\\\");
            let wrapper = format!(
                "$enc = '{enc}'; \
                 $bytes = [Convert]::FromBase64String($enc); \
                 $script = [Text.Encoding]::UTF8.GetString($bytes); \
                 $sb = [scriptblock]::Create($script + \" | Out-File -FilePath '{tmp}' -Encoding utf8\"); \
                 Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command',$sb; \
                 if (Test-Path '{tmp}') {{ Get-Content '{tmp}' -Raw; Remove-Item '{tmp}' -Force }}",
                enc = encoded,
                tmp = tmp_path,
            );
            return run_ps(&wrapper);
        }
        #[cfg(not(windows))]
        {
            return run_ps(&script);
        }
    }
    run_ps(&script)
}

/// Build a JSON parse failure message that includes the head of PowerShell's
/// stdout and stderr — without it the user just sees "JSON parse failed" with
/// no clue whether PS errored, returned nothing, or returned a non-JSON
/// warning preamble.
pub(crate) fn ps_parse_error(what: &str, err: &str, stdout: &str, stderr: &str) -> String {
    fn head(s: &str, n: usize) -> String {
        let trimmed = s.trim();
        if trimmed.chars().count() <= n {
            trimmed.to_string()
        } else {
            let mut out: String = trimmed.chars().take(n).collect();
            out.push('…');
            out
        }
    }
    let mut msg = format!("{what}: JSON parse failed ({err})");
    if !stderr.trim().is_empty() {
        msg.push_str(&format!(" — stderr: {}", head(stderr, 400)));
    }
    if !stdout.trim().is_empty() {
        msg.push_str(&format!(" — stdout head: {}", head(stdout, 400)));
    }
    msg
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    let mut i = 0;
    while i + 3 <= data.len() {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8) | (data[i + 2] as u32);
        out.push(CHARS[((n >> 18) & 63) as usize] as char);
        out.push(CHARS[((n >> 12) & 63) as usize] as char);
        out.push(CHARS[((n >> 6) & 63) as usize] as char);
        out.push(CHARS[(n & 63) as usize] as char);
        i += 3;
    }
    let rem = data.len() - i;
    if rem == 1 {
        let n = (data[i] as u32) << 16;
        out.push(CHARS[((n >> 18) & 63) as usize] as char);
        out.push(CHARS[((n >> 12) & 63) as usize] as char);
        out.push('=');
        out.push('=');
    } else if rem == 2 {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8);
        out.push(CHARS[((n >> 18) & 63) as usize] as char);
        out.push(CHARS[((n >> 12) & 63) as usize] as char);
        out.push(CHARS[((n >> 6) & 63) as usize] as char);
        out.push('=');
    }
    out
}

#[tauri::command]
pub async fn list_installed_appx() -> Result<Vec<AppxPackage>, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$user = Get-AppxPackage | Select-Object Name, PackageFullName, Publisher, @{n='Provisioned';e={$false}}
$prov = Get-AppxProvisionedPackage -Online | Select-Object @{n='Name';e={$_.DisplayName}}, @{n='PackageFullName';e={$_.PackageName}}, Publisher, @{n='Provisioned';e={$true}}
@($user) + @($prov) | ConvertTo-Json -Compress -Depth 3
"#;
    let r = run_ps(script);
    if !r.success {
        return Err(r.stderr);
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(vec![]);
    }
    // ConvertTo-Json emits a single object if there's only one element.
    let parsed: serde_json::Value = serde_json::from_str(out)
        .map_err(|e| ps_parse_error("AppX listing", &e.to_string(), out, &r.stderr))?;
    let arr: Vec<serde_json::Value> = match parsed {
        serde_json::Value::Array(a) => a,
        other => vec![other],
    };
    let mut map: std::collections::HashMap<String, AppxPackage> = std::collections::HashMap::new();
    for v in arr {
        let name = v.get("Name").and_then(|x| x.as_str()).unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        let pkg = AppxPackage {
            name: name.clone(),
            package_full_name: v
                .get("PackageFullName")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            publisher: v
                .get("Publisher")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            installed: true,
            provisioned: v
                .get("Provisioned")
                .and_then(|x| x.as_bool())
                .unwrap_or(false),
        };
        map.entry(name)
            .and_modify(|existing| {
                existing.provisioned = existing.provisioned || pkg.provisioned;
            })
            .or_insert(pkg);
    }
    Ok(map.into_values().collect())
}

#[tauri::command]
pub async fn remove_appx(package_name: String, all_users: bool) -> PsResult {
    let all_users_flag = if all_users { "-AllUsers" } else { "" };
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$name = '{name}'
$removed = @()
Get-AppxPackage {flag} -Name $name | ForEach-Object {{
    try {{ Remove-AppxPackage {flag} -Package $_.PackageFullName; $removed += $_.PackageFullName }} catch {{ Write-Error $_ }}
}}
Get-AppxProvisionedPackage -Online | Where-Object {{ $_.DisplayName -like $name }} | ForEach-Object {{
    try {{ Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName | Out-Null; $removed += $_.PackageName }} catch {{ Write-Error $_ }}
}}
$removed -join "`n"
"#,
        name = package_name.replace('\'', "''"),
        flag = all_users_flag,
    );
    run_ps(&script)
}

#[cfg(windows)]
fn open_hive(hive: &str, write: bool) -> Result<winreg::RegKey, String> {
    use winreg::enums::*;
    let h = match hive {
        "HKCU" => HKEY_CURRENT_USER,
        "HKLM" => HKEY_LOCAL_MACHINE,
        "HKCR" => HKEY_CLASSES_ROOT,
        "HKU" => HKEY_USERS,
        _ => return Err(format!("Unknown hive: {}", hive)),
    };
    let _ = write;
    Ok(winreg::RegKey::predef(h))
}

#[cfg(windows)]
fn read_one(locator: &RegLocator) -> Option<serde_json::Value> {
    use winreg::enums::*;
    let root = match open_hive(&locator.hive, false) {
        Ok(r) => r,
        Err(_) => return None,
    };
    match root.open_subkey_with_flags(&locator.path, KEY_READ) {
        Ok(key) => {
            if let Ok(v) = key.get_value::<u32, _>(&locator.name) {
                return Some(serde_json::Value::Number(v.into()));
            }
            if let Ok(v) = key.get_value::<String, _>(&locator.name) {
                return Some(serde_json::Value::String(v));
            }
            None
        }
        Err(_) => None,
    }
}

#[cfg(windows)]
#[tauri::command]
pub async fn reg_read(locator: RegLocator) -> Result<Option<serde_json::Value>, String> {
    Ok(read_one(&locator))
}

#[cfg(windows)]
pub(crate) fn reg_read_sync(locator: &RegLocator) -> Option<serde_json::Value> {
    read_one(locator)
}

/// Bulk-read variant. Marked async so Tauri runs it on the tokio runtime
/// instead of the IPC main thread, then off-loads the actual (blocking)
/// registry I/O to a spawn_blocking worker. Eliminates the per-tweak-state
/// IPC round-trip storm that previously froze the UI on dashboard mount.
#[cfg(windows)]
#[tauri::command]
pub async fn reg_read_many(
    locators: Vec<RegLocator>,
) -> Result<Vec<Option<serde_json::Value>>, String> {
    tokio::task::spawn_blocking(move || locators.iter().map(read_one).collect())
        .await
        .map_err(|e| format!("reg_read_many join failed: {}", e))
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn reg_read_many(
    _locators: Vec<RegLocator>,
) -> Result<Vec<Option<serde_json::Value>>, String> {
    Err("Registry ist nur unter Windows verfügbar.".into())
}

#[cfg(windows)]
pub(crate) fn reg_write_sync(value: &RegValue) -> Result<(), String> {
    use winreg::enums::*;
    let root = open_hive(&value.hive, true)?;
    let (key, _disp) = root
        .create_subkey_with_flags(&value.path, KEY_WRITE)
        .map_err(|e| format!("Create key failed: {}", e))?;
    match value.kind.as_str() {
        "DWORD" => {
            let n = value
                .value
                .as_u64()
                .ok_or_else(|| "DWORD value must be a number".to_string())?
                as u32;
            key.set_value(&value.name, &n)
                .map_err(|e| format!("Set DWORD failed: {}", e))?;
        }
        "SZ" | "EXPANDSZ" => {
            let s = value
                .value
                .as_str()
                .ok_or_else(|| "String value required".to_string())?;
            key.set_value(&value.name, &s.to_string())
                .map_err(|e| format!("Set String failed: {}", e))?;
        }
        other => return Err(format!("Unknown type: {}", other)),
    }
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
pub async fn reg_write(value: RegValue) -> Result<(), String> {
    reg_write_sync(&value)
}

#[cfg(windows)]
pub(crate) fn reg_delete_value_sync(locator: &RegLocator) -> Result<(), String> {
    use winreg::enums::*;
    let root = open_hive(&locator.hive, true)?;
    let key = root
        .open_subkey_with_flags(&locator.path, KEY_WRITE)
        .map_err(|e| format!("Open key failed: {}", e))?;
    key.delete_value(&locator.name)
        .map_err(|e| format!("Delete value failed: {}", e))
}

#[cfg(windows)]
#[tauri::command]
pub async fn reg_delete_value(locator: RegLocator) -> Result<(), String> {
    reg_delete_value_sync(&locator)
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn reg_read(_locator: RegLocator) -> Result<Option<serde_json::Value>, String> {
    Err("Registry ist nur unter Windows verfügbar.".into())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn reg_write(_value: RegValue) -> Result<(), String> {
    Err("Registry ist nur unter Windows verfügbar.".into())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn reg_delete_value(_locator: RegLocator) -> Result<(), String> {
    Err("Registry ist nur unter Windows verfügbar.".into())
}

#[tauri::command]
pub async fn create_restore_point(description: String) -> PsResult {
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
try {{
    Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
    Checkpoint-Computer -Description '{desc}' -RestorePointType 'MODIFY_SETTINGS'
    "Wiederherstellungspunkt erstellt."
}} catch {{
    Write-Error $_
}}
"#,
        desc = description.replace('\'', "''")
    );
    run_ps(&script)
}

#[tauri::command]
pub async fn restart_explorer() -> PsResult {
    run_ps("Stop-Process -Name explorer -Force; Start-Sleep -Milliseconds 400; if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }")
}
