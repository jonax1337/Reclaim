// Background service: tray-resident timer that fires `service.tick` events on
// a configurable interval. The frontend subscribes and runs the per-feature
// loops (persistence drift detection, Windows-Update poll, NVIDIA driver
// poll) inside the existing TypeScript executor — that way the catalog logic
// stays in one place (executor.ts) and the Webview2 process keeps running
// when the window is hidden to tray.
//
// State for the service (interval, tray-on-close behavior, "user requested
// quit" flag) is held in a shared `ServiceState` registered via tauri::Manager.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const TICK_EVENT: &str = "service.tick";
const TRIGGER_CHECK_EVENT: &str = "service.trigger-check";
const NAVIGATE_EVENT: &str = "service.navigate";

#[derive(Default)]
pub struct ServiceState {
    /// Hours between automatic ticks. Set by frontend via `service_set_interval`.
    pub interval_hours: Mutex<u32>,
    /// When true, window close hides to tray instead of quitting. Toggled via
    /// `service_set_keep_in_tray`. Default true.
    pub keep_in_tray: Mutex<bool>,
    /// Set true when the tray "Quit" menu is invoked, so the next CloseRequested
    /// is allowed through naturally.
    pub force_quit: Mutex<bool>,
}

impl ServiceState {
    pub fn new() -> Self {
        Self {
            interval_hours: Mutex::new(6),
            keep_in_tray: Mutex::new(true),
            force_quit: Mutex::new(false),
        }
    }
}

#[derive(Serialize, Clone)]
struct TickPayload {
    ts: i64,
    /// "auto" for scheduled ticks, "manual" when triggered via tray / Settings.
    source: &'static str,
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Spawn the background tick loop. The loop sleeps in 60s chunks so an
/// interval change takes effect within a minute without restarting the task.
pub fn spawn_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Tiny grace period — let the frontend mount and subscribe before the
        // first tick lands. 5s is enough; even on a cold start the Webview2
        // boots in under 2s in our measurements.
        tokio::time::sleep(Duration::from_secs(5)).await;
        let mut elapsed_minutes: u32 = 0;
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            elapsed_minutes += 1;
            let interval_hours: u32 = {
                let state = app.state::<ServiceState>();
                let guard = state.interval_hours.lock();
                match guard {
                    Ok(g) => *g,
                    Err(p) => *p.into_inner(),
                }
            };
            let interval_minutes = interval_hours.saturating_mul(60).max(1);
            if elapsed_minutes >= interval_minutes {
                elapsed_minutes = 0;
                let _ = app.emit(
                    TICK_EVENT,
                    TickPayload {
                        ts: now_ms(),
                        source: "auto",
                    },
                );
            }
        }
    });
}

#[tauri::command]
pub fn service_set_interval(state: tauri::State<'_, ServiceState>, hours: u32) -> Result<(), String> {
    let clamped = hours.clamp(1, 168);
    *state.interval_hours.lock().map_err(|e| e.to_string())? = clamped;
    Ok(())
}

#[tauri::command]
pub fn service_get_interval(state: tauri::State<'_, ServiceState>) -> Result<u32, String> {
    state.interval_hours.lock().map(|g| *g).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn service_set_keep_in_tray(
    state: tauri::State<'_, ServiceState>,
    enabled: bool,
) -> Result<(), String> {
    *state.keep_in_tray.lock().map_err(|e| e.to_string())? = enabled;
    Ok(())
}

#[tauri::command]
pub fn service_trigger_now(app: AppHandle) -> Result<(), String> {
    app.emit(
        TICK_EVENT,
        TickPayload {
            ts: now_ms(),
            source: "manual",
        },
    )
    .map_err(|e| e.to_string())
}

/// Emitted to the frontend from tray menu clicks ("Check now", "Settings…").
/// Kept as a separate event so the frontend can wire navigation/scrolling
/// without confusing it with a real service tick.
pub fn emit_trigger_check(app: &AppHandle) {
    let _ = app.emit(TRIGGER_CHECK_EVENT, ());
}

pub fn emit_navigate(app: &AppHandle, route: &str) {
    let _ = app.emit(NAVIGATE_EVENT, route.to_string());
}

/// Show + focus the main window (used by tray click, Open menu, single-instance
/// re-launch).
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// True if the user has requested a real quit via the tray "Quit" menu.
pub fn is_force_quit(state: &ServiceState) -> bool {
    state.force_quit.lock().map(|g| *g).unwrap_or(false)
}

pub fn set_force_quit(state: &ServiceState) {
    if let Ok(mut g) = state.force_quit.lock() {
        *g = true;
    }
}

pub fn is_keep_in_tray(state: &ServiceState) -> bool {
    state.keep_in_tray.lock().map(|g| *g).unwrap_or(true)
}
