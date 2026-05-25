# Reclaim Your Windows

A modern Windows 11 debloater and tweak suite — **live state detection**, **reversible by design**, **Mica UI**. No GeForce Experience, no Adrenalin, no DSA, no telemetry. Just the OS you paid for.

> Inspired by [Win11Debloat](https://github.com/Raphire/Win11Debloat) and [ChrisTitusTech/winutil](https://github.com/ChrisTitusTech/winutil), but built from scratch with a focus on transparency, reversibility, and modern UX.

## Install

One-liner in PowerShell — picks the installer or portable build for you, downloads from the latest GitHub release, and launches it:

```powershell
irm "https://github.com/jonax1337/reclaim/raw/main/install.ps1" | iex
```

Non-interactive (pick the mode upfront):

```powershell
$env:RECLAIM_MODE = 'portable'; irm "https://github.com/jonax1337/reclaim/raw/main/install.ps1" | iex
# Valid: install | portable | msi
```

Why a PowerShell one-liner instead of "download the .exe"? Reclaim is unsigned and Edge would otherwise show a "publisher unknown" prompt for the installer. Going through PS skips the browser's reputation check entirely — the same trick [ChrisTitus' WinUtil](https://christitus.com/winutil/) uses.

Manual download is also fine — grab the asset you want from [Releases](https://github.com/jonax1337/reclaim/releases/latest).

## Headless / CLI mode

The same `reclaim.exe` works as a sysadmin tool from `cmd` / PowerShell when called with `--` flags. Designed for unattended deployment (MDT / Intune / autounattend `<FirstLogonCommands>` / gold images):

```powershell
reclaim.exe --apply-profile basics --silent
reclaim.exe --apply-tweak telemetry-off,advertising-id-off
reclaim.exe --remove-bloat "*Spotify*,Microsoft.BingNews"
reclaim.exe --import-profile gold-image.reclaim --apply --include-bloatware --silent
reclaim.exe --export-state --json > state.json
reclaim.exe --help                              # full reference
```

Same binary, same catalog, same activity-log mirror. No second .exe to ship.

## What it does

**200 reversible tweaks** across 13 categories with **live status** showing what's already on, and per-tweak revert that restores the Windows default:

| Category | Count | Highlights |
| --- | ---: | --- |
| Privacy | 54 | telemetry, advertising ID, activity history, location, inking/typing, app access (camera/contacts/calendar), SmartScreen, clipboard cloud sync, diagnostic log + crash dump limits |
| AI & Copilot | 10 | Copilot, Recall, Click to Do, Edge AI, Notepad AI, Paint Cocreator, Photos generative erase |
| Search | 9 | Bing in Start, Cortana, web suggestions, search highlights, SafeSearch, device search history |
| Explorer | 19 | classic Win10 context menu, file extensions, hidden files, long paths, full path in title, compact mode, drive letters first |
| Taskbar & Start | 18 | widgets, Chat, Task View, alignment, sponsored recs, lock screen ads, clock seconds, end-task right-click, small mode, hide tray People |
| Notifications | 8 | toasts off, sounds off, lock-screen toasts, tips/tricks, welcome experience, finish-setup, Defender summary |
| Performance | 20 | background apps, Game DVR, mouse accel, DiagTrack, Reserved Storage, NTFS last-access, scheduled defrag, IPv6 Teredo, NDU, High Performance plan, visual effects |
| Updates | 10 | defer features, no auto-restart, P2P Delivery Optimization, exclude drivers, extended active hours, block Insider |
| Browser (Edge) | 13 | skip first-run, no Bing in URL bar, no background mode, no shopping/wallet/Discover, hide rewards, clean New Tab page, sign-in optional |
| Security | 6 | LSA Protection (RunAsPPL), Controlled Folder Access, Defender Attack Surface Reduction rules, extra hardening |

**Bloatware remover** — 155+ curated AppX patterns across 8 groups (consumer, office, gaming, communication, media, system, other, plus OEM bloat for HP / Lenovo / Dell). v0.19.0 added explicit publisher-prefixed patterns for the Sponsored Apps that Microsoft Store auto-pushes after first network connect (WhatsApp / Spotify / Disney+ / Netflix / TikTok / Instagram / Facebook / LinkedIn). Lists only what's actually on your system. Bulk-uninstall via Remove-AppxPackage (including provisioned packages).

**OneDrive removal** — Two-step flow: pick redirected folders (Documents/Desktop/Pictures/sync root) to back up via `robocopy`, then run the official `OneDriveSetup.exe /uninstall`, remove leftover folders, unpin the sidebar CLSID, and optionally write the `DisableFileSyncNGSC` group policy to prevent re-install.

**Right-click menu editor** — Toggle shell-extension `ContextMenuHandlers` on/off. Aggregates Files / Folders / Folder-background / Drives / AllFileObjects, dedupes by CLSID, resolves friendly names from `HKCR\CLSID\<id>`. System entries dimmed by default with a "Show System" toggle.

**App installer (winget)** — 106 curated apps across 8 groups (Browsers, Communication, Dev, System tools, Media, Office, Gaming, Utilities). Per-app install / upgrade / uninstall, BulkActionBar for multi-install, Select-Recommended (16 picks), live upgrade-available badge with version diff. Streams stdout to an embedded xterm terminal.

**Install media (Task Sequence editor)** — Produces a bootable Windows 11 install medium with your chosen debloat + tweaks baked in, in two modes:

- **Simple mode (default).** Pick a profile (built-in or custom from `/profiles`), set username/password/locale, toggle "Fully automated" if you want zero-clicks. Click **Build ISO** (repacks a Windows 11 ISO via Windows ADK `oscdimg.exe`) or **Flash USB** (writes directly to a USB stick — single FAT32 + DISM-split layout for install.wim > 4 GB, no Rufus needed). The generator emits both an `autounattend.xml` and a `setupcomplete.cmd` sidecar dropped into `\$OEM$\$$\Setup\Scripts\` so Windows Setup auto-copies the script into `%WINDIR%` during install.
- **Advanced mode (Task Sequence).** Drag-and-droppable editor with 11 step types — locale & account, hardware-check bypasses, edition picker (KMS keys), OOBE skips, OOBE privacy defaults, auto disk wipe (opt-in for fully-automated), driver injection (folder picker → `\$OEM$\$1\Drivers\`), AppX debloat patterns, registry tweaks (from the catalog), winget apps to install post-OOBE, and free-form custom commands attached to any of the 5 Setup hooks (`windowsPE`, `specialize`, `oobeSystem`, `setupcomplete`, `firstlogon`). Six templates: Privacy Maximum / Gaming Rig / Office Workstation / Bare Minimum / Blank Slate / **Fully Automated (zero clicks)**.

Sponsored-apps blockers fire in the specialize pass (before first network connect) — HKLM `CloudContent` + `WindowsStore\AutoDownload=2` + 18 `HKU\.DEFAULT\…\ContentDeliveryManager` writes — so apps like Spotify, Disney+, WhatsApp etc. don't even start downloading after install. AppX removal then runs two passes 60s apart in setupcomplete.cmd as SYSTEM to catch anything that snuck through.

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

**Background persistence service + tray companion** — Reclaim lives in the Windows notification area instead of being a one-shot GUI:

- Closing the window with X hides to tray; right-click → Quit Reclaim to exit fully. Optional "Start with Windows" boots straight to tray at login (no UAC prompt, no window flash).
- **Auto-persist active tweaks.** One global toggle: anything you turn on is automatically added to the persistence set, anything you revert is removed. The drift loop walks that set after every Windows update and re-applies anything that got flipped back. Two modes: *Update-only* (default — only after a recent hotfix in the last 48h) and *Strict* (every tick). Configurable interval (1h / 6h / 12h / 24h). Expandable list shows exactly what's tracked.
- **SYSTEM-context persistence for admin tweaks.** Sub-toggle installs `\Reclaim\Persist-Current` as a SYSTEM-running scheduled task that re-applies HKLM + shell tweaks at logon plus on the configured interval — no UAC prompt at boot, no manual reapply after monthly Patch Tuesday. Auto-rebuilt whenever the tracked admin-id set or the interval changes.
- **Push notifications.** Native Win11 toasts when drift was re-applied, when Windows Updates are available, and when a newer NVIDIA driver is out. Battery-aware (skipped under 30% on battery), 24h throttled, click-to-route to the relevant page.

**Windows activation launcher** — Live license-state card (edition, status code, channel, partial product key) read from WMI `SoftwareLicensingProduct`, plus a one-click launcher that opens a new **elevated PowerShell window** running the external [MAS](https://massgrave.dev/) one-liner (`irm https://get.activated.win | iex`). Reclaim does not bundle, modify, or contain the activation script itself — only the launch command is fired off. Includes a methods reference card (HWID / KMS38 / Ohook / TSforge / Online KMS) and an explicit disclaimer. Use only on systems you own a license for; Microsoft Defender may flag the script — that is expected.

## Other things that make Reclaim different

- **Real shell icons** for Startup, Bloatware, and OneDrive — extracted from EXEs via `Icon.ExtractAssociatedIcon` (handles quoted paths, env-var expansion, `.lnk` target resolution, Squirrel updater path-hop, progressive whitespace trim for unquoted paths with embedded spaces). UWP entries get their real `Square44x44Logo` from the package manifest — same files Start Menu uses.
- **Self-elevation on launch**: clicks UAC for you on cold start. If you decline, the app runs in **restricted mode** — admin-requiring tweaks are hidden, admin-only pages are locked, and click-to-elevate buttons in the titlebar, Dashboard, every tweak section, and every locked page get you to UAC anytime. Denial is sticky for the session (no re-prompt loop).
- **Reversibility is architecture**: every tweak knows its Windows default. Toggle the switch and it's gone.
- **Portable mode**: download `Reclaim-Portable-vX.Y.Z.exe` from Releases — a single-exe build that writes **nothing** to disk next to itself. App state (theme, custom profiles, activity log) lives in the Webview2 user-data store; Windows manages that folder, so a portable run leaves no `data/` directory behind. Built from the same sources via the `portable` Cargo feature.
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
      catalog.ts       200 typed tweak records (apply/revert/check ops)
      bloatware.ts     155+ AppX wildcard patterns (incl. OEM + Sponsored Apps)
      profiles.ts      Built-in preset bundles
      bridge.ts        TS wrappers for every Tauri command
      executor.ts      applyTweak / revertTweak / getTweakState
      customProfiles.svelte.ts   localStorage-backed custom profile store
      profileEdit.svelte.ts      handoff state for ProfileBuilder
    apps/catalog.ts    106 curated winget entries (8 groups)
    tasksequence/      Install-Media Task-Sequence editor:
      types.ts           11 step-type discriminated union
      templates.ts       6 built-in templates incl. Fully Automated
      store.svelte.ts    Advanced-mode editable sequence
      simpleStore.svelte.ts  Simple-mode state (profile + 4 inputs)
      toUnattend.ts      Sequence → UnattendConfig converter
    hosts/             Builtin blocklists + remote sources
    network/           DoH provider presets, DNS helpers
    maintenance/       Operation catalog (op id → label/description)
    profiles/          Gradient presets, profile import/export helpers
    persistence/       Auto-tracked drift checker (HKCU) + update/driver
                       pollers + v0.15.1→v0.15.2 profile-list migration
    ui/                shadcn-style components (Button/Card/Switch/…)
                       BulkActionBar, Titlebar, Toaster
    components/        Layout, TweakSection, TweakRow, ProfileCard,
                       AdminBanner, TerminalPanel (xterm),
                       BackgroundServiceCard
    log.svelte.ts      Activity log (500 entries, localStorage + file mirror)
    admin.svelte.ts    Elevation + auto-UAC store
    theme.svelte.ts    system / light / dark
    prefs.svelte.ts    App prefs (theme, persisted to file + localStorage)
    tasks.svelte.ts    Long-running task registry (PTY-backed)
    cache.svelte.ts    SWR-style resource cache
    service.svelte.ts  Background service config (tray, interval, persisted
                       profiles, notification prefs)
    notify.ts          Win11 native toast dispatcher (throttled, route-tagged)
    route-cache.svelte.ts        per-route component memoization
    scroll-restore.svelte.ts     per-route scroll position
    startup-preload.svelte.ts    boot-time resource preloads
  routes/              33 routes (see below)

src-tauri/src/
  lib.rs               Plugin init + 118-command invoke_handler registry +
                       tray icon + close/exit handlers
  app_info.rs          Portable mode, app data dir, activity.log mirror
  cli.rs               Headless CLI dispatcher (--apply-profile / --admin-only
                       / --remove-bloat / --import-profile / --export-state)
  sysinfo.rs           Windows version + elevation + relaunch_elevated + accent
  sysquery.rs          Hardware (WMI) / Startup / Services / Power state
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
  unattend.rs          autounattend.xml + setupcomplete.cmd generator
                       (FirstLogonCommands + RunSynchronous + $OEM$ sidecar
                       routing; custom_commands hook-dispatch; winget apps;
                       opt-in disk_auto_setup for fully-unattended installs)
  iso_builder.rs       ADK oscdimg.exe ISO repack pipeline + $OEM$ inject
  usb_flash.rs         USB flasher (single FAT32 + DISM /Split-Image for
                       install.wim > 4 GB; hardware-ID extractor for stable
                       per-stick serial display)
  service.rs           Tray-resident background tick loop + tray menu wiring
  persistence.rs       SYSTEM scheduled task installer (\Reclaim\Persist-Current)
                       for admin-tweak persistence + legacy-task cleanup
```

### Routes (36 total)

Grouped in the sidebar as: Top · Clean up · Install · Customize · Network · Updates & drivers · System info · Licensing · App.

- **Top:** Dashboard, Profiles (+ Profile Builder)
- **Clean up:** Bloatware, OneDrive, AI & Copilot
- **Install:** Apps (winget), Install Media (Task Sequence editor + autounattend.xml + setupcomplete.cmd + ADK oscdimg ISO repack + USB flasher)
- **Customize:** Privacy, Defender*, Security hardening*, Browser (Edge)*, Explorer, Right-click menu*, Taskbar & Start, Search, Notifications, Performance
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

Phases 1-5, 7 (System depth), 8 (Customize & drivers), 9 (Licensing launcher), 10 (Security hardening + portable build), 11 (Install media builder), 12 (CLI mode), 13 (Persistence service + tray companion), 14 (Developer / Memory / Gaming categories), 15 (Catalog depth + mass driver updates), 16 (USB flasher + Install-Media correctness, v0.18.x), 17 (Aggressive bloatware killer, v0.19.0) and 18 (Task Sequence editor for Install Media, v0.20.0) are shipped. There are no technical blockers left for v1.0.0 — the app ships English-only by design (i18n is not a blocker), so what remains is a polish + bugfix pass plus optional catalog/feature depth. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's left before v1.0.0 and [`docs/PLAN.md`](docs/PLAN.md) for post-v1.0 ideas. Note: as of v0.11.0 the activation launcher likely closes the winget / SignPath distribution paths; v1.0.0 will ship unsigned via GitHub Releases.

## Inspirations

- [Win11Debloat](https://github.com/Raphire/Win11Debloat) — feature scope reference
- [ChrisTitusTech/winutil](https://github.com/ChrisTitusTech/winutil) — winget integration idea
- [Sophia-Community/SophiApp](https://github.com/Sophia-Community/SophiApp) — depth of tweak catalog
- [builtbybel/privatezilla](https://github.com/builtbybel/privatezilla) — privacy focus

All registry keys and PowerShell commands used here come from public Microsoft documentation.

## License

[MIT](LICENSE)
