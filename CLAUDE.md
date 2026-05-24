# Reclaim Your Windows — Claude Code Context

Tauri 2 + Svelte 5 desktop tool that debloats Windows 11, surfaces hidden settings, and runs system queries. Win11Debloat-inspired feature set but with **live state detection**, **reversibility-by-design**, and a **modern Mica UI**. UI stack derived from `E:\DEV\rechnungs-tool` (Zettel), now visually distinct.

## Current state

**v0.15.1.** Phases 1-5 shipped, Phase 6 partially shipped, Phase 7 (System depth), Phase 8 (Customize & drivers), Phase 9 (Licensing launcher), Phase 10 (Security hardening + real portable build), Phase 11 (Install media builder), Phase 12 (CLI mode), Phase 13 (Persistence service + tray companion) and Phase 13b (SYSTEM-context admin persistence + close-to-tray fixes) shipped. For a per-version diff see [`CHANGELOG.md`](CHANGELOG.md); for what's left before v1.0.0 see [`docs/ROADMAP.md`](docs/ROADMAP.md). Post-v1.0 ideas in [`docs/PLAN.md`](docs/PLAN.md).

Headline numbers:
- **167 reversible tweaks** across 11 categories (privacy, ai, search, explorer, taskbar, notifications, performance, updates, browser, security)
- **147 bloatware patterns** across 8 groups (incl. OEM bloat for HP / Lenovo / Dell)
- **67 winget apps** across 8 groups
- **4 built-in profiles** + a full custom profile builder with `.reclaim` import/export
- **33 routes** in a 10-group sidebar
- **107 Tauri commands** across 24 Rust modules
- **CLI mode**: the same `reclaim.exe` accepts `--apply-profile`, `--apply-tweak`, `--remove-bloat`, `--import-profile <file.reclaim>`, `--export-state`, `--admin-only` etc. for headless / gold-image / SYSTEM-task use.
- **Tray companion**: lives in the system notification area, optionally autostarts with Windows (no UAC prompt at boot), re-applies HKCU drift after Windows updates, pushes WU + NVIDIA-driver toasts.
- **SYSTEM persistence**: per-profile opt-in scheduled task (`\Reclaim\Persist-<id>`) runs as SYSTEM, re-applies HKLM + shell tweaks at logon + on the configured interval without ever prompting UAC.

Headline features built since v0.1.0:
- Network & hosts (v0.2.0): hosts blocklists with sentinel-based merge, DNS/DoH provider presets, per-adapter DNS overrides.
- Winget apps (v0.3.0): curated catalog with bulk install / upgrade / uninstall, live xterm output.
- Tweak breadth (v0.4.0): +71 tweaks, new Notifications category.
- System maintenance (v0.5.0): SFC / DISM / chkdsk / Defender / WinSxS / network reset, Power Plans manager, ConPTY-based PTY terminal.
- Profile Builder (v0.6.0): custom profiles, `.reclaim` JSON envelope with schema versioning, import/export.
- Polish (v0.7.0): portable mode, crash-safe activity.log mirror, auto-updater wiring.
- OneDrive removal, right-click menu editor, real shell icons (EXE + AppX), NVIDIA driver auto-update with streaming download, CI/release pipeline (v0.8.0).
- Defender combined route, Scheduled tasks browser, Recall data wipe, Mass file unblock, Telemetry firewall (v0.9.0).
- Browser (Edge) tweaks + dedicated route, Driver rollback via pnputil, AMD/Intel smart vendor-page auto-find (v0.10.0).
- Windows activation launcher: read-only license state + one-click elevated PowerShell window running the external MAS script (v0.11.0).
- Security hardening route (LSA Protection, Controlled Folder Access, Defender ASR rules) + 12 extra privacy tweaks. Real portable build: dedicated single-exe variant via the `portable` Cargo feature, completely stateless on disk (v0.12.0).
- Install media builder: autounattend.xml generator that maps any Reclaim profile to `<FirstLogonCommands>`, plus optional ISO repack via Windows ADK `oscdimg.exe` (auto-installer for the ADK Deployment Tools when missing). Bloatware catalog brought to parity with Win11Debloat (63 → 144 entries, new OEM group). PowerShell one-liner installer `install.ps1` that bypasses Edge's "publisher unknown" prompt the same way ChrisTitusTech/winutil does (v0.13.0).
- CLI mode: same `reclaim.exe` accepts `--apply-profile`, `--apply-tweak`, `--remove-bloat`, `--import-profile`, `--export-state` etc. Build-time catalog export (`pnpm catalog:export`) ships TS catalog as `src-tauri/data/*.json` so headless and GUI share the exact same data (v0.14.0).
- Persistence service + tray companion: system-tray icon, optional autostart, hide-to-tray on close, single-instance lock, background timer (Tokio interval, 6h default). HKCU drift detection + re-apply per persisted profile (Strict / Update-only modes), Windows-Update + NVIDIA-driver push notifications (24h throttled, battery-aware). Settings → Background Service section ties it all together (v0.15.0).
- SYSTEM-context admin persistence + close-to-tray polish: per-profile opt-in scheduled task installed under `\Reclaim\Persist-<id>` runs `reclaim.exe --apply-profile <id> --admin-only` as SYSTEM at logon + interval — closes the v0.15.0 "HKLM-deferred" gap. Titlebar X now calls `win.hide()` directly when keep-in-tray is on (bypasses a Tauri 2 IPC-close bug on Windows where `prevent_close()` is ignored). Autostart no longer triggers UAC at boot. `RunEvent::ExitRequested → prevent_exit()` keeps the runtime alive if anything destroys the window externally (v0.15.1).

