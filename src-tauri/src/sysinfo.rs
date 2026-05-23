use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct SystemInfo {
    pub product_name: String,
    pub display_version: String,
    pub build: String,
    pub edition: String,
    pub username: String,
}

#[cfg(windows)]
fn friendly_edition(edition: &str) -> &str {
    match edition {
        "Professional" => "Pro",
        "ProfessionalN" => "Pro N",
        "ProfessionalWorkstation" => "Pro for Workstations",
        "Core" => "Home",
        "CoreN" => "Home N",
        "CoreCountrySpecific" => "Home Country Specific",
        "CoreSingleLanguage" => "Home Single Language",
        "Enterprise" => "Enterprise",
        "EnterpriseN" => "Enterprise N",
        "EnterpriseS" => "Enterprise LTSC",
        "Education" => "Education",
        "EducationN" => "Education N",
        "ServerStandard" => "Server Standard",
        "ServerDatacenter" => "Server Datacenter",
        other => other,
    }
}

#[cfg(windows)]
#[tauri::command]
pub async fn get_system_info() -> SystemInfo {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let nt = hklm
        .open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion")
        .ok();
    let read = |key: &str| -> String {
        nt.as_ref()
            .and_then(|k| k.get_value::<String, _>(key).ok())
            .unwrap_or_default()
    };
    let build_number_str = read("CurrentBuildNumber");
    let build_num: u32 = build_number_str.parse().unwrap_or(0);
    let ubr: u32 = nt
        .as_ref()
        .and_then(|k| k.get_value::<u32, _>("UBR").ok())
        .unwrap_or(0);
    let build = if ubr > 0 {
        format!("{}.{}", build_number_str, ubr)
    } else {
        build_number_str
    };
    let edition_id = read("EditionID");

    // Microsoft kept ProductName = "Windows 10 …" on Windows 11 for app compat.
    // Builds ≥ 22000 are Windows 11; synthesize the correct name from EditionID.
    let product_name = if build_num >= 22000 {
        format!("Windows 11 {}", friendly_edition(&edition_id))
    } else if build_num >= 10240 {
        format!("Windows 10 {}", friendly_edition(&edition_id))
    } else {
        read("ProductName")
    };

    SystemInfo {
        product_name,
        display_version: read("DisplayVersion"),
        build,
        edition: edition_id,
        username: std::env::var("USERNAME").unwrap_or_default(),
    }
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn get_system_info() -> SystemInfo {
    SystemInfo {
        product_name: "Not Windows".into(),
        display_version: "".into(),
        build: "".into(),
        edition: "".into(),
        username: std::env::var("USER").unwrap_or_default(),
    }
}

#[cfg(windows)]
pub fn check_elevated() -> bool {
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    unsafe {
        let mut token: HANDLE = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut size = std::mem::size_of::<TOKEN_ELEVATION>() as u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            size,
            &mut size,
        )
        .is_ok();
        let _ = CloseHandle(token);
        ok && elevation.TokenIsElevated != 0
    }
}

#[cfg(not(windows))]
pub fn check_elevated() -> bool {
    false
}

#[tauri::command]
pub async fn is_elevated() -> bool {
    check_elevated()
}

/// Synchronously prompt UAC for self-elevation before Tauri spawns a window.
/// Returns true if an elevated copy has been launched and the caller should
/// exit; false if the user is already elevated, declined UAC, or the host
/// isn't Windows.
#[cfg(windows)]
pub fn try_elevate_at_startup() -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    if check_elevated() {
        return false;
    }
    if std::env::args().any(|a| a == "--no-elevate") {
        return false;
    }
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let exe_str = exe.to_string_lossy().replace('\'', "''");
    // Start-Process -Verb RunAs is synchronous w.r.t. the UAC prompt: it
    // returns once the user has chosen, with status code 0 on accept and a
    // terminating error on cancel.
    let ps = format!(
        "try {{ Start-Process -FilePath '{}' -Verb RunAs -ErrorAction Stop }} catch {{ exit 1 }}",
        exe_str
    );
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    matches!(output, Ok(o) if o.status.success())
}

#[cfg(not(windows))]
pub fn try_elevate_at_startup() -> bool {
    false
}

#[cfg(windows)]
#[tauri::command]
pub async fn get_accent_color() -> Option<[u8; 3]> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let dwm = hkcu.open_subkey("Software\\Microsoft\\Windows\\DWM").ok()?;
    let accent: u32 = dwm.get_value("AccentColor").ok()?;
    let r = (accent & 0xFF) as u8;
    let g = ((accent >> 8) & 0xFF) as u8;
    let b = ((accent >> 16) & 0xFF) as u8;
    Some([r, g, b])
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn get_accent_color() -> Option<[u8; 3]> {
    None
}

#[cfg(windows)]
#[tauri::command]
pub async fn relaunch_elevated(app: tauri::AppHandle) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe.to_string_lossy().replace('\'', "''");
    let ps = format!(
        "try {{ Start-Process -FilePath '{}' -Verb RunAs -ErrorAction Stop }} catch {{ exit 1 }}",
        exe_str
    );
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("Elevation cancelled".into());
    }
    // Give the elevated instance a brief head start, then exit.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(300));
        app.exit(0);
    });
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn relaunch_elevated(_app: tauri::AppHandle) -> Result<(), String> {
    Err("Elevation only supported on Windows".into())
}
