# Reclaim — Roadmap

Reclaim's path to v1.0.0 was organized as 6 self-contained phases. **Phases 1-5, 7, 8 and 9 are shipped.** Phase 6 (polish for the 1.0 release) is partially shipped — what's left is listed at the end.

For a per-version diff of what shipped, see [`../CHANGELOG.md`](../CHANGELOG.md).

---

## ✅ Phase 1 — Network & Hosts (v0.2.0)

Hosts file editor with curated telemetry blocklists; DNS-over-HTTPS toggle with provider presets; per-adapter DNS override.

Shipped:
- `/hosts` route with builtin blocklists (MS Telemetry, Office/Edge, MS Ads) + remote StevenBlack lists, sentinel-based merge that preserves user lines, auto `hosts.reclaim.bak`, raw editor with restore.
- `/network` route with DoH presets (Cloudflare / Cloudflare-Families / Quad9 / AdGuard / Google / Mullvad), per-adapter DNS overrides, reset-to-DHCP, flush-cache.
- `src-tauri/src/network.rs` — hosts read/write/backup/restore, blocklist apply/remove, sentinel scan, `fetch_blocklist` via `reqwest`, DNS get/set/reset, DoH template registration.

## ✅ Phase 2 — App Manager via winget (v0.3.0)

Browse curated apps, install with `winget --silent`, list installed with upgrade indicators, bulk install.

Shipped:
- `/apps` route with 46 curated apps across 8 groups, per-app install / upgrade / uninstall, BulkActionBar for multi-install, Select-Recommended (16 picks), upgrade-available badge with version diff. Live xterm terminal for streaming install output.
- `src-tauri/src/winget.rs` with `winget_available`, list/install/uninstall/upgrade and a streaming `winget_run_stream` variant.
- Missing-winget banner with deep-link to App Installer in MS Store.

## ✅ Phase 3 — Tweak Breadth (v0.4.0)

+71 tweaks, new Notifications category. Total grew from ~50 to **123**.

Shipped:
- New `notifications` category + `/notifications` route (8 entries).
- +15 Privacy, +5 AI, +5 Search, +10 Explorer, +8 Taskbar, +5 Updates, +10 Performance.
- `PROFILES.privacy-max` extended to ~41 ids; Gaming and Performance profiles reference the new perf tweaks.

## ✅ Phase 4 — System Maintenance (v0.5.0)

DISM / SFC / chkdsk / Defender / CleanMgr / Network reset, Power Plans manager, live PTY terminal.

Shipped:
- `/maintenance` route with four sections (Repair / Cleanup & disk / Defender / Reset) plus a Power Plans manager. Live xterm + ConPTY terminal with autoscroll.
- Operations include SFC, DISM (CheckHealth / ScanHealth / RestoreHealth), chkdsk, WinSxS cleanup + ResetBase, temp cleanup, icon/font cache reset, Store reset, Defender (signatures + quick/full/offline scan), Windows Update components reset, spooler reset, network stack reset, firewall reset.
- Power plans: list + activate, "Unlock Ultimate Performance" duplicates the hidden GUID, delete custom plans.
- `src-tauri/src/maintenance.rs` uses `portable-pty` (ConPTY on Windows) — each task runs in its own PTY session with resize and kill support.

## ✅ Phase 5 — Profile Builder + Import/Export (v0.6.0)

Custom profile builder, JSON envelope with schema versioning, shareable `.reclaim` files.

Shipped:
- `/profiles` route — full profile management with built-in (read-only, exportable) and custom (edit / export / delete / apply) sections. Import + New buttons.
- `/profile-builder` route — form-driven creator/editor (name / tagline / description / gradient + tweak/bloatware accordions).
- `ProfileV1` envelope (`schemaVersion: 1`, name / tagline / description / gradient / tweakIds / bloatwarePatterns / custom / createdAt). Validation drops unknown tweak ids with a warning, regenerates id on import.
- `customProfiles` reactive store backed by localStorage key `reclaim.custom-profiles`.
- 8 `GRADIENT_PRESETS` (Violet / Indigo / Emerald / Sunset / Sky / Rose / Lime / Slate).
- `src-tauri/src/files.rs` — tiny `read_text_file` / `write_text_file` for dialog-picked paths.

## 🟡 Phase 6 — Polish (toward v1.0.0)

Goal of this phase: everything needed before a 1.0 release.

### Shipped (v0.7.0)

- **Portable mode** — initial drop-a-marker approach. Superseded in v0.12.0 by a dedicated portable build (single-exe, stateless on disk).
- **Crash-safe log mirror** — `log_append(entry)` writes one JSON line per log entry to `<app_data_dir>/activity.log` alongside the localStorage write.
- **Auto-updater wired** — `tauri-plugin-updater` plugin loaded; Settings has a "Check for updates" button. Without the signing secrets, falls back to opening the GitHub releases page.
- **`.reclaim` profile file extension** — exports use `.reclaim`; imports accept `.reclaim` or `.json`.