**Still open for v1.0.0**: i18n (DE + EN). Code-signing is no longer planned — the v0.11.0 activation launcher (literal `get.activated.win` URL in the binary) likely closes both the winget-pkgs and SignPath Foundation paths, so v1.0.0 ships unsigned via GitHub Releases only.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Svelte 5 (runes only), TypeScript strict, Vite 6, Tailwind v4, Bits UI |
| Routing | `svelte-spa-router` (hash) |
| Terminal | `@xterm/xterm` + `addon-fit` + `addon-web-links` |
| Rust | Tauri 2 + `winreg` + `windows-rs` (TokenElevation) |
| HTTP | `reqwest` 0.12 (rustls-tls) |
| PTY | `portable-pty` (ConPTY on Windows) |
| Persistence | localStorage (logs, theme) + `<app_data_dir>/activity.log` mirror; no DB |
| Window effect | Mica via `tauri.conf.json` `windowEffects` |
| Plugins | shell, dialog, opener, window-state, process, updater |

## Architecture

### `src/lib/tweaks/` — the catalog system

- **`catalog.ts`** — every tweak is a typed `Tweak` record with `apply: TweakOp[]`, optional `revert`, optional `check[]`. `TweakOp` is either `RegOp` (hive/path/name/type/value/defaultValue) or `ShellOp` (PowerShell script). Tweaks are grouped per category and unioned into `ALL_TWEAKS`. Currently 123 entries across 8 categories.
- **`bloatware.ts`** — 63 `BloatwareEntry` records with PowerShell wildcard patterns (`*Spotify*`). Frontend converts to regex via `patternMatches`. Groups: consumer, office, gaming, communication, media, system, other.
- **`profiles.ts`** — `Profile` references tweaks by id; `resolveProfileTweaks` looks them up. Built-ins: Gaming (12), Privacy Maximum (41), Performance (17), Reclaim Basics (dynamic — every `recommended: true` tweak).
- **`customProfiles.svelte.ts`** — `$state`-based reactive store backed by localStorage key `reclaim.custom-profiles`. CRUD for user-created profiles.
- **`profileEdit.svelte.ts`** — mini-store that carries a profile draft between `/profiles` (list) and `/profile-builder` (editor).
- **`bridge.ts`** — TS wrappers around every Tauri command. All `invoke()` calls go through here. Grouped by domain (system / registry / tweak / bloatware / winupdate / drivers / hosts / dns / winget / maintenance / files / icons / context-menu / onedrive / app-info).
- **`executor.ts`** — `applyTweak` / `revertTweak` / `getTweakState` / `tweakRequiresAdmin`. Hooks into `log` for every operation.

### `src/lib/` — shared

