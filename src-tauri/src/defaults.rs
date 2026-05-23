use serde::{Deserialize, Serialize};
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Clone)]
pub struct DefaultAppInfo {
    pub key: String,           // ".pdf" or "http"
    pub kind: String,          // "file" | "protocol"
    pub prog_id: Option<String>,
    pub friendly_name: Option<String>,
    pub command: Option<String>,
}

#[cfg(windows)]
fn read_user_choice_prog_id(kind: &str, key: &str) -> Option<String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = if kind == "file" {
        format!(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\{key}\\UserChoice"
        )
    } else {
        format!(
            "Software\\Microsoft\\Windows\\Shell\\Associations\\URLAssociations\\{key}\\UserChoice"
        )
    };
    let sub = hkcu.open_subkey_with_flags(&path, KEY_READ).ok()?;
    sub.get_value::<String, _>("ProgId").ok()
}

#[cfg(windows)]
fn resolve_prog_id(prog_id: &str) -> (Option<String>, Option<String>) {
    use winreg::enums::*;
    use winreg::RegKey;
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);
    let mut friendly: Option<String> = None;
    let mut command: Option<String> = None;
    // FriendlyTypeName / ApplicationName / default value of the ProgId key.
    if let Ok(k) = hkcr.open_subkey_with_flags(prog_id, KEY_READ) {
        if let Ok(v) = k.get_value::<String, _>("FriendlyTypeName") {
            friendly = Some(v);
        }
        if friendly.is_none() {
            if let Ok(v) = k.get_value::<String, _>("") {
                if !v.is_empty() {
                    friendly = Some(v);
                }
            }
        }
        if let Ok(app) = k.open_subkey_with_flags("Application", KEY_READ) {
            if let Ok(v) = app.get_value::<String, _>("ApplicationName") {
                friendly = Some(v);
            }
        }
    }
    let cmd_path = format!("{prog_id}\\shell\\open\\command");
    if let Ok(c) = hkcr.open_subkey_with_flags(&cmd_path, KEY_READ) {
        if let Ok(v) = c.get_value::<String, _>("") {
            command = Some(v);
        }
    }
    (friendly, command)
}

#[cfg(windows)]
#[derive(Deserialize)]
pub struct DefaultsRequest {
    pub items: Vec<DefaultsRequestItem>,
}

#[derive(Deserialize)]
pub struct DefaultsRequestItem {
    pub kind: String, // "file" | "protocol"
    pub key: String,  // ".pdf" or "http"
}

#[cfg(windows)]
#[tauri::command]
pub async fn get_default_apps(req: DefaultsRequest) -> Result<Vec<DefaultAppInfo>, String> {
    let mut out = Vec::with_capacity(req.items.len());
    for it in req.items {
        if it.kind != "file" && it.kind != "protocol" {
            continue;
        }
        let prog_id = read_user_choice_prog_id(&it.kind, &it.key);
        let (friendly, command) = match prog_id.as_deref() {
            Some(pid) => resolve_prog_id(pid),
            None => (None, None),
        };
        out.push(DefaultAppInfo {
            key: it.key,
            kind: it.kind,
            prog_id,
            friendly_name: friendly,
            command,
        });
    }
    Ok(out)
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn get_default_apps(_req: serde_json::Value) -> Result<Vec<DefaultAppInfo>, String> {
    Err("Default apps API is Windows-only.".into())
}

/// Opens the Settings app deep-link for default apps.
/// `target` is one of:
///   - "" (root default-apps page)
///   - "fileType=.pdf"
///   - "protocol=mailto"
///   - "registeredAppMachine=Firefox-308046B0AF4A39CB"
#[cfg(windows)]
#[tauri::command]
pub async fn open_default_apps(target: String) -> Result<(), String> {
    let mut url = String::from("ms-settings:defaultapps");
    if !target.is_empty() {
        // Whitelist the parameter prefix and only allow safe characters in the
        // value so the URI handler can't be coerced into invoking something else.
        let (prefix, value) = target
            .split_once('=')
            .ok_or_else(|| format!("Invalid target: {target}"))?;
        let allowed_prefix = matches!(
            prefix,
            "fileType" | "protocol" | "registeredAppMachine" | "registeredAppUser"
        );
        if !allowed_prefix {
            return Err(format!("Disallowed target prefix: {prefix}"));
        }
        if value.is_empty()
            || value.len() > 128
            || !value
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
        {
            return Err(format!("Disallowed target value: {value}"));
        }
        url.push('?');
        url.push_str(prefix);
        url.push('=');
        url.push_str(value);
    }
    Command::new("cmd")
        .args(["/C", "start", "", &url])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Could not launch ms-settings: {e}"))?;
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn open_default_apps(_target: String) -> Result<(), String> {
    Err("Default apps API is Windows-only.".into())
}