### Shipped (v0.8.0)

- **OneDrive removal** (`/onedrive`) — full backup-then-uninstall flow.
- **Right-click menu editor** (`/context-menu`) — toggle shell-extension CLSIDs.
- **Real shell icons** for Startup, Bloatware, OneDrive — extracted from EXEs and AppX manifests with full path resolution (quoted, env-var, .lnk, Squirrel).
- **NVIDIA driver auto-update** — series/family API lookup, streaming download, detached installer launch.
- **CI/release pipeline** — `check.yml` runs svelte-check + cargo check on every push/PR; `release.yml` triggers on `v*` tags, builds NSIS + MSI, signs with the updater key, generates `latest.json`, drafts a GitHub Release.

### Still open for v1.0.0

- Polish pass + bugfix sweep across the 33 routes once feature work freezes.
- Catalog / feature depth as captured in [`PLAN.md`](PLAN.md) (apps catalog expansion, tweak catalog → 200, mass driver updates, developer-features tab, granular gaming tweaks).
- ~~**i18n (DE + EN)**~~ — Dropped from v1.0.0 scope. English-only UI is the shipping stance. May happen post-v1.0 as a nice-to-have, but it does not block 1.0.
- ~~**Code-signing the installer**~~ — Dropped from v1.0.0 scope. The v0.11.0 activation launcher embeds the `get.activated.win` URL in the binary, which likely closes both the winget-pkgs reviewer path and the SignPath Foundation eligibility path. Distribution will be GitHub Releases only, unsigned, with the SmartScreen first-run warning that comes with that.

---

## ✅ Phase 7 — System depth (v0.9.0)

Five of the original "Cross-cutting future ideas" landed as a v0.9.0 batch.

Shipped:
- **Defender** (`/defender`) — Combined toggles (real-time protection, cloud-delivered protection, sample submission, PUA, network protection, controlled folder access, SmartScreen Explorer/Edge/Store) + Files & folders / Processes / Extensions exclusions editor. New `defender.rs` module wraps `Get-MpPreference` / `Set-MpPreference` / `Add-MpPreference` / `Remove-MpPreference`. Read-only Tamper Protection indicator.
- **Scheduled tasks** (`/scheduled-tasks`) — Path-grouped browser; per-task Enable/Disable/Run/Delete; "Notable" badge on the 13 known MS telemetry tasks; Show/Hide Microsoft tasks toggle. New `schtasks.rs` module.
- **Recall data wipe** (in `/ai`) — Status card detects the `CoreAIPlatform.00` snapshot store, shows disk use + snapshot count, offers a destructive wipe (with optional policy lock + AppX removal). New `recall.rs` module using `takeown` + `icacls` + recursive remove.
- **Mass file unblock** (in `/maintenance`) — Pick a folder/file, optionally recurse, strip `Zone.Identifier` via `Unblock-File`. Output streams into the embedded ConPTY terminal. New `unblock_files_stream` command built on a shared `maintenance::run_pty_script` helper.
- **Telemetry firewall** (`/firewall`) — Sentinel-grouped (`Reclaim:`) outbound Windows Firewall rules for 4 curated lists (MS telemetry programs, MS telemetry IPs, MS ads/suggestions IPs, Office telemetry IPs). Apply/Re-apply/Remove idempotent — re-apply refreshes the rule set. New `firewall.rs` module.

---

## ✅ Phase 8 — Customize & drivers (v0.10.0)

A subset of the remaining "Cross-cutting future ideas" landed as a v0.10.0 batch.

Shipped:
- **Browser** (`/browser`) — New `browser` tweak category + dedicated route with 13 curated Edge policies (skip first-run, kill Bing in address bar + background mode + shopping + wallet + Discover + Rewards + the install-as-app wizard, clean up the New Tab page, make sign-in optional, send DNT, disable personalization reporting + Collections + diagnostic data).
- **Driver rollback** (in `/drivers`) — `pnputil /enum-drivers` rollback for any installed OEM driver package (Display / Net / Audio / All). New `driver_packages.rs` module with strict `oem<digits>.inf` validation.
- **AMD / Intel auto-find** — The existing per-vendor `open_driver_search` flow (NVIDIA had it since v0.8.0) is now wired up for AMD and Intel too, replacing the basic browser-search fallback.

---

## ✅ Phase 9 — Licensing launcher (v0.11.0)

User-requested addition outside the original roadmap.