- **`log.svelte.ts`** — `$state`-based activity log, 500 entries, persists to localStorage **and** fires `log_append(entry)` to mirror as JSON-lines into `<app_data_dir>/activity.log`. `log.success/info/warn/error` with action + target + message + optional details.
- **`admin.svelte.ts`** — elevation store. `admin.elevated`, `admin.checked`, `admin.requesting`. `maybeAutoElevate` runs on cold launch (sessionStorage flag stops re-prompting after denial). `relaunchElevated` invokes Rust to UAC and exits.
- **`theme.svelte.ts`** — `system | light | dark`. Persists to localStorage. Toggled only via Settings (sidebar switcher was removed).
- **`prefs.svelte.ts`** — file-backed app preferences (currently theme only). Reads/writes via Rust `read_app_file` / `write_app_file` (atomic temp + rename), mirrored to localStorage for synchronous first paint.
- **`tasks.svelte.ts`** — long-running task registry. Each entry carries a unique task id, the active PTY session, and an xterm terminal instance so users can switch routes without losing maintenance output.
- **`cache.svelte.ts`** — SWR-style cache for Tauri queries (e.g. AppX list, services, hardware info). Stale-while-revalidate prevents flashing the empty state when navigating back.
- **`route-cache.svelte.ts`** — per-route component memoization so transitions don't re-mount expensive routes.
- **`scroll-restore.svelte.ts`** — per-route scroll position store, applied on route enter.
- **`startup-preload.svelte.ts`** — fires the slow Tauri queries (system info, installed AppX, services) on app boot so the corresponding routes open instantly.
- **`service.svelte.ts`** — Background-service config store mirrored to `<app_data_dir>/service.json`: interval, keep-in-tray, persisted profiles (with `update-only` vs `strict` mode), per-channel notification prefs, 24h throttle dedupe state. Subscribes to Rust events `service.tick` / `service.trigger-check` / `service.navigate` and fans them out to tick handlers + a router push handler. `App.svelte` mounts it on boot and wires the persistence + WU + driver checkers behind `onTick`.
- **`notify.ts`** — Native Win11 toast dispatcher via `tauri-plugin-notification`. `notify({channel,title,body,hash,route?})` checks the per-channel pref, 24h throttle, and OS permission; encodes the route as `[reclaim:/foo]` in the body so `onAction` can route the click back via `svelte-spa-router push()`.
- **`persistence/checker.ts`** — HKCU-only drift loop (runs in the user-context tray companion). Filters out admin-required tweaks and tweaks without `check[]`, optionally gates on `recent_hotfix_installed_since(48)` (update-only mode), re-applies anything reading as `off`, logs `persistence.drift.fixed` per fixed tweak + one drift toast per profile. Admin tweaks (HKLM / shell ops) are NOT skipped permanently — they're handled by the separate SYSTEM scheduled task installed via `persistenceInstallTask` (see `persistence.rs`).
- **`persistence/updateChecker.ts`** — Background WU + NVIDIA driver pollers. WU runs every 12h, drivers every 24h (timestamps in `service.json`). Both skip when on battery <30%. NVIDIA version compare is naive last-N-digits match against the marketing version.
- **`utils.ts`** — `cn()` via tailwind-merge + clsx.

### `src/lib/` — domain helpers (non-catalog)

- **`apps/catalog.ts`** — `AppEntry` type, 46 `UNIQUE_APPS`, `GROUP_LABELS`, `GROUP_ORDER`, 16 `RECOMMENDED_IDS`.
- **`hosts/`** — builtin blocklists (MS Telemetry, Office/Edge, MS Ads) and remote source URLs (StevenBlack lists).
- **`network/`** — DoH provider presets (Cloudflare, Cloudflare-Families, Quad9, AdGuard, Google, Mullvad) + DNS helpers.
- **`maintenance/`** — operation catalog (op id → label, description, expected duration, admin-required flag).
- **`profiles/`** — `GRADIENT_PRESETS` (8 named choices) + import/export helpers (parse / validate / serialize the `ProfileV1` envelope).

### `src/lib/ui/` — shadcn-style wrappers

Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Switch, Checkbox, Dialog, Titlebar, Toaster, **BulkActionBar** (floating pill at `bottom-5`, `rounded-2xl`, primary-accent dot), toast (`toast.success/error/warning/action`). Geist font (variable). Icons via `@lucide/svelte`.

### `src/lib/components/`

- **`Layout.svelte`** — Titlebar (with elevate-button) + 10-group sidebar (top / Clean up / Install / Customize / Network / Updates & drivers / System info / Licensing / App) + main scroll area. Sidebar uses `bg-foreground/[0.04] backdrop-blur-xl sidebar-bg` for the Win11 chrome look.
- **`ProfileCard.svelte`** — gradient-topped card with name, tagline, description, tweak-count, "Preview" button → confirm dialog → batch apply.
- **`ProfileIcon.svelte`** — small gradient avatar used in the sidebar / profile lists.
- **`TweakSection.svelte`** — header bar (active count + select-all + apply-recommended + revert-all) + Card list + BulkActionBar. Filters out admin-requiring tweaks in lite mode, shows banner.
- **`TweakRow.svelte`** — row with left primary-accent bar (when on or selected), checkbox (click anywhere on row to select), title + badges, switch on right. `data-no-select` on switch/checkbox.
- **`TweakPreviewDialog.svelte`** — pre-apply confirmation showing the exact registry/shell operations + reversibility status.
- **`AdminBanner.svelte`** — top-of-route banner for admin-required pages in lite mode; clickable to re-launch elevated.
- **`TerminalPanel.svelte`** — xterm widget bound to a `tasks` entry; resizes via ResizeObserver + `maintenance_pty_resize`, kill button calls `maintenance_pty_kill`.

