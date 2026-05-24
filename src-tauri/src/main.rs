// Prevent additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() -> std::process::ExitCode {
    // CLI mode: any --flag besides --no-elevate routes to the headless dispatcher.
    // The binary is GUI-subsystem in release builds, so cli::run() attaches to
    // the parent console (cmd / PowerShell) before printing anything.
    #[cfg(windows)]
    {
        let argv: Vec<String> = std::env::args().collect();
        if reclaim_lib::cli::argv_is_cli(&argv) {
            return reclaim_lib::cli::run();
        }
    }

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
        return std::process::ExitCode::SUCCESS;
    }
    reclaim_lib::run();
    std::process::ExitCode::SUCCESS
}