Shipped:
- **Activation** (`/activation`) — New top-level "Licensing" sidebar group with a single route. Reads live license state via WMI `SoftwareLicensingProduct` (edition, license-status code + text, channel, partial product key, grace period). Offers a one-click launcher that opens a new **elevated PowerShell window** running the external [MAS](https://massgrave.dev/) one-liner `irm https://get.activated.win | iex`.
- **Boundary by design**: Reclaim does not bundle, modify, or contain the activation script itself. The launch command is a Rust `const` — never built from frontend input. The launched window runs outside of Reclaim's PTY infrastructure (MAS has an interactive TUI menu). Disclaimer banner on top of the route makes the boundary explicit.
- **Methods reference card** — HWID (Win 10/11, permanent) · KMS38 (until 2038) · Ohook (Office, permanent) · TSforge (build 19041+) · Online KMS (180-day renewable).
- New Rust module `activation.rs` with two commands (`get_activation_status`, `launch_activation_script`).
- **Distribution trade-off accepted**: the literal `get.activated.win` string in the binary will trigger Defender / SmartScreen heuristics and likely closes both winget-pkgs and SignPath Foundation submission paths. v1.0.0 now targets GitHub Releases only, unsigned. See [`../CHANGELOG.md`](../CHANGELOG.md) v0.11.0 for the full implications.

---

## ✅ Phase 10 — Security hardening + real portable build (v0.12.0)

Shipped:
- **Security hardening** (`/security`) — New `security` tweak category and dedicated route under the Customize group. Three high-impact toggles: LSA Protection (RunAsPPL — blocks credential-dump tooling from reading lsass), Controlled Folder Access (Defender ransomware shield over Documents / Pictures / etc.), Defender Attack Surface Reduction rules (Office macro / child-process / WMI-persistence / LSASS-credential blocks via `Add-MpPreference -AttackSurfaceReductionRules_Ids/-Actions`).
- **+12 privacy tweaks** — Limit diagnostic log collection, limit crash dump collection, plus 10 more closing the gap with the Win11Debloat catalog.
- **Real portable build** — Dedicated single-exe variant via the `portable` Cargo feature. `is_portable()` is now a compile-time `cfg!(feature = "portable")` constant — no `portable.txt` marker, no `data/` directory sibling check. In a portable build every `app_data_dir`-backed disk write (prefs.json, activity.log mirror) no-ops; state lives only in localStorage inside the Webview2 user-data folder. Release pipeline produces `Reclaim-Portable-vX.Y.Z.exe` alongside the NSIS / MSI installers. Auto-updater is gated off in portable mode (Settings opens the releases page instead).

---

## ✅ Phase 15 — Catalog depth + mass driver updates (v0.17.0)

Pulled forward from [`PLAN.md`](PLAN.md) items #1 (apps catalog expansion — winget half), #2 (tweaks → 200) and #3 (mass driver updates). Choco support deferred to v0.18.0.

Shipped:
- **+20 tweaks** to reach exactly 200 entries. Breakdown: Privacy +4 (Nearby Sharing, Office cloud content, Spotlight lock-screen, Store auto-updates), Explorer +4 (balloon tips, file checkboxes, Search background tracking, Win11 restart-apps-on-signin), Performance +5 (MapsBroker, RetailDemo, Xbox Live services, WMPNetworkSvc, dmwappushservice), Notifications +2 (startup-impact toast, low-disk warning), Security +4 (SMB1, Remote Assistance, Remote Desktop, NetBIOS over TCP/IP), Memory +1 (DisablePagingExecutive).
- **+39 winget apps** (67 → 106). Every icon slug verified against the upstream master lists of homarr-labs/dashboard-icons, simple-icons, selfh.st/icons; direct `https://…` URLs HTTP-probed for non-empty 200s. 3 candidates dropped because no proper icon exists in any public source (lazygit, ExplorerPatcher, TreeSize Free). Icon-quality bar codified in [`PLAN.md`](PLAN.md).
- **Mass driver updates panel (`/drivers`)** — scans Microsoft's Windows Update Driver Catalog via the existing `search_windows_updates(driverOnly: true)`, classifies by device class (Audio / Chipset / Display / Network / Storage / Input / Camera / Print / Other), bulk-installs via `install_windows_updates(ids)`. Admin-gated. No new Rust module — reuses existing WU + admin infra.
- **Built-in profile updates.** Privacy Maximum +4 (`nearby-share-off`, `office-content-download-off`, `spotlight-lockscreen-off`, `restart-apps-on-signin-off`). Performance +4 (`maps-broker-off`, `retail-demo-off`, `wmp-network-sharing-off`, `dmwap-push-off`). Reclaim Basics auto-picks new recommended tweaks.

---

## ✅ Phase 14 — Developer tab + Memory + Gaming categories (v0.16.0)

Pulled forward from [`PLAN.md`](PLAN.md) items #4 (granular gaming tweaks) and #5 (developer features tab).

Shipped:
- **`memory` tweak category + `/memory` route** — 5 entries: Disable RAM compression, Disable SysMain / Superfetch (recommended on SSDs), Disable Prefetch + Superfetch hints, Enable RAM page combining (restore button), Clear pagefile on shutdown.
- **`gaming` tweak category + `/gaming` route** — 8 entries: Game Mode, MMCSS SystemResponsiveness, MMCSS Games priority block, Win32PrioritySeparation, ForegroundLockTimeout, NetworkThrottlingIndex, TCP ACK + NoDelay on all interfaces, HPET off (with `requiresRestart: "system"`).
- **`/developer` route + Developer sidebar group** — live state of WSL, VirtualMachinePlatform, HypervisorPlatform, Hyper-V and Sandbox via `Get-WindowsOptionalFeature`; enable/disable streamed through `maintenance::run_pty_script` (same PTY infra as Maintenance); read-only WSL distros list parsed from `wsl --list --verbose`; Dev Drive support card gated on build ≥ 22621. New Rust module `dev_features.rs` + 4 commands (`list_optional_features`, `set_optional_feature_stream`, `list_wsl_distros`, `dev_drive_info`).
- **Built-in profile updates.** Gaming profile +6 (game-mode-on, system-responsiveness-gaming, mmcss-gaming-priority, cpu-priority-foreground-boost, foreground-lock-timeout-off, sysmain-off). Performance profile +2 (sysmain-off, prefetch-off).
- **Dashboard surface** — 3 new category cards (Memory / Gaming / Developer).

---

## ✅ Phase 12 — CLI mode + installer polish (v0.14.0)

Pulled forward from [`PLAN.md`](PLAN.md) item #2 — closes Win11Debloat's last remaining differentiator (scriptable / unattended deployment).

Shipped:
- **CLI mode** — Same `reclaim.exe` accepts `--apply-profile`, `--apply-tweak`, `--revert-tweak`, `--check-tweak`, `--remove-bloat`, `--import-profile <.reclaim>`, `--export-state`, `--list-profiles`, `--list-tweaks`, `--list-bloatware`. `--silent` / `--json` global modifiers. New `src-tauri/src/cli.rs` dispatcher; `AttachConsole(ATTACH_PARENT_PROCESS)` so the GUI-subsystem binary writes back to the spawning terminal. Activity log mirroring identical to GUI.
- **Catalog export pipeline** — `pnpm catalog:export` (auto-run before `pnpm tauri:build`) bundles `src/lib/tweaks/{catalog,bloatware,profiles}.ts` + `src/lib/apps/catalog.ts` via esbuild and dumps to `src-tauri/data/*.json`; CLI `include_str!`s those so GUI and CLI share one source of truth.
- **`install.ps1` polish** — Same-version detection (clean exit when latest is already installed; opt-out via `$env:RECLAIM_FORCE`), terminal progress bar for the download, silent install mode via `$env:RECLAIM_SILENT='1'` (NSIS `/S`, MSI `/qn /norestart`) with spinner while the installer runs, `$env:RECLAIM_NO_LAUNCH='1'` to suppress the portable post-download launch prompt.

---

## Cross-cutting future ideas (post-1.0, not committed)

- **Default-app override** — Edge → user-choice for PDF/PNG/HTML in one click. Tried during v0.10.0 but pulled; the SetUserFTA-style hash approach is fragile and the ms-settings deep-link variant didn't add enough value over just opening Settings.
- **Wallpaper / Lock screen customizer** — Tried during v0.10.0 but pulled; not enough value over just Settings → Personalization.
- **Sound scheme picker** — Switch the Windows sound scheme (Default / No sounds / custom).

For larger post-v1.0 work captured out of the May 2026 market analysis (persistence service, CLI mode, apps catalog expansion, deeper tweak categories, etc.) see [`PLAN.md`](PLAN.md).

---

## Conventions for every phase

1. **Always run `pnpm exec svelte-check` + `cargo check` before declaring done.** Zero errors.
2. **Every Rust command → bridge.ts wrapper → typed.** No raw `invoke()` in routes.
3. **Every destructive operation logs to the activity log.** Use `log.success/error/warn` from `$lib/log.svelte`.
4. **Every admin operation → check `admin.elevated`, show banner if not.**
5. **Every external URL → through `tauri-plugin-opener.openUrl`.**
6. **Update `CLAUDE.md` "Current state" after each phase.**
7. **Bump version in `package.json`, `tauri.conf.json`, `src-tauri/Cargo.toml` (all three).**
8. **No German UI strings** — the app is English-only by design.
