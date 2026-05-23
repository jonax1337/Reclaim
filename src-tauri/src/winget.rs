use serde::Serialize;
use tauri::ipc::Channel;

use crate::maintenance::{run_streamed, StreamEvent};
use crate::tweaks::{run_ps, PsResult};

const ENC_PREFIX: &str = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
                          $OutputEncoding = [System.Text.Encoding]::UTF8;";

fn is_valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' || c == '+')
}

#[tauri::command]
pub async fn winget_available() -> bool {
    let r = run_ps(&format!(
        "{ENC_PREFIX} if (Get-Command winget -ErrorAction SilentlyContinue) {{ 'yes' }} else {{ 'no' }}"
    ));
    r.success && r.stdout.trim() == "yes"
}

#[derive(Serialize, Clone)]
pub struct WingetVersion {
    pub available: bool,
    pub version: String,
}

#[tauri::command]
pub async fn winget_version() -> WingetVersion {
    let r = run_ps(&format!(
        "{ENC_PREFIX} if (Get-Command winget -ErrorAction SilentlyContinue) {{ winget --version }} else {{ '' }}"
    ));
    let v = r.stdout.trim().to_string();
    WingetVersion {
        available: !v.is_empty(),
        version: v,
    }
}

#[tauri::command]
pub async fn winget_list_installed() -> Result<String, String> {
    let r = run_ps(&format!(
        "{ENC_PREFIX} winget list --accept-source-agreements --disable-interactivity"
    ));
    if !r.success && r.stdout.is_empty() {
        return Err(if r.stderr.is_empty() {
            format!("winget list failed (exit {})", r.code)
        } else {
            r.stderr
        });
    }
    Ok(r.stdout)
}

#[tauri::command]
pub async fn winget_list_upgradable() -> Result<String, String> {
    let r = run_ps(&format!(
        "{ENC_PREFIX} winget upgrade --include-unknown --accept-source-agreements --disable-interactivity"
    ));
    if !r.success && r.stdout.is_empty() {
        return Err(if r.stderr.is_empty() {
            format!("winget upgrade failed (exit {})", r.code)
        } else {
            r.stderr
        });
    }
    Ok(r.stdout)
}

fn run_winget(args: &str) -> PsResult {
    run_ps(&format!("{ENC_PREFIX} winget {args}"))
}

#[tauri::command]
pub async fn winget_install(id: String, scope_user: bool) -> Result<PsResult, String> {
    if !is_valid_id(&id) {
        return Err(format!("Rejected package id: {id}"));
    }
    let scope = if scope_user { "--scope user " } else { "" };
    let args = format!(
        "install --id {id} -e {scope}--silent --accept-source-agreements --accept-package-agreements"
    );
    Ok(run_winget(&args))
}

#[tauri::command]
pub async fn winget_uninstall(id: String) -> Result<PsResult, String> {
    if !is_valid_id(&id) {
        return Err(format!("Rejected package id: {id}"));
    }
    let args = format!("uninstall --id {id} -e --silent --accept-source-agreements --disable-interactivity");
    Ok(run_winget(&args))
}

/// Streaming variant of install/uninstall/upgrade. Emits stdout/stderr lines as
/// they appear so the UI can show live progress instead of freezing on a single
/// long-running invoke. Returns the final exit code.
#[tauri::command]
pub async fn winget_run_stream(
    op: String,
    id: String,
    scope_user: bool,
    on_event: Channel<StreamEvent>,
) -> Result<i32, String> {
    if !is_valid_id(&id) {
        return Err(format!("Rejected package id: {id}"));
    }
    let action = match op.as_str() {
        "install" => "install",
        "uninstall" => "uninstall",
        "upgrade" => "upgrade",
        other => return Err(format!("Unknown op: {other}")),
    };
    let scope = if op == "install" && scope_user {
        "--scope user "
    } else {
        ""
    };
    let extra_install_flags = if op == "install" || op == "upgrade" {
        "--accept-package-agreements "
    } else {
        ""
    };
    let script = format!(
        "{ENC_PREFIX} winget {action} --id {id} -e {scope}--silent --accept-source-agreements {extra_install_flags}--disable-interactivity"
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

#[tauri::command]
pub async fn winget_upgrade(id: String) -> Result<PsResult, String> {
    if !is_valid_id(&id) {
        return Err(format!("Rejected package id: {id}"));
    }
    let args = format!(
        "upgrade --id {id} -e --silent --accept-source-agreements --accept-package-agreements --disable-interactivity"
    );
    Ok(run_winget(&args))
}
