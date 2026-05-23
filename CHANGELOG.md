# Changelog

All notable changes to Reclaim. Format loosely based on [Keep a Changelog](https://keepachangelog.com/).

## v0.9.0

### Added

- **Defender** (`/defender`) — Combined route for Microsoft Defender. Live toggles for real-time protection, cloud-delivered protection, automatic sample submission, PUA blocking, network protection, controlled folder access, and SmartScreen (Explorer / Edge / Store). Read-only Tamper Protection indicator and policy-managed banner. Exclusions editor for Files & folders, Processes, and File extensions with pick-folder / pick-file shortcuts. New Rust module `defender.rs` with `Get-MpPreference` / `Set-MpPreference` / `Add-MpPreference` / `Remove-MpPreference` wiring.
- **Scheduled tasks** (`/scheduled-tasks`) — Browser for every registered scheduled task on the system. Groups by task path, expandable per group, hides Microsoft tasks behind a toggle (still surfaces 13 known telemetry tasks as "Notable"). Per-task Enable / Disable / Run / Delete with optimistic state. New Rust module `schtasks.rs` (`list_scheduled_tasks` parses `Get-ScheduledTask | Get-ScheduledTaskInfo` to JSON).
- **Recall data wipe** (in `/ai`) — Status card on the AI route detects the Copilot+ snapshot store (`%LOCALAPPDATA%\CoreAIPlatform.00`), shows disk use + snapshot count, and offers a destructive wipe button. Options for "also write `DisableAIDataAnalysis` policy" and "also remove the `MicrosoftWindows.Client.AIX` AppX". New Rust module `recall.rs` (`takeown` + `icacls` + recursive remove).
- **Mass file unblock** (in `/maintenance`) — New "Files" section in the maintenance route. Pick a folder or file, optionally recurse, then strip `Zone.Identifier` (Mark-of-the-Web) via `Unblock-File`. Output streams live into the embedded PTY terminal. New Tauri command `unblock_files_stream` on top of a refactored `maintenance::run_pty_script` helper so other future ops can reuse the PTY pipeline.
- **Telemetry firewall** (`/firewall`) — Sentinel-managed (`Reclaim:` group) Windows Firewall outbound blocks for MS telemetry programs (CompatTelRunner, DeviceCensus, wermgr, …), telemetry endpoint IPs, ads/suggestions IPs, and Office telemetry IPs. Curated lists in `src/lib/network/firewall.ts`. Apply / Re-apply / Remove operations idempotent — re-apply refreshes the rule set. New Rust module `firewall.rs` wraps `New-NetFirewallRule` / `Get-NetFirewallRule` / `Remove-NetFirewallRule`.

### Internal

- Refactored `maintenance.rs` to expose `run_pty_script(task_id, script, cols, rows, on_event)` so streaming PTY consumers beyond `maintenance_run_stream` (now also `unblock_files_stream`) can share the ConPTY plumbing.
- Sidebar grew by 3 entries: Defender (Customize, admin), Scheduled tasks (System info, admin), Firewall (Network, admin). Total routes: 29.
- New `LogAction` variants: `defender.toggle`, `defender.exclusion.add`, `defender.exclusion.remove`, `schtasks.toggle`, `schtasks.run`, `schtasks.delete`, `recall.wipe`.

## v0.8.0

### Added

- **OneDrive removal** (`/onedrive`) — Hero card with real Microsoft OneDrive logo + status badges (Running / Idle / Installed). Two-step flow: pick redirected folders to back up (Documents / Desktop / Pictures / sync root) via Tauri dialog → `robocopy` to chosen path; then uninstall via the official `OneDriveSetup.exe /uninstall`, remove leftover folders, unpin the sidebar CLSID, optionally write the `DisableFileSyncNGSC` group policy.
- **Right-click menu editor** (`/context-menu`) — List & toggle shell-extension `ContextMenuHandlers`. Aggregates Files / Folders / Folder-background / Drives / AllFileObjects, dedupes by CLSID, resolves friendly names from `HKCR\CLSID\<id>`. Toggle writes `HKLM\…\Shell Extensions\Blocked\<guid>`. System entries dimmed by default with a Show-System toggle. Disabled entries bubble to the top.
- **Real shell icons** for Startup, Bloatware, OneDrive:
  - `src-tauri/src/icons.rs` — `get_file_icons(cmds)` with a `ResolveCommand` helper that handles quoted paths, env-var expansion, `.lnk` target resolution, Squirrel-updater path-hop (`Update.exe` → `app-*.*.*\<Name>.exe`), and progressive whitespace trim for unquoted paths with embedded spaces. PNG bytes via `Icon.ExtractAssociatedIcon($resolved).ToBitmap()`.
  - `get_appx_icons(patterns)` reads `Square44x44Logo` (or fallbacks) from each installed package's `InstallLocation\AppxManifest.xml` — same files Start Menu uses.
  - `resolve_commands(cmds)` batch path resolver, reused by Properties verb and Open File Location actions.
  - `open_properties(command)` invokes the Shell.Application "Properties" verb on the resolved path.
- **NVIDIA driver auto-update** (`driver_update.rs`) — Queries the public NVIDIA series/family API for the latest driver, streams the download with live progress events to a TerminalPanel, launches the installer detached.
- **Startup enumerator** now also scans `StartupFolderPackagedAppX` (the UWP autostart bucket) and renders UWP entries with their real package icons.
- **Per-row 3-dot menu** (fixed-positioned popover that escapes Card overflow): Open file location · Properties · Copy path/AUMID · Search online.
- **CI**: `.github/workflows/check.yml` runs svelte-check + cargo check on every push/PR. `.github/workflows/release.yml` triggers on `v*` tags or `workflow_dispatch`; builds NSIS + MSI via `pnpm tauri build`, optionally signs with `TAURI_SIGNING_PRIVATE_KEY`, generates `latest.json` for the updater, drafts a GitHub Release with the artifacts.

## v0.7.0 — Phase 6 (partial)

### Added

- **Profile file format** — Export writes `.reclaim` files (still JSON inside). Import accepts both `.reclaim` and `.json` for backwards compatibility.
- **Portable mode** — `is_portable()` returns true when `portable.txt` or a `data/` directory sits next to the executable. `app_data_dir()` resolves to either `<exe-dir>/data` (portable) or `%APPDATA%/Reclaim` (installed) and creates it on demand. Settings page shows the mode + a clickable path that opens the folder in Explorer.
- **Log mirror** — `log_append(entry)` writes one JSON line per log entry to `<app_data_dir>/activity.log`. `log.svelte.ts` fires this fire-and-forget alongside the localStorage write. Crash-safe — survives webview cache wipes.
- **Auto-updater** — `tauri-plugin-updater` plugin wired in (Cargo + Rust init + JS dep). Settings page has a "Check for updates" button. Falls back to opening the GitHub releases page in the browser when the updater isn't configured.
- New Rust module: `src-tauri/src/app_info.rs`.

### Open for v1.0.0

- i18n (DE + EN locales).
- Code-signing the installer (EV cert or SignPath).

## v0.6.0 — Phase 5: Profile Builder + Import/Export

### Added

- **`/profiles`** — Full profile management with built-in section (read-only, exportable) and custom section (edit / export / delete / apply). Header has Import + New buttons.
- **`/profile-builder`** — Form-driven creator/editor: name / tagline / description / gradient picker, two `<details>`-based accordions for tweaks (grouped by category) and bloatware (grouped by category). "Add all recommended" shortcut, per-section all/none toggle.
- **`ProfileV1`** versioned JSON envelope schema (`schemaVersion: 1`, name / tagline / description / gradient / tweakIds / bloatwarePatterns / custom / createdAt). `parseEnvelope()` validates, drops unknown tweak ids (warns user), regenerates id.
- **`customProfiles`** reactive `$state` store backed by localStorage key `reclaim.custom-profiles`. `profileEdit` mini-store carries the draft between Profiles list and ProfileBuilder.
- **`GRADIENT_PRESETS`** — 8 named gradient choices (Violet / Indigo / Emerald / Sunset / Sky / Rose / Lime / Slate).
- **`src-tauri/src/files.rs`** — Tiny `read_text_file` / `write_text_file` commands for paths picked via `@tauri-apps/plugin-dialog` (`save()` / `open()`). No `tauri-plugin-fs` dep.
- Sidebar: "Profiles" added to the unlabeled top group next to Dashboard.

## v0.5.0 — Phase 4: System Maintenance

### Added

- **`/maintenance`** — Three sections (Repair / Cleanup & disk / Defender / Reset) plus a Power Plans manager. Live xterm terminal (ConPTY) with autoscroll shows stdout/stderr line-by-line.
- **Operations**:
  - Repair: SFC `/scannow`, DISM CheckHealth / ScanHealth / RestoreHealth, chkdsk scan / spotfix, WinSxS cleanup + ResetBase
  - Cleanup: temp cleanup, icon cache reset, font cache reset, Store reset, CleanMgr launcher
  - Defender: signature update, quick / full / offline scan
  - Reset: Windows Update components, print spooler, network stack (winsock + ip + flushdns + release/renew), firewall, Memory Diagnostic launcher
- **Power plans** — list with active flag, one-click activate, "Unlock Ultimate Performance" duplicates the hidden GUID so it appears in the list, delete custom plans.
- **`src-tauri/src/maintenance.rs`** — Streaming via ConPTY (`portable-pty`). PTY session per task id, resize support, kill support. GUID input validated for power-plan ops; PowerShell payload is static per operation, no string injection.
- **Bridge**: `maintenanceRunStream(op, taskId, onEvent)`, `listPowerPlans`, `setPowerPlan`, `unlockUltimatePerformance`, `deletePowerPlan`, `launchCleanmgr`, `launchMemoryDiagnostic`.
- New log actions: `maintenance.run`, `power.set`, `power.unlock`, `power.delete`.

## v0.4.0 — Phase 3: Tweak breadth (+71 tweaks, new Notifications category)

### Added

- **New category**: `notifications` + `/notifications` route. 8 entries: toasts off, sounds off, lock-screen toasts off, tips/tricks, welcome experience, finish-setup, Start app suggestions, Defender summary off.
- **+15 Privacy**: inking/typing personalization; app access (Account, Contacts, Calendar, Call History, Messaging, App diagnostics); SmartScreen (Explorer / Edge / Store); Compat Appraiser + ProgramDataUpdater scheduled tasks; clipboard history; app launch tracking; handwriting data sharing.
- **+5 AI**: Paint Cocreator, Photos generative erase, WindowsAI policy umbrella, Edge Hub sidebar (Bing Chat), Office connected experiences feedback.
- **+5 Search**: SafeSearch, device search history, MSA/AAD cloud search, recent docs in Start.
- **+10 Explorer**: compact mode, no `- Shortcut` suffix, drive letters first, nav-pane expand / show-all, confirm-file-delete back, restore Explorer on logon, verbose status messages, hide Quick Access pinned/recent, thumbcache off on network.
- **+8 Taskbar**: combine-when-full, small mode, hide search box, hide tray People, multi-monitor current-monitor-only, primary-monitor-only, `NoRecentDocsHistory`, show-all-tray icons.
- **+5 Updates**: exclude drivers from WU, extended active hours (6–23), notify before download, block Insider Preview, no-auto-restart-with-users.
- **+10 Performance**: Reserved Storage off (DISM), NTFS last-access off (`fsutil`), scheduled defrag off, IPv6 Teredo off, NDU service off, High Performance plan, menu show delay 0ms, visual effects best-performance, WSearch indexing off.
- `PROFILES.privacy-max` extended to ~50 ids; `PROFILES.gaming` and `PROFILES.performance` reference the new perf tweaks.

## v0.3.0 — Phase 2: App Manager via winget

### Added

- **`/apps`** — Curated winget catalog with ~60 apps across 8 groups (Browsers, Communication, Dev, System tools, Media, Office, Gaming, Utilities). Per-app install / upgrade / uninstall, BulkActionBar for multi-install, Select-Recommended, upgrade-available badge with version diff.
- **`src-tauri/src/winget.rs`** — `winget_available`, `winget_version`, `winget_list_installed` / `winget_list_upgradable` (returns raw text; frontend regex-matches catalog IDs to versions), `winget_install` / `winget_uninstall` / `winget_upgrade` with `-e --silent --accept-source-agreements --accept-package-agreements`. Streaming variant `winget_run_stream` for live xterm output.
- **`src/lib/apps/catalog.ts`** — `AppEntry` type, `UNIQUE_APPS`, `GROUP_LABELS`, `GROUP_ORDER`, `RECOMMENDED_IDS`.
- Missing-winget banner with deep-link to App Installer in MS Store (fallback to web URL).
- New log actions: `app.install`, `app.uninstall`, `app.upgrade`.

## v0.2.0 — Phase 1: Network & Hosts

### Added

- **`/hosts`** — Curated builtin blocklists (MS Telemetry, Office/Edge, MS Ads) plus remote StevenBlack lists fetched on demand. Sentinel-based merge (`# >>> Reclaim: Name` … `# <<< Reclaim: Name`) leaves user lines untouched. Raw editor dialog with auto `hosts.reclaim.bak` and one-click restore.
- **`/network`** — DNS & DoH presets (Cloudflare / Cloudflare-Families / Quad9 / AdGuard / Google / Mullvad). One-click apply-to-all-connected, per-adapter custom servers, reset-to-DHCP, flush-cache.
- **`src-tauri/src/network.rs`** — hosts read/write/backup/restore, blocklist apply/remove, sentinel scan, `fetch_blocklist` via `reqwest`, DNS get/set/reset, DoH template add.
- New log actions: `network.blocklist_apply / remove`, `network.hosts_edit / restore`, `network.dns_set / reset`, `network.doh_set`.

## v0.1.0 — initial feature-complete baseline

### Added

**Tweaks** (~50 across 7 categories):
- Privacy: telemetry, advertising ID, activity history, location, feedback nag, tailored experiences, Find my device, error reporting, CEIP, Wi-Fi Sense, autoplay, OneDrive sync ads, clipboard cloud sync, shared experiences, Spotlight desktop, suggested actions
- AI & Copilot: Copilot, Recall, Click to Do, Edge AI, Notepad Copilot
- Search: Bing in Start, Cortana, web search, search highlights
- Explorer: classic context menu, file extensions, hidden files, hide Home/Gallery, launch This PC, long path support, full path in title bar
- Taskbar & Start: align left, hide widgets/task view/chat, hide sponsored recs, lockscreen tips, seconds in clock, hide recently added / most used, taskbar end-task
- Performance: Sticky/Toggle/Filter keys prompts, background apps, Storage Sense, Fast Startup, Game DVR, mouse accel, DiagTrack service, telemetry scheduled tasks, hibernation
- Updates: defer features, no auto-restart, delivery optimization off

**Bloatware remover** — ~55 curated AppX patterns with live detection. Groups: consumer, office, gaming, communication, media, system.

**Profiles** — Gaming, Privacy Maximum, Performance, Reclaim Basics.

**Windows Update center** — search + install via `Microsoft.Update.Session` COM API. Filter by Security / Quality / Driver / Optional. EULA auto-accept.

**Drivers page** — GPU detection (NVIDIA / AMD / Intel), shortcut to Windows Update driver scan, vendor-link buttons with anti-bloat install hints, **Auto-Search** child webview with form pre-filled and search auto-clicked.

**System info**:
- Specs route — CPU, GPU (driver + date + resolution), RAM (with module slots), storage, motherboard, BIOS
- Startup apps route — HKCU/HKLM Run keys + Startup folders + StartupApproved binary toggle
- Services route — curated "notable services" list with explanations, "Show all" mode, confirm-disable dialog

**Activity log** — 500-entry localStorage-backed log, filterable by severity, expand for stderr.

**Self-elevation flow** — auto-UAC at cold launch, sessionStorage-tracked denial, lite-mode that hides admin-requiring tweaks, click-to-elevate from titlebar / Dashboard / TweakSection / Services.

**Floating BulkActionBar** — slide-up pill at bottom-center for multi-select operations.

**Settings** — theme picker (system/light/dark), restore point button, Explorer restart, about info.

**UI / UX**:
- Win11 Mica via `tauri.conf.json` windowEffects + transparent
- Custom titlebar with elevate badge
- Sidebar with grouped sections, active-state gradient + dot indicator
- Violet/fuchsia accent (oklch hue 285)
- Card-inset shadow pattern, backdrop-blur frosted-glass
- Geist variable font
- Row click-to-select pattern with `[data-no-select]` guard for switches/checkboxes

**Win11 detection fix** — `ProductName` is hardcoded to "Windows 10" by Microsoft; we derive product name from build number (≥22000 → Win11) + EditionID mapping.

**Restore points** — `Checkpoint-Computer` via PowerShell from Dashboard and Settings.

### Architecture decisions

- Tweak is data (typed records in `catalog.ts`), not code
- Reversibility built into the tweak schema (`defaultValue` or explicit `revert`)
- Live state detection (no caching, registry-direct reads)
- TS bridge layer (`bridge.ts`) is the only contract between frontend and Rust
- localStorage for log persistence, sessionStorage for transient flags
- Mica with opaque fallback for non-Win11 / older Win11 builds