### `src/routes/` — 32 routes

Routed by `svelte-spa-router`. Grouped in the sidebar as follows:

- **Top:** Dashboard (`/`), Profiles (`/profiles`)
- **Clean up:** Bloatware (`/bloatware`), OneDrive (`/onedrive`), AI & Copilot (`/ai`)
- **Install:** Apps (`/apps`)
- **Customize:** Privacy (`/privacy`), Defender (`/defender`)\*, Security hardening (`/security`)\*, Browser (`/browser`)\*, Explorer (`/explorer`), Right-click menu (`/context-menu`)\*, Taskbar & Start (`/taskbar`), Search (`/search`), Notifications (`/notifications`), Performance (`/performance`)
- **Network:** Hosts & blocklists (`/hosts`)\*, DNS & DoH (`/network`)\*, Firewall (`/firewall`)\*
- **Updates & drivers:** Windows Update (`/windows-update`), Drivers (`/drivers`), Update settings (`/updates`)
- **System info:** Specs (`/specs`), Startup apps (`/startup`), Services (`/services`)\*, Scheduled tasks (`/scheduled-tasks`)\*, Maintenance (`/maintenance`)\*
- **Licensing:** Activation (`/activation`)
- **App:** Activity log (`/logs`), Settings (`/settings`)
- Plus `/profile-builder` (entered from `/profiles`) and `NotFound` (`*`).

\* admin required — hidden / locked in restricted mode, click-to-elevate buttons everywhere.

### `src-tauri/src/` — 24 modules, 107 commands

