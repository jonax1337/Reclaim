# Reclaim Your Windows

A modern Windows 11 debloater and tweak suite — **live state detection**, **reversible by design**, **Mica UI**. No GeForce Experience, no Adrenalin, no DSA, no telemetry. Just the OS you paid for.

> Inspired by [Win11Debloat](https://github.com/Raphire/Win11Debloat) and [ChrisTitusTech/winutil](https://github.com/ChrisTitusTech/winutil), but built from scratch with a focus on transparency, reversibility, and modern UX.

## What it does

**136 reversible tweaks** across 9 categories with **live status** showing what's already on, and per-tweak revert that restores the Windows default:

| Category | Count | Highlights |
| --- | ---: | --- |
| Privacy | 31 | telemetry, advertising ID, activity history, location, inking/typing, app access (camera/contacts/calendar), SmartScreen, clipboard cloud sync |
| AI & Copilot | 10 | Copilot, Recall, Click to Do, Edge AI, Notepad AI, Paint Cocreator, Photos generative erase |
| Search | 9 | Bing in Start, Cortana, web suggestions, search highlights, SafeSearch, device search history |
| Explorer | 16 | classic Win10 context menu, file extensions, hidden files, long paths, full path in title, compact mode, drive letters first |
| Taskbar & Start | 20 | widgets, Chat, Task View, alignment, sponsored recs, lock screen ads, clock seconds, end-task right-click, small mode, hide tray People |
| Notifications | 8 | toasts off, sounds off, lock-screen toasts, tips/tricks, welcome experience, finish-setup, Defender summary |
| Performance | 20 | background apps, Game DVR, mouse accel, DiagTrack, Reserved Storage, NTFS last-access, scheduled defrag, IPv6 Teredo, NDU, High Performance plan, visual effects |
| Updates | 8 | defer features, no auto-restart, P2P Delivery Optimization, exclude drivers, extended active hours, block Insider |

**Bloatware remover** — 63 curated AppX patterns across 7 groups (consumer, office, gaming, communication, media, system, other). Lists only what's actually on your system. Bulk-uninstall via Remove-AppxPackage (including provisioned packages).

**OneDrive removal** — Two-step flow: pick redirected folders (Documents/Desktop/Pictures/sync root) to back up via `robocopy`, then run the official `OneDriveSetup.exe /uninstall`, remove leftover folders, unpin the sidebar CLSID, and optionally write the `DisableFileSyncNGSC` group policy to prevent re-install.

**Right-click menu editor** — Toggle shell-extension `ContextMenuHandlers` on/off. Aggregates Files / Folders / Folder-background / Drives / AllFileObjects, dedupes by CLSID, resolves friendly names from `HKCR\CLSID\<id>`. System entries dimmed by default with a "Show System" toggle.

**App installer (winget)** — 46 curated apps across 8 groups (Browsers, Communication, Dev, System tools, Media, Office, Gaming, Utilities). Per-app install / upgrade / uninstall, BulkActionBar for multi-install, Select-Recommended (16 picks), live upgrade-available badge with version diff. Streams stdout to an embedded xterm terminal.

**Hosts & blocklists** — Curated builtin lists (Microsoft Telemetry, Office/Edge, MS Ads) plus on-demand StevenBlack remote lists. Sentinel-based merge (`# >>> Reclaim: Name` … `# <<< Reclaim: Name`) leaves your existing hosts entries untouched. Raw editor with auto `hosts.reclaim.bak` and one-click restore.

**DNS & DoH** — Provider presets (Cloudflare, Cloudflare-Families, Quad9, AdGuard, Google, Mullvad). One-click apply-to-all-connected, per-adapter custom servers, reset-to-DHCP, flush-cache, DoH template registration.

**Windows Update center** — Scan + filter (Security / Quality / Drivers / Optional) + install via the native `Microsoft.Update.Session` COM API. No PSWindowsUpdate dependency.

**Driver updates without the bloat** — Detects GPU (NVIDIA / AMD / Intel). For NVIDIA: queries the public series/family API to find the latest driver, streams the download with live progress, launches the installer detached. Or use **Auto-Search** to open the vendor's manual search page with your specs pre-filled and the search auto-clicked.

**System maintenance** — Three sections plus a Power Plans manager, all wired to a **real PTY terminal** (xterm + ConPTY) with live stdout/stderr:

- Repair: SFC `/scannow`, DISM CheckHealth/ScanHealth/RestoreHealth, chkdsk scan/spotfix, WinSxS cleanup + ResetBase
- Cleanup: temp cleanup, icon cache reset, font cache reset, Store reset, CleanMgr launcher
- Defender: signature update, quick/full/offline scan
- Reset: Windows Update components, print spooler, network stack (winsock + ip + flushdns + release/renew), firewall, Memory Diagnostic launcher
- Power Plans: list + activate, "Unlock Ultimate Performance" duplicates the hidden GUID, delete custom plans

**Profiles** — Four built-in presets:

- **Gaming** (12 tweaks) — kills Game DVR / background apps / mouse accel for max FPS
- **Privacy Maximum** (41 tweaks) — full telemetry & tracking lockdown
- **Performance** (17 tweaks) — free RAM and disk
- **Reclaim Basics** — every recommended tweak

…plus a full **profile builder** for custom profiles. Pick any subset of tweaks + bloatware patterns, save, export to a `.reclaim` file (JSON envelope with schema versioning), share, import. Validation drops unknown tweak ids with a warning.

**System info** — CPU / GPU (driver version + date) / RAM (per-slot speed + manufacturer) / Storage (per-drive usage + physical drives) / Motherboard / BIOS.

**Startup apps** — Enumerates HKCU\Run, HKLM\Run (incl. 32-bit), both Startup folders, and `StartupFolderPackagedAppX` (UWP autostart). Toggle via the same `StartupApproved` binary blob Task Manager uses. Per-row 3-dot menu: open file location, properties (real Shell.Application "Properties" verb), copy path/AUMID, search online.

**Services** — Curated "notable services" list (DiagTrack, WSearch, SysMain, Xbox, …) with plain-English explanations, or the full list of every Win32 service. Disable + stop in one click with a confirmation dialog.

**Activity log** — Every tweak applied/reverted, every app removed/installed, every restore point — persistent in localStorage **and** mirrored crash-safe to `activity.log` as JSON-lines in the app data dir. Filterable by severity, expand for stderr.

**Windows activation launcher** — Live license-state card (edition, status code, channel, partial product key) read from WMI `SoftwareLicensingProduct`, plus a one-click launcher that opens a new **elevated PowerShell window** running the external [MAS](https://massgrave.dev/) one-liner (`irm https://get.activated.win | iex`). Reclaim does not bundle, modify, or contain the activation script itself — only the launch command is fired off. Includes a methods reference card (HWID / KMS38 / Ohook / TSforge / Online KMS) and an explicit disclaimer. Use only on systems you own a license for; Microsoft Defender may flag the script — that is expected.

## Other things that make Reclaim different

- **Real shell icons** for Startup, Bloatware, and OneDrive — extracted from EXEs via `Icon.ExtractAssociatedIcon` (handles quoted paths, env-var expansion, `.lnk` target resolution, Squirrel updater path-hop, progressive whitespace trim for unquoted paths with embedded spaces). UWP entries get their real `Square44x44Logo` from the package manifest — same files Start Menu uses.
- **Self-elevation on launch**: clicks UAC for you on cold start. If you decline, the app runs in **restricted mode** — admin-requiring tweaks are hidden, admin-only pages are locked, and click-to-elevate buttons in the titlebar, Dashboard, every tweak section, and every locked page get you to UAC anytime. Denial is sticky for the session (no re-prompt loop).
- **Reversibility is architecture**: every tweak knows its Windows default. Toggle the switch and it's gone.
- **Portable mode**: drop a `portable.txt` or a `data/` folder next to the exe and Reclaim writes logs and profiles there instead of `%APPDATA%`.
- **Restore point on demand** from the Dashboard or Settings.
- **Auto-updater** wired up via Tauri's updater plugin against GitHub Releases (signed `latest.json`).
- **Win11 Mica** translucent window with custom violet/fuchsia accent.
- **No telemetry**. Activity log is local-only. We're a privacy tool — irony would be fatal.

## Setup (development)

```powershell
git clone https://github.com/jonax1337/reclaim.git
cd reclaim
pnpm install
pnpm tauri:dev
```

Requirements:
- Node 20+
- Rust toolchain (`rustup`)
- Webview2 runtime (ships with Windows 11)
- Windows 11 22H2+ for Mica (graceful fallback otherwise)

## Production build

```powershell
pnpm tauri:build
```

Produces NSIS + MSI installers in `src-tauri/target/release/bundle/`.

## Architecture

```
src/                   Svelte 5 (runes) + Tailwind v4 + Bits UI
  lib/
    tweaks/
      catalog.ts       123 typed tweak records (apply/revert/check ops)
      bloatware.ts     63 AppX wildcard patterns
      profiles.ts      Built-in preset bundles
      bridge.ts        TS wrappers for every Tauri command
      executor.ts      applyTweak / revertTweak / getTweakState
      customProfiles.svelte.ts   localStorage-backed custom profile store
      profileEdit.svelte.ts      handoff state for ProfileBuilder
    apps/catalog.ts    46 curated winget entries (8 groups)
    hosts/             Builtin blocklists + remote sources
    network/           DoH provider presets, DNS helpers
    maintenance/       Operation catalog (op id → label/description)
    profiles/          Gradient presets, profile import/export helpers
    ui/                shadcn-style components (Button/Card/Switch/…)
                       BulkActionBar, Titlebar, Toaster
    components/        Layout, TweakSection, TweakRow, ProfileCard,
                       AdminBanner, TerminalPanel (xterm)
    log.svelte.ts      Activity log (500 entries, localStorage + file mirror)
    admin.svelte.ts    Elevation + auto-UAC store
    theme.svelte.ts    system / light / dark
    prefs.svelte.ts    App prefs (theme, persisted to file + localStorage)
    tasks.svelte.ts    Long-running task registry (PTY-backed)
    cache.svelte.ts    SWR-style resource cache
    route-cache.svelte.ts        per-route component memoization
    scroll-restore.svelte.ts     per-route scroll position
    startup-preload.svelte.ts    boot-time resource preloads
  routes/              31 routes (see below)

src-tauri/src/
  lib.rs               Plugin init + 91-command invoke_handler registry
  app_info.rs          Portable mode, app data dir, activity.log mirror
  sysinfo.rs           Windows version + elevation + relaunch_elevated + accent color
  sysquery.rs          Hardware (WMI) / Startup (Run + AppX AUMID) / Services
  tweaks.rs            PowerShell runner + AppX + registry + restore point
  winupdate.rs         Microsoft.Update.Session search + install
  driver_search.rs     Vendor webview with auto-fill JS injection
  driver_update.rs     NVIDIA API lookup + streaming download + detached launcher
  winget.rs            winget CLI integration (with streaming variants)
  network.rs           hosts file + blocklists + DNS / DoH
  maintenance.rs       ConPTY-based PTY runner + Power Plans
  onedrive.rs          Detection + robocopy backup + uninstall
  context_menu.rs      Shell-extension CLSID enumeration & Blocked toggle
  icons.rs             EXE icon + AppX icon extraction, command resolver
  files.rs             Text file I/O for user-picked paths
  defender.rs          Defender toggles + exclusions via Get/Set/Add/Remove-MpPreference
  schtasks.rs          Scheduled-task browser (path-grouped, Enable/Run/Delete)
  recall.rs            Copilot+ Recall snapshot store wipe
  firewall.rs          Sentinel-grouped (`Reclaim:`) outbound firewall blocks
  driver_packages.rs   pnputil enum/rollback for OEM driver packages
  activation.rs        Live license state (WMI) + external MAS launcher
```

### Routes (31 total)

Grouped in the sidebar as: Top · Clean up · Install · Customize · Network · Updates & drivers · System info · Licensing · App.

- **Top:** Dashboard, Profiles
- **Clean up:** Bloatware, OneDrive, AI & Copilot
- **Install:** Apps (winget)
- **Customize:** Privacy, Defender*, Browser (Edge)*, Explorer, Right-click menu*, Taskbar & Start, Search, Notifications, Performance
- **Network:** Hosts & blocklists*, DNS & DoH*, Firewall*
- **Updates & drivers:** Windows Update, Drivers, Update settings
- **System info:** Specs, Startup apps, Services*, Scheduled tasks*, Maintenance*
- **Licensing:** Activation
- **App:** Activity log, Settings

\* admin required. Hidden in restricted mode, click-to-elevate everywhere.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Svelte 5 (runes), TypeScript strict, Vite 6, Tailwind v4 |
| UI primitives | Bits UI, Lucide icons, Geist (variable) |
| Terminal | @xterm/xterm + addon-fit + addon-web-links |
| Routing | `svelte-spa-router` (hash) |
| Backend | Rust + Tauri 2 |
| Registry | `winreg` crate |
| Elevation | `windows-rs` (TokenElevation), PowerShell `Start-Process -Verb RunAs` |
| Win Update | `Microsoft.Update.Session` COM (no PS module) |
| AppX | PowerShell `Get-/Remove-AppxPackage` |
| HTTP | `reqwest` 0.12 (rustls) |
| PTY | `portable-pty` (ConPTY on Windows) |
| Auto-updater | `tauri-plugin-updater` (Ed25519-signed `latest.json` from GH Releases) |

## Roadmap

Phases 1-5, 7 (System depth), 8 (Customize & drivers) and 9 (Licensing launcher) are shipped. Phase 6 polish is partially complete — see [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's left before v1.0.0. Note: as of v0.11.0 the activation launcher likely closes the winget / SignPath distribution paths; v1.0.0 will ship unsigned via GitHub Releases.

## Inspirations

- [Win11Debloat](https://github.com/Raphire/Win11Debloat) — feature scope reference
- [ChrisTitusTech/winutil](https://github.com/ChrisTitusTech/winutil) — winget integration idea
- [Sophia-Community/SophiApp](https://github.com/Sophia-Community/SophiApp) — depth of tweak catalog
- [builtbybel/privatezilla](https://github.com/builtbybel/privatezilla) — privacy focus

All registry keys and PowerShell commands used here come from public Microsoft documentation.

## License

[MIT](LICENSE)
