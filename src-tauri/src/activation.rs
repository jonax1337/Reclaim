use serde::Serialize;

#[derive(Serialize, Clone, Default)]
pub struct ActivationStatus {
    pub name: String,
    pub description: String,
    pub license_status: u32,
    pub license_status_text: String,
    pub channel: String,
    pub partial_key: String,
    pub grace_period_minutes: u64,
    pub detected: bool,
}

fn license_status_text(code: u32) -> &'static str {
    match code {
        0 => "Unlicensed",
        1 => "Licensed",
        2 => "Out-of-box grace",
        3 => "Out-of-tolerance grace",
        4 => "Non-genuine grace",
        5 => "Notification",
        6 => "Extended grace",
        _ => "Unknown",
    }
}

// PowerShell + WMI does not need admin to read SoftwareLicensingProduct.
// We filter on ApplicationID = Windows (excludes Office licenses) and
// PartialProductKey IS NOT NULL (only products that actually have a key
// installed — drops the long list of inactive edition templates).
#[cfg(windows)]
const STATUS_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
try {
  $p = @(Get-CimInstance -ClassName SoftwareLicensingProduct -Filter "PartialProductKey IS NOT NULL AND ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f'" |
    Select-Object Name, Description, LicenseStatus, GracePeriodRemaining, PartialProductKey, ProductKeyChannel)
  if ($p.Count -eq 0) { '[]' } else { ConvertTo-Json -InputObject $p -Compress -Depth 3 }
} catch {
  '[]'
}
"#;

#[cfg(windows)]
#[tauri::command]
pub async fn get_activation_status() -> Result<ActivationStatus, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            STATUS_SCRIPT,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() || trimmed == "[]" {
        return Ok(ActivationStatus::default());
    }

    // ConvertTo-Json returns an object for single items, an array for multiple.
    let raw: serde_json::Value = serde_json::from_str(trimmed).map_err(|e| e.to_string())?;
    let first = match &raw {
        serde_json::Value::Array(arr) => arr.first().cloned(),
        serde_json::Value::Object(_) => Some(raw.clone()),
        _ => None,
    };
    let Some(obj) = first else {
        return Ok(ActivationStatus::default());
    };

    let pick_str = |key: &str| {
        obj.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    let pick_u32 = |key: &str| obj.get(key).and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let pick_u64 = |key: &str| obj.get(key).and_then(|v| v.as_u64()).unwrap_or(0);

    let code = pick_u32("LicenseStatus");
    Ok(ActivationStatus {
        name: pick_str("Name"),
        description: pick_str("Description"),
        license_status: code,
        license_status_text: license_status_text(code).to_string(),
        channel: pick_str("ProductKeyChannel"),
        partial_key: pick_str("PartialProductKey"),
        grace_period_minutes: pick_u64("GracePeriodRemaining"),
        detected: true,
    })
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn get_activation_status() -> Result<ActivationStatus, String> {
    Ok(ActivationStatus::default())
}

// External script URL. Kept here as the single source of truth — the launch
// command is static, never interpolated from frontend input.
#[cfg(windows)]
const MAS_LAUNCH_INNER: &str = "irm https://get.activated.win | iex";

#[cfg(windows)]
#[tauri::command]
pub async fn launch_activation_script() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    // Outer PS runs hidden; Start-Process -Verb RunAs triggers UAC and spawns
    // a new visible elevated powershell window which then runs the MAS one-
    // liner. -NoExit keeps the window open so the user can interact with the
    // MAS menu and read the result.
    let ps = format!(
        "try {{ Start-Process powershell -Verb RunAs -ArgumentList @('-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-Command','{}') -ErrorAction Stop }} catch {{ exit 1 }}",
        MAS_LAUNCH_INNER
    );

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("UAC declined or PowerShell failed to launch".into());
    }
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn launch_activation_script() -> Result<(), String> {
    Err("Windows activation script only runs on Windows".into())
}