- **`lib.rs`** — plugin init + `invoke_handler!` registry (107 commands). Uses the `Builder::build()? .run(|app_handle, event| ...)` pattern instead of plain `.run()` so `RunEvent::ExitRequested` can be intercepted with `prevent_exit()` — keeps the tray companion alive even if the main window is destroyed.
- **`cli.rs`** — headless CLI dispatcher. Parses argv, loads the embedded catalog JSON (`include_str!("../data/{tweaks,profiles,bloatware}.json")`, generated by `pnpm catalog:export`), and routes to the same registry / shell primitives the Tauri commands use. Entry: `cli::run() -> ExitCode`. Activated from `main.rs` whenever argv contains any `--`-flag besides `--no-elevate` and `--autostart`; the GUI elevate path is skipped. Calls `AttachConsole(ATTACH_PARENT_PROCESS)` first so the GUI-subsystem binary's println! lands in the parent terminal. Mirrors the GUI Activity Log to `%APPDATA%/Reclaim/activity.log` (same JSON-lines format). Supports `--admin-only` to filter `--apply-profile` / `--apply-tweak` to HKLM + shell ops only — used by the SYSTEM-running persistence scheduled task because `S-1-5-18`'s HKCU is not the user's hive.
- **`app_info.rs`** — `is_portable()`, `app_data_dir()`, `log_append(LogLine)`, `read_activity_log()`, `read_app_file(name)`, `write_app_file(name, content)`. Atomic writes via `.tmp` + rename. Portable mode is **compile-time** via the `portable` Cargo feature (`const PORTABLE: bool = cfg!(feature = "portable")`) — no marker files. In portable builds every disk-write here no-ops and `app_data_dir()` returns `""`; state lives only in localStorage inside the Webview2 user-data folder.
- **`sysinfo.rs`** — `get_system_info` (uses build-number for Win11 detection — `ProductName` is hardcoded to "Windows 10" by MS), `is_elevated` (windows-rs `TokenElevation`), `get_accent_color`, `relaunch_elevated` (`Start-Process -Verb RunAs`, then exit current). `try_elevate_at_startup` (called only from `main.rs` in release builds) skips when `--no-elevate` or `--autostart` is in argv — autostart entries must not pop UAC at every Windows login.
- **`sysquery.rs`** — `get_hardware_info` (WMI JSON), `list_startup_apps` (Run keys + Startup folders + StartupApproved binary + `StartupFolderPackagedAppX` for UWP), `set_startup_enabled` (writes 12-byte binary `0x02`/`0x03` to StartupApproved), `list_services`, `set_service`.
- **`tweaks.rs`** — `run_powershell` (pub(crate), `CREATE_NO_WINDOW`, base64-encoded payload when elevated, output via temp file), `list_installed_appx`, `remove_appx`, `reg_read` / `reg_read_many` / `reg_write` / `reg_delete_value`, `create_restore_point`, `restart_explorer`.
- **`winupdate.rs`** — `search_windows_updates` (online search via `Microsoft.Update.Session`), `install_windows_updates` (AcceptEula + Download + Install collection).
- **`driver_search.rs`** — `open_driver_search` opens a new `WebviewWindowBuilder` to vendor URL with `initialization_script` that fills NVIDIA dropdowns by option-text match and auto-clicks Search. AMD/Intel use a simpler search-box injector.
- **`driver_update.rs`** — `lookup_nvidia_driver(gpu_name)` queries the public NVIDIA series/family API for the latest driver. `download_driver(url, filename)` streams to `%DOWNLOADS%` with live progress events. `launch_installer(path)` spawns with `DETACHED_PROCESS`. `reveal_in_explorer(path)` opens Explorer `/select`.
- **`winget.rs`** — `winget_available`, `winget_version`, `winget_list_installed` / `winget_list_upgradable` (raw text; frontend regex-matches catalog IDs to versions), `winget_install` / `winget_uninstall` / `winget_upgrade` with `-e --silent --accept-source-agreements --accept-package-agreements`. Streaming variant `winget_run_stream(op, id, scope_user, on_event)` emits live stdout/stderr events to an xterm.
- **`network.rs`** — `read_hosts` / `write_hosts` (atomic; auto-backup to `hosts.reclaim.bak`), `has_hosts_backup` / `restore_hosts_backup`, `apply_blocklist` / `remove_blocklist` / `list_active_blocklists` (sentinel pattern `# >>> Reclaim: Name` … `# <<< Reclaim: Name`), `fetch_blocklist` (HTTP GET, parses hosts-format), `flush_dns`, `get_dns_servers` / `set_dns_servers` / `reset_dns_servers`, `set_doh_template`.
- **`maintenance.rs`** — ConPTY-backed maintenance runner. `maintenance_run_stream(task_id, op, cols, rows, on_event)` spawns the op in a `portable-pty` session, streams output via `tauri::ipc::Channel<StreamEvent>`. `maintenance_pty_resize(task_id, cols, rows)`, `maintenance_pty_kill(task_id)`. `unblock_files_stream(task_id, target, recursive, ...)` strips `Zone.Identifier` (Mark-of-the-Web) via `Unblock-File` — path is strictly validated then interpolated into a static-template script run through the same PTY pipeline (the shared helper is `run_pty_script`). Power-plan ops: `list_power_plans` (parses `powercfg /list` output), `set_power_plan(guid)`, `unlock_ultimate_performance` (duplicates the hidden GUID `e9a42b02-d5df-448d-aa00-03f14749eb61`), `delete_power_plan(guid)` (blocks built-in GUIDs). Plus `launch_cleanmgr`, `launch_memory_diagnostic`. GUID inputs validated; PowerShell payloads are static per operation, no string injection.
- **`onedrive.rs`** — `onedrive_detect` (process + registry + folder-redirection state), `onedrive_backup(target_dir, items)` (robocopy each source, path validation against safe roots), `onedrive_uninstall(disable_policy, remove_leftovers)` (stops process, runs `OneDriveSetup.exe /uninstall`, optionally removes leftover folders and writes the `DisableFileSyncNGSC` group policy).
- **`context_menu.rs`** — `context_menu_list` enumerates `ContextMenuHandlers` under Files/Folders/Folder-background/Drives/AllFileObjects, dedupes by CLSID, resolves friendly names from `HKCR\CLSID\<id>`. `context_menu_toggle(clsid, disabled)` writes `HKLM\…\Shell Extensions\Blocked\<guid>`.
- **`icons.rs`** — `get_file_icons(commands)` extracts base64-PNG icons from EXEs via `Icon.ExtractAssociatedIcon().ToBitmap()`. Uses a `ResolveCommand` helper that handles quoted paths, env-var expansion, `.lnk` target resolution, Squirrel-updater path-hop (`Update.exe` → `app-*.*.*\<Name>.exe`), and progressive whitespace trim for unquoted paths with embedded spaces (e.g. `F:\Riot Games\Riot Client\...`). `get_appx_icons(patterns)` reads `Square44x44Logo` (or fallbacks) from each installed package's `InstallLocation\AppxManifest.xml`. `resolve_commands(commands)` is the batch path resolver shared with Properties + Open File Location actions. `open_properties(command)` invokes the Shell.Application "Properties" verb.
- **`files.rs`** — `read_text_file(path)` / `write_text_file(path, content)` for paths picked via `@tauri-apps/plugin-dialog` (`save()` / `open()`). No `tauri-plugin-fs` dep.
- **`defender.rs`** — `defender_status` (Get-MpPreference + Tamper/SmartScreen reg reads → JSON), `defender_set_setting(setting, enabled)` (whitelisted `setting` enum maps to `Set-MpPreference` flag or specific reg write — no string interpolation from frontend), `defender_list_exclusions`, `defender_add_exclusion` / `defender_remove_exclusion` (`Add-MpPreference` / `Remove-MpPreference` with `ExclusionPath` / `ExclusionProcess` / `ExclusionExtension`, strict input validation).
- **`schtasks.rs`** — `list_scheduled_tasks` (parses `Get-ScheduledTask | Get-ScheduledTaskInfo` to JSON), `set_scheduled_task(path, name, enabled)`, `run_scheduled_task(path, name)`, `delete_scheduled_task(path, name)`. Path + name validated (must start with `\`, no quotes/newlines).
- **`recall.rs`** — `recall_status` detects the Copilot+ snapshot store under `%LOCALAPPDATA%\CoreAIPlatform.00` (presence, size, snapshot count, AppX state, policy state). `recall_wipe(also_remove_appx, also_set_policy)` uses `takeown` + `icacls` + recursive `Remove-Item` because the data dir is normally locked, then optionally writes `DisableAIDataAnalysis = 1` and removes the `MicrosoftWindows.Client.AIX` AppX.
- **`firewall.rs`** — Sentinel-grouped (`Reclaim:` prefix) outbound Windows Firewall block manager. `firewall_list_blocks` returns active reclaim groups with rule + enabled counts. `firewall_apply_block(name, programs, remote_addresses)` wipes the group then re-creates one program rule per exe path + one combined `-RemoteAddress @(...)` rule per group. `firewall_remove_block(name)` deletes the group. All name/path/address inputs strictly validated before interpolation.
- **`driver_packages.rs`** — `list_driver_packages(class_filter?)` enumerates OEM driver packages via `pnputil /enum-drivers`, parses the locale-agnostic key-value block format into typed `DriverPackage` records. `delete_driver_package(published_name, uninstall)` calls `pnputil /delete-driver oem<N>.inf /uninstall /force` after strict `oem<digits>.inf` validation.
- **`activation.rs`** — `get_activation_status` runs a static PowerShell snippet that queries WMI `SoftwareLicensingProduct` (filtered to Windows products with a `PartialProductKey`), parses the JSON output into a typed `ActivationStatus` (edition name, license status code + text, channel, partial key, grace minutes). `launch_activation_script` spawns a new elevated PowerShell window via `Start-Process -Verb RunAs` that runs the **static** MAS one-liner `irm https://get.activated.win | iex` — the URL is a Rust `const`, never built from frontend input. Reclaim does not bundle, modify, or contain the activation script itself; the launched window lives outside Reclaim's PTY infrastructure on purpose (interactive TUI menu).
- **`service.rs`** — Tray-resident background timer. `ServiceState` (Mutex<u32> interval_hours, Mutex<bool> keep_in_tray + force_quit) is registered via `tauri::Manager::manage()`. `spawn_loop(app_handle)` runs a Tokio task that sleeps in 60s ticks and emits `service.tick` every `interval_hours` (1–168, default 6). Commands: `service_set_interval`, `service_get_interval`, `service_set_keep_in_tray`, `service_trigger_now`. Helper `emit_navigate(route)` is used by the tray "Settings…" menu to push routes via the frontend's `service.navigate` event listener. The `--autostart` CLI flag (no-op, added to `cli::argv_is_cli` + `cli::parse_args` skip lists) tells `lib.rs` setup to hide the window on launch so autostart boots straight to tray. The tray icon + menu live in `lib.rs::run()`'s `.setup()` hook using `tauri::tray::TrayIconBuilder` (gated by the `tray-icon` feature on the `tauri` crate). Window-close hides instead of quitting when `keep_in_tray && !force_quit`. `tauri-plugin-single-instance` focuses the existing window on a second launch attempt.
- **`persistence.rs`** — SYSTEM-context persistence via per-profile scheduled tasks. Commands: `persistence_install_task(profile_id, profile_name, interval_hours)`, `persistence_uninstall_task(profile_id)`, `persistence_task_status(profile_id) -> PersistenceTaskStatus`, `persistence_run_task_now(profile_id)`. Static PowerShell wraps `Register-ScheduledTask` with `TaskPath '\Reclaim\'`, name `Persist-<profile_id>`, principal `SYSTEM / ServiceAccount / RunLevel Highest`, triggers `AtLogOn + repetition every interval_hours`, action `reclaim.exe --apply-profile <id> --admin-only --silent --no-elevate`. Profile ids are validated to `[A-Za-z0-9_-]{1,128}` before any interpolation. Installing / uninstalling / triggering requires the parent process (`reclaim.exe` itself) to be elevated; the per-profile UI gates the toggle on `admin.elevated`.

## Critical conventions

1. **Tweak is data, not code.** New tweak = one entry in `catalog.ts`. Logic stays in executor.
2. **Svelte 5 runes only**: `$state`, `$derived`, `$effect`, `$props`. No `export let`, no legacy stores in components.
3. **English UI strings, English code comments.** No German UI text anywhere (until Phase 6 i18n lands).
4. **No comments except when WHY is non-obvious.** Don't narrate what code does.
5. **Reversibility is contract.** Every tweak either supplies `revert: TweakOp[]` or has `defaultValue` on every reg op so the fallback revert can restore. Shell-based tweaks MUST supply explicit `revert`.
6. **Admin detection per tweak**: any `RegOp` with `hive: "HKLM"` OR any `ShellOp` → `tweakRequiresAdmin == true`. Lite-mode filters these out.
7. **PowerShell scripts are static**, never built from user input. Where user-controlled input is needed (e.g. power-plan GUID, blocklist URL, adapter name), validate it in Rust before interpolating.
8. **AppX patterns** are PowerShell wildcards (`*Foo*`). Bloatware UI converts to regex for matching against `Get-AppxPackage` output. **The Bloatware page hides entries that aren't installed** — never show "Not present" rows; rely on the live AppX scan to decide what to display.
9. **Card list pattern**: use `<Card class="overflow-hidden gap-0 py-0 card-inset">` for row lists. The base Card has `gap-6` for stacked content; lists need `gap-0`.
10. **BulkActionBar pattern**: rows have `data-no-select` on interactive controls; rest of row is click-to-select.
11. **Every Rust command → `bridge.ts` wrapper → typed.** No raw `invoke()` in routes.
12. **Every long-running op streams via Channel + xterm.** Don't show a spinner for anything that can take >2 seconds — wire a `TerminalPanel`.

## How to add a tweak

```ts
// in catalog.ts
{
  id: "kebab-case-id",
  category: "privacy",   // or one of the 8 categories
  title: "Short title",
  description: "One-sentence what+why.",
  recommended: true,     // optional
  requiresRestart: "explorer" | "logon" | "system",  // optional
  warning: "If something can break, say it here.",   // optional
  apply: [
    { kind: "reg", hive: "HKCU", path: "...", name: "Foo", type: "DWORD", value: 1, defaultValue: 0 },
  ],
  check: [
    { kind: "reg", hive: "HKCU", path: "...", name: "Foo", type: "DWORD", value: 1 },
  ],
  // revert is auto-derived from defaultValue OR delete-on-revert
}
```

For shell ops, you MUST supply `revert`:
```ts
apply: [{ kind: "shell", script: "Set-Service X -StartupType Disabled" }],
revert: [{ kind: "shell", script: "Set-Service X -StartupType Automatic" }],
```

## How to add a route

1. Create `src/routes/Foo.svelte`
2. Import in `src/App.svelte`, add to `routes` map
3. Add nav entry in `src/lib/components/Layout.svelte` `navGroups`
4. If admin-only, set `adminOnly: true` on the nav entry — Layout marks with `ShieldAlert`
5. If the route does anything slow on mount, add a preload entry in `startup-preload.svelte.ts`

## How to add a Rust command

1. Implement in the appropriate module (e.g. `tweaks.rs` / `sysquery.rs` / `winupdate.rs`)
2. Mark with `#[tauri::command]`
3. Register in `src-tauri/src/lib.rs` `invoke_handler!`
4. Wrap in `src/lib/tweaks/bridge.ts` (camelCase TS wrapper; normalize snake_case → camelCase if needed)

## How to add a profile

In `src/lib/tweaks/profiles.ts`, add a `Profile` entry with:
- `id`, `name`, `tagline`, `description`
- `gradient` (Tailwind gradient classes — used in card top stripe and icon background)
- `tweakIds: string[]` — references existing tweak ids; missing ids are silently dropped at resolve time.

## Commands

- `pnpm tauri:dev` — full app (Webview2, hot reload)
- `pnpm dev` — frontend only (Tauri APIs unavailable; UI shows "Browser preview" hints)
- `pnpm check` — svelte-check (must be 0 errors before commit)
- `pnpm catalog:export` — re-emit `src-tauri/data/*.json` from the TS catalog (auto-run before every `pnpm tauri:build`).
- `pnpm build` — Vite production build
- `pnpm tauri:build` — release bundle (NSIS + MSI in `src-tauri/target/release/bundle/`)
- `cargo check` (from `src-tauri/`) — Rust validate

## CLI mode

The release binary doubles as a headless CLI. Examples:

```powershell
reclaim.exe --list-profiles
reclaim.exe --list-tweaks --category privacy --json
reclaim.exe --apply-profile basics --silent
reclaim.exe --apply-tweak telemetry-off,advertising-id-off
reclaim.exe --remove-bloat "*Spotify*,Microsoft.BingNews"
reclaim.exe --import-profile gold-image.reclaim --apply --include-bloatware --silent
reclaim.exe --export-state --json > state.json
reclaim.exe --apply-profile privacy-max --admin-only --silent   # SYSTEM-context: HKLM+shell only
```

Catalog source-of-truth is still the TS files under `src/lib/tweaks/`. `pnpm catalog:export` (auto-run before `pnpm tauri:build`) dumps them to `src-tauri/data/*.json` and `cli.rs` embeds those via `include_str!`. **If you add a tweak or profile, re-run the export before testing the CLI.** The GUI never reads the JSON files; it uses the TS catalog directly.

## Tauri config notes

- `transparent: true` + `windowEffects: { effects: ["mica"] }` for Win11 Mica.
- `decorations: false` — custom titlebar via `lib/ui/Titlebar.svelte`.
- Body `bg` is `oklch(0.99 0 0 / 94%)` light / `oklch(0.14 0.006 285 / 82%)` dark → mostly opaque so Mica falls back gracefully on unsupported systems.
- Card uses `bg-card/95 backdrop-blur-md` — frosted glass over Mica.
- Sidebar uses `bg-foreground/[0.04]` (theme-agnostic 4% overlay) + `sidebar-bg` radial gradient hint.
- `plugins.updater` configured with the Ed25519 pubkey and a GitHub Releases endpoint (`https://github.com/jonax1337/reclaim/releases/latest/download/latest.json`).

## CI / Release pipeline

- **`.github/workflows/check.yml`** — runs `svelte-check` + `cargo check` on every push to `main` and every PR. Uses pnpm 9 + Node 20 + Rust stable on `windows-latest`.
- **`.github/workflows/release.yml`** — triggers on `v*` tags or `workflow_dispatch`. Builds NSIS + MSI via `pnpm tauri build`. If `TAURI_SIGNING_PRIVATE_KEY` is set as a secret, the bundle is signed and `latest.json` is generated for the updater. Drafts a GitHub Release with the artifacts.
- **Updater key**: Ed25519 keypair generated via `pnpm tauri signer generate -p "" -w .updater-key -f --ci` (passwordless for CI). Private key is in repo secret `TAURI_SIGNING_PRIVATE_KEY`. Public key is committed in `.updater-key.pub` and embedded in `tauri.conf.json` `plugins.updater.pubkey`. **Never commit `.updater-key`** — it's in `.gitignore`.

## Cargo deps

```toml
tauri = "2"
tauri-plugin-{shell,dialog,opener,window-state,process,updater} = "2"
serde, serde_json, thiserror
reqwest = { version = "0.12", default-features = false, features = ["json", "stream", "rustls-tls"] }
futures-util = "0.3"
regex = "1"
dirs = "5"
portable-pty = "0.8"
base64 = "0.22"
[target.cfg(windows)] winreg = "0.52", windows = "0.58" (Foundation, Registry, Security, Threading)
```

## Don't

- Don't open new `WebviewWindow` for in-app routes — use `svelte-spa-router push()`. The driver-search window is the only exception (loads external URL).
- Don't bypass `bridge.ts` — every `invoke()` must go through a typed wrapper.
- Don't add a tweak that doesn't have either `revert` or full `defaultValue` coverage.
- Don't store sensitive data in localStorage. The activity log is fine; never write tokens or registry secrets there.
- Don't disable the auto-elevate prompt — denial is tracked in sessionStorage so it doesn't re-prompt that session.
- Don't use German strings anywhere in the UI (until Phase 6 i18n).
- Don't write to HKLM without checking `admin.elevated` (the executor will fail silently, but you'd skip the UX feedback).
- Don't `gap-6` on a list card — use `gap-0 py-0`.
- Don't run long PowerShell ops with a spinner. Wire `TerminalPanel` + `tasks` + a streaming Rust command.
- Don't commit `.updater-key` (private signing key). The public key + GH Actions secret are the only copies that should exist.

## Further reading

- `CHANGELOG.md` — per-version diff from v0.1.0 to v0.8.0.
- `docs/ROADMAP.md` — phased plan (Phases 1-6) with shipped vs open items.
- `docs/ARCHITECTURE.md` — deeper dive on the tweak engine + bridge layer.
- `docs/CONTRIBUTING.md` — workflow for contributors.
- `README.md` — user-facing overview.
