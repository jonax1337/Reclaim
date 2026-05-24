# Changelog

All notable changes to Reclaim. Format loosely based on [Keep a Changelog](https://keepachangelog.com/).

## v0.13.1

### Fixed

- **Auto-updater actually-actually installs now.** v0.12.1's headline fix wired up `update.downloadAndInstall()` in the frontend — but Tauri 2's capability ACL was never extended to allow `plugin:updater|check`, so every call has been failing with `Command plugin:updater|check not allowed by ACL` since v0.7.0 when the updater plugin was first wired up. The Settings page caught the error, fell back to `openUrl(".../releases")`, and looked like it was "opening the releases page by design" — but it was actually error-recovery the whole time. Adding `updater:default` to `src-tauri/capabilities/default.json` unblocks all four updater commands (check, download, install, download-and-install) for real this time.

### Note for users on v0.13.0 and earlier

This fix needs to ship in a binary you install manually once. The v0.13.0 client still has the broken capabilities file and will keep falling back to the releases page. Grab v0.13.1's NSIS / MSI from this release (or use the `irm "…/install.ps1" | iex` one-liner) — after that, the in-app updater works for every future version.

## v0.13.0

### Added

- **Install media builder (`/iso-builder`)** — New route under the **Install** sidebar group that generates a customized `autounattend.xml` and (optionally) repacks an existing Windows 11 ISO with it baked in. Two-phase workflow:
  - **Phase 1 — autounattend.xml generator.** Configure locale (6 presets: DE / EN-US / EN-GB / FR / ES / IT — auto-fills language, keyboard, timezone, GeoID), local admin account (no MS-account flow), Windows edition (12 KMS client setup keys for SKU selection), install bypasses (TPM / Secure Boot / RAM / Storage / CPU / BypassNRO / skip MS account / EULA / OOBE privacy prompts) and OOBE privacy defaults (telemetry, ad ID, location, tailored experiences, find-my-device, inking/typing, diagnostic data cap, Cortana). Picks any Reclaim profile (built-in + custom) as the debloat source — its registry tweaks and AppX removals are emitted as `<FirstLogonCommands>` so the XML is self-contained. Save via dialog, drop on a Rufus/Ventoy USB.
  - **Phase 2 — ISO repack.** Picks an existing Win11 ISO, mounts it, injects the generated autounattend.xml at the root and `\sources`, and repacks as a hybrid BIOS+UEFI bootable ISO via `oscdimg.exe` from the Windows ADK Deployment Tools. PTY-streamed progress to the global terminal panel.
- **ADK auto-installer.** When `oscdimg.exe` isn't found, the UI now offers a one-click "Install Deployment Tools (auto)" button. Streams Microsoft's official `adksetup.exe` web-stub (~1.5 MB) from the stable fwlink, launches it with `/features OptionId.DeploymentTools /ceip off /norestart` so only the ~200 MB feature we actually need installs (not the full 3 GB ADK). Inline download progress bar plus a "Re-check" button.
- **PowerShell one-line installer (`install.ps1`)** — `irm "https://github.com/jonax1337/reclaim/raw/main/install.ps1" | iex` fetches the latest release from GitHub, lets you pick installer / portable / MSI (or honors `$env:RECLAIM_MODE`), downloads to %TEMP%, strips Mark-of-the-Web via `Unblock-File`, and launches with UAC. Bypasses Edge's "publisher unknown" prompt the same way [ChrisTitus' WinUtil](https://christitus.com/winutil/) does. Documented in README and auto-included in every release's notes via the workflow.
- **Compositional `Select` UI primitive** in `src/lib/ui/select/` (shadcn-svelte pattern over bits-ui) — `Select.Root` / `Trigger` / `Content` / `Group` / `Label` / `Item`. Styled trigger with chevron, animated portal content, item check-indicator, group headings.
- **XML preview dialog** (`src/lib/components/XmlPreviewDialog.svelte`) — wide modal (`min(1280px, calc(100vw-2rem))`) with browser-native XML syntax highlighting (tags violet, attrs rose, values sky, comments green-italic, declarations fuchsia, CDATA amber, dark-mode variants of each), file-meta strip (line + char count), Copy-to-clipboard button, and a Save-to-disk action.

### Changed

- **Bloatware catalog: 63 → 144 patterns.** Brings parity with Win11Debloat's full Apps.json (147 entries). New group `oem` for HP / Lenovo / Dell pre-installs (25 entries). +17 missing Microsoft apps (3DBuilder, Bing Food/Health/Travel/Translator, Copilot+ AIHub for 24H2, PCManager, Messaging, 3DViewer, Journal, PowerBI, NetworkSpeedTest, News, Sway, Print3D, DevHome, MicrosoftFamily). +33 third-party games and apps not covered by existing wildcards (Duolingo, Plex, Hulu, Pandora, Shazam, Viber, XING, Fitbit, BubbleWitch, Asphalt8, Caesars Slots, Cooking Fever, FarmVille2, March of Empires, NYT Crossword, Royal Revolt, Adobe Photoshop Express, SketchBook, PicsArt, Phototastic, Polarr, Flipboard, …). +17 opt-in Microsoft utility entries (Calculator, Notepad, Photos, Camera, Snipping Tool, Paint, Paint 3D, Store, Terminal, Whiteboard, RemoteDesktop, …) gated behind explicit warnings — `recommended: false`, never auto-selected.
- **Activation status hero glow** now tints with the actual license status (success-green when licensed, amber when unlicensed) instead of the static violet accent. Matches the in-card status badge so the whole section reads as one unit.
- **Sidebar:** new entry under **Install** → "Install media" (`Disc3` icon). 32 → 33 routes.

### Internal

- New Rust modules `src-tauri/src/unattend.rs` (pure XML synthesis from typed config; `generate_autounattend_xml`, `save_autounattend_xml`, `list_win11_editions`) and `src-tauri/src/iso_builder.rs` (`iso_check_tools`, `iso_build`, `download_adk_setup`, `launch_adk_installer`). All path inputs strictly validated; PowerShell pipeline scripts are static templates with validated path interpolation only.
- New frontend helpers in `src/lib/unattend/` — `profileMapping.ts` translates a Reclaim profile's tweak IDs and bloatware patterns into `<FirstLogonCommands>` payloads; `xmlHighlight.ts` is a 60-line regex tokenizer that emits class-only HTML for the preview dialog.
- New `LogAction` variant: `iso.unattend.save`.
- 96 Tauri commands across 21 Rust modules (was 91 / 20).
- Release workflow (`release.yml`) now auto-injects the install one-liner + an asset-legend table at the top of every release's notes via `body:` (prepended to `generate_release_notes`).

## v0.12.1

### Fixed

- **Auto-updater actually installs now.** Previously, clicking "Check for updates" in Settings would detect an available update but only open the GitHub releases page — `update.downloadAndInstall()` was never called. Now the flow is: detect → confirm via native dialog → download + verify signature → run NSIS installer → relaunch. The plumbing was already in place (signed `latest.json`, `.exe.sig` sidecars, embedded Ed25519 pubkey) — only the frontend wiring was missing.
- New `log.app.update` action variant records the install in the activity log.

### Note for users on v0.11.0 / v0.12.0

This fix lives in the v0.12.1 frontend. Older clients still ship the broken behavior and will continue to open the releases page instead of self-installing. To get the working in-app updater, install v0.12.1 once manually (NSIS or MSI from the GitHub release). After that, future updates (v0.12.1 → v0.13.0 onward) install in-app.

## v0.12.0

### Added

- **Security hardening** (`/security`) — New `security` tweak category and dedicated route under the **Customize** sidebar group, between Defender and Browser. Three high-impact toggles aimed at hardening rather than debloat:
  - **LSA Protection** (`RunAsPPL = 1` in `HKLM\System\CurrentControlSet\Control\Lsa`) — runs lsass as a Protected Process Light so credential-dumping tooling (Mimikatz et al.) can't read it.
  - **Controlled Folder Access** — Defender's ransomware shield over Documents / Pictures / Videos / Desktop. Apps need an explicit allow before they can write into protected folders.
  - **Defender Attack Surface Reduction rules** — Enables a curated bundle of ASR rule IDs that block Office macros from spawning child processes, executable content from email, WMI / WSH persistence, and LSASS credential reads. Wired through `Add-MpPreference -AttackSurfaceReductionRules_Ids/-Actions`.
- **+12 privacy tweaks** — Closes the remaining gap with the Win11Debloat policy catalog. Highlights: limit diagnostic log collection, limit crash dump collection, plus tighter app-permission / inking / typing / activity-feed gates.
- **Real portable build** — A dedicated single-exe variant. Download `Reclaim-Portable-vX.Y.Z.exe` from the GitHub release, double-click, run. Writes **nothing** to disk next to itself — no `data/` directory, no `prefs.json`, no `activity.log` file. State (theme, custom profiles, activity log) lives in localStorage inside the standard Webview2 user-data folder.

### Changed

- **Portable detection is now compile-time.** The v0.7.0 `portable.txt` / `data/` marker convention is gone. `is_portable()` returns the value of `cfg!(feature = "portable")`, baked into the binary at build. Installer build = always installed mode; portable build = always portable mode. No runtime ambiguity, no marker files.
- **`app_data_dir()` returns `""` in portable builds.** Every disk-write Tauri command (`log_append`, `write_app_file`, `read_app_file`, `read_activity_log`) no-ops in portable mode and the Settings page hides the "Data folder" row.
- **Auto-updater is gated off in portable mode.** Settings → Check for updates opens the GitHub releases page instead of invoking the updater plugin — portable users grab a fresh `Reclaim-Portable-vX.Y.Z.exe` manually.

### Internal

- New `[features] portable = []` in `src-tauri/Cargo.toml`.
- `src-tauri/src/app_info.rs` — `const PORTABLE: bool = cfg!(feature = "portable")`, `is_portable_sync()` is now a one-liner, `resolve_data_dir()` only handles the installed branch, `exe_dir()` helper removed.
- New npm script `tauri:build:portable` → `tauri build --no-bundle --features portable`.
- `.github/workflows/release.yml` — extra "Build portable binary" + "Stage portable binary" steps after the installer build; uploads `Reclaim-Portable-vX.Y.Z.exe` to the GitHub release. The updater-manifest step now strictly filters on the `*setup.exe` NSIS naming pattern so the portable exe can't accidentally hijack `latest.json`.
- Sidebar grew from 31 to 32 entries; new `/security` route. Tweak count 136 → 151, categories 9 → 10.
- New `LogAction` variant: `security.toggle` (via the existing tweak-apply path — no new command).

### Distribution notes

- Edge SmartScreen will continue to warn on the unsigned portable `.exe` (and on the unsigned NSIS installer). There is no fix without code-signing. The portable build doesn't make this better or worse — it's just a different shape of unsigned executable. See v0.11.0 distribution notes for the reasoning behind shipping unsigned via GitHub Releases only.

## v0.11.0

### Added

- **Windows activation** (`/activation`) — New "Licensing" sidebar group with a single route that displays the current Windows license state (edition, license-status code, channel, partial product key, grace period) read live from WMI `SoftwareLicensingProduct`, and offers a one-click launcher for the open-source MAS (Microsoft Activation Scripts) project. Launch button opens a new **elevated PowerShell window** via `Start-Process -Verb RunAs` that runs `irm https://get.activated.win | iex`. Reclaim never bundles, modifies, or contains the activation script itself — the URL is hardcoded in a Rust constant, the command runs in a separate console window outside of Reclaim, and a prominent disclaimer banner makes the boundary explicit. The page also includes a "Methods at a glance" reference card (HWID / KMS38 / Ohook / TSforge / Online KMS) and a "Documentation" link to [massgrave.dev](https://massgrave.dev/). New Rust module `activation.rs` with two commands: `get_activation_status` (no admin required, parses `Get-CimInstance SoftwareLicensingProduct` JSON output) and `launch_activation_script` (spawns the elevated PowerShell with a static command — no string interpolation from frontend).

### Internal

- New route: `/activation`. Sidebar grew from 30 to 31 entries; a new top-level group "Licensing" sits between "System info" and "App".
- New `LogAction` variant: `activation.launch`.
- New Rust module `activation.rs`. Modules: 19 → 20. Commands: 89 → 91.
- New `ActivationStatus` resource in the route cache (TTL 60s).

### Distribution implications

- The literal string `https://get.activated.win` in the compiled binary will trigger AV / SmartScreen heuristics for activation-tool detection — independent of bundling. Expect Microsoft Defender flagging.
- This likely closes the **winget-pkgs submission** path (reviewer policy rejects activation tools and launchers).
- This likely closes the **SignPath Foundation** path (Foundation excludes activation-related tooling).
- Azure Trusted Signing was already off the table for unrelated reasons. v0.11.0 ships **unsigned via GitHub Releases only**.

## v0.10.0

### Added

- **Browser** (`/browser`) — Dedicated route for Microsoft Edge customization. New `browser` category in the tweak catalog with 13 curated tweaks via `HKLM\Software\Policies\Microsoft\Edge`: skip first-run experience, disable Bing in address bar, kill background mode + startup boost, hide shopping assistant, wallet + crypto wallet, Discover button, Microsoft Rewards, the install-as-app wizard, the "make Edge default" nag, clean up the New Tab page (no MSN feed / quick links / sponsored content / background picker), make sign-in optional, send Do Not Track, disable personalization reporting + Collections + diagnostic data.
- **Driver rollback** (in `/drivers`) — New "Installed driver packages" section below the per-GPU cards. Calls `pnputil /enum-drivers` filtered by Display / Net / Audio / All, parses the localized text output into typed `DriverPackage` rows (published name, provider, version, date, signer). Rollback action confirms then runs `pnputil /delete-driver oem<N>.inf /uninstall /force`. Strict `oem<digits>.inf` validation on the published name. New Rust module `driver_packages.rs`.
- **AMD / Intel auto-find drivers** — The AMD / Intel "Search drivers" buttons in `/drivers` now route through the existing `open_driver_search` Tauri command (a WebviewWindowBuilder with vendor-specific auto-fill JS that was previously NVIDIA-only), giving AMD/Intel the same "smart vendor page" UX as NVIDIA. Renamed the button to "Auto-find {Vendor} drivers" with a wand icon to signal the smarter flow.

### Internal

- New route: `/browser`. Sidebar grew from 29 to 30 entries.
- New `LogAction` variant: `driver.rollback`.
- New tweak category: `browser` (13 tweaks).
- Rust modules now 19, commands 89.

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
