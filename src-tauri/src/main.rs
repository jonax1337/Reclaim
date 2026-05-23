// Prevent additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Trigger UAC BEFORE the Tauri builder runs so the user never sees the
    // non-elevated window flash open and immediately close. If the user accepts,
    // an elevated copy is already starting and we exit silently. If they
    // decline, we fall through and continue in lite (non-elevated) mode.
    //
    // Only in release builds: in `tauri dev` the elevated child has no way to
    // reach the Vite dev server because killing the unelevated parent also
    // tears down Vite — the elevated window would show as an empty shell. Run
    // `pnpm tauri:dev` from an elevated terminal during development instead.
    #[cfg(all(windows, not(debug_assertions)))]
    if reclaim_lib::sysinfo::try_elevate_at_startup() {
        std::process::exit(0);
    }
    reclaim_lib::run()
}
