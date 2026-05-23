use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};

const PORTABLE: bool = cfg!(feature = "portable");

fn is_portable_sync() -> bool {
    PORTABLE
}

/// Portable mode is baked into the binary at compile time via the `portable`
/// Cargo feature. The ZIP build enables it; the installer build does not.
#[tauri::command]
pub async fn is_portable() -> bool {
    is_portable_sync()
}

/// Resolve the data directory for logs / profile backups / etc.
/// - Portable: returns the empty string. Portable mode is stateless on disk —
///   all state (theme, custom profiles, activity log) lives in localStorage
///   inside the Webview2 user-data folder. No `data/` directory is created
///   next to the exe.
/// - Installed: `%APPDATA%/Reclaim`, created if missing.
#[tauri::command]
pub async fn app_data_dir() -> Result<String, String> {
    if is_portable_sync() {
        return Ok(String::new());
    }
    let dir = resolve_data_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

fn resolve_data_dir() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "system data dir unavailable".to_string())?
        .join("Reclaim");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create data dir failed: {e}"))?;
    Ok(dir)
}

/// Reject names that would escape the data directory. Filenames only — no
/// separators, no traversal, no absolute paths.
fn validate_app_file_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("file name required".into());
    }
    if name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || name.contains(':')
        || name.starts_with('.')
    {
        return Err(format!("invalid file name: {name}"));
    }
    Ok(())
}

fn atomic_write(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "no parent dir")
    })?;
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp_path = PathBuf::from(&tmp);
    {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&tmp_path)?;
        f.write_all(content)?;
        f.sync_all().ok();
    }
    // Rename is atomic on Windows when src and dst are on the same volume,
    // and we keep both inside the data dir. On Windows the destination must
    // not exist for plain rename, so prefer fs::rename which overwrites on
    // modern Rust (uses MoveFileExW with MOVEFILE_REPLACE_EXISTING since 1.46).
    match std::fs::rename(&tmp_path, path) {
        Ok(()) => Ok(()),
        Err(_) => {
            // Fallback: copy + remove.
            std::fs::copy(&tmp_path, path)?;
            let _ = std::fs::remove_file(&tmp_path);
            let _ = parent;
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn read_app_file(name: String) -> Result<Option<String>, String> {
    validate_app_file_name(&name)?;
    if is_portable_sync() {
        return Ok(None);
    }
    let path = resolve_data_dir()?.join(&name);
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("read {name} failed: {e}"))
}

#[tauri::command]
pub async fn write_app_file(name: String, content: String) -> Result<(), String> {
    validate_app_file_name(&name)?;
    if is_portable_sync() {
        return Ok(());
    }
    let path = resolve_data_dir()?.join(&name);
    atomic_write(&path, content.as_bytes()).map_err(|e| format!("write {name} failed: {e}"))
}

#[derive(Deserialize, Serialize)]
pub struct LogLine {
    pub ts: i64,
    pub level: String,
    pub action: String,
    pub target: String,
    pub message: String,
    pub details: Option<String>,
}

/// Append a single log entry (JSON line) to `<app_data_dir>/activity.log`.
/// localStorage is the primary store — this disk mirror is a crash-safe backup.
/// In portable mode the mirror is skipped entirely (no `data/` next to the exe).
#[tauri::command]
pub async fn log_append(entry: LogLine) -> Result<(), String> {
    if is_portable_sync() {
        return Ok(());
    }
    let path = resolve_data_dir()?.join("activity.log");
    let line = serde_json::to_string(&entry).map_err(|e| e.to_string())?;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open log failed: {e}"))?;
    writeln!(f, "{line}").map_err(|e| format!("write log failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn read_activity_log() -> Result<String, String> {
    if is_portable_sync() {
        return Ok(String::new());
    }
    let path = resolve_data_dir()?.join("activity.log");
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("read activity.log failed: {e}"))
}
