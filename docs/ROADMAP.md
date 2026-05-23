# Reclaim — Roadmap

Reclaim's path to v1.0.0 was organized as 6 self-contained phases. **Phases 1-5 are shipped.** Phase 6 (polish for the 1.0 release) is partially shipped — what's left is listed at the end.

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

- **Portable mode** — drop `portable.txt` or a `data/` folder next to the exe; `app_data_dir()` then resolves there instead of `%APPDATA%/Reclaim`. Settings page shows the mode + a clickable path.
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

- **i18n** — DE + EN locales, custom ~50-line `t()` store, refactor every `.svelte` hardcoded string.
- **Code-signing the installer** — EV certificate or [SignPath](https://signpath.org/) to make the NSIS/MSI installer trusted (no SmartScreen warning for users).

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

## Cross-cutting future ideas (post-1.0, not committed)

These could become Phase 8+ if there's demand:

- **Browser tweaks** — Edge policies for hub sidebar, copilot, news feed (some already covered as tweaks).
- **Driver rollback** — list installed driver versions, roll back via `pnputil`.
- **AMD / Intel driver auto-update** — same flow as the NVIDIA one in v0.8.0.
- **Default-app override** — Edge → user-choice for PDF/PNG/HTML in one click.
- **Wallpaper / Lock screen customizer**.
- **Sound scheme picker**.

---

## Conventions for every phase

1. **Always run `pnpm exec svelte-check` + `cargo check` before declaring done.** Zero errors.
2. **Every Rust command → bridge.ts wrapper → typed.** No raw `invoke()` in routes.
3. **Every destructive operation logs to the activity log.** Use `log.success/error/warn` from `$lib/log.svelte`.
4. **Every admin operation → check `admin.elevated`, show banner if not.**
5. **Every external URL → through `tauri-plugin-opener.openUrl`.**
6. **Update `CLAUDE.md` "Current state" after each phase.**
7. **Bump version in `package.json`, `tauri.conf.json`, `src-tauri/Cargo.toml` (all three).**
8. **No German UI strings** — pending Phase 6 i18n.
