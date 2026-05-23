# Reclaim Your Windows

A modern Windows 11 debloater and tweak suite. **Live state detection**, **reversible by design**, **Mica UI**. No GeForce Experience, no Adrenalin, no DSA — just the OS you paid for.

> Inspired by [Win11Debloat](https://github.com/Raphire/Win11Debloat) and [ChrisTitusTech/winutil](https://github.com/ChrisTitusTech/winutil), but built from scratch with a focus on transparency, reversibility, and modern UX.

## What it does

**Debloat** — Remove 55+ pre-installed bloatware apps (Bing apps, Xbox suite, Teams Consumer, Copilot, Clipchamp, Spotify/Netflix/TikTok stubs, …). Lists only what's actually on your system.

**Tweak** — 60+ Windows tweaks across 7 categories with **live status** showing what's already on:
- **Privacy**: telemetry, advertising ID, activity history, location, Wi-Fi Sense, autoplay, OneDrive ads, clipboard cloud sync, shared experiences
- **AI & Copilot**: Copilot, Recall, Click to Do, Edge AI, Notepad Copilot
- **Search**: Bing-in-Start, Cortana, web suggestions, search highlights
- **Explorer**: classic Win10 context menu, file extensions, hidden files, long paths, full path in title
- **Taskbar & Start**: widgets, Chat, Task View, alignment, sponsored recommendations, lock screen ads, seconds in clock, End-task right-click
- **Performance**: background apps, Storage Sense, Fast Startup, Game DVR, mouse accel, DiagTrack service, telemetry tasks, hibernation
- **Updates**: defer features, no auto-restart, disable Delivery Optimization (P2P)

**Profiles** — One-click presets:
- **Gaming** — kills Game DVR / background apps / mouse accel for max FPS
- **Privacy Maximum** — full lockdown (28 tweaks)
- **Performance** — free RAM and disk
- **Reclaim Basics** — every recommended tweak

**Windows Update center** — Scan, filter (Security / Quality / Drivers / Optional), and install Microsoft Update via the native `Microsoft.Update.Session` COM API. No PSWindowsUpdate module dependency.

**Driver updates without the bloat** — Detects your GPU (NVIDIA / AMD / Intel), checks Windows Update for signed drivers, and offers an **Auto-Search** button that opens the vendor's manual search page with your specs pre-filled and the search auto-clicked. Then install the standard driver with the companion-app checkbox unchecked.

**System info** — CPU / GPU (driver version + date) / RAM (per-slot speed + manufacturer) / Storage (per-drive usage + physical drives) / Motherboard / BIOS.

**Startup apps** — Enumerates HKCU\Run, HKLM\Run (incl. 32-bit), and both Startup folders. Toggle via the same `StartupApproved` binary blob Task Manager uses.

**Services** — Curated "notable services" list (DiagTrack, WSearch, SysMain, Xbox, …) with explanations, or full list of every Win32 service. Disable + stop in one click, with a confirmation dialog.

**Activity log** — Every tweak applied/reverted, every app removed, every restore point — persistent across sessions, filterable by severity, expand for PowerShell stderr.

## Other things that make Reclaim different

- **Self-elevation on launch**: clicks UAC for you on cold start. If you decline, the app runs in **restricted mode** — admin-requiring tweaks are hidden, Services route is locked, and click-to-elevate buttons in the titlebar, Dashboard, every tweak section, and on the Services page get you to UAC anytime.
- **Reversibility is architecture**: every tweak knows its Windows default. Toggle the switch and it's gone.
- **Restore point on demand** from the Dashboard or Settings.
- **Win11 Mica** translucent window with custom violet/fuchsia accent.
- **No telemetry**. Activity log is local-only. We're a privacy tool — irony would be fatal.

## Setup (development)

```powershell
cd E:\DEV\reclaim
pnpm install
pnpm tauri:dev
```

Requirements:
- Node 20+
- Rust toolchain (`rustup`)
- Webview2 runtime (ships with Windows 11)
- Windows 11 22H2+ for Mica (graceful fallback otherwise)

`pnpm-workspace.yaml` declares `allowBuilds: esbuild: true` so the install doesn't choke on esbuild's postinstall script.

## Production build

```powershell
pnpm tauri:build
```

Produces an NSIS installer in `src-tauri/target/release/bundle/nsis/`.

## Architecture

```
src/                  Svelte 5 + Tailwind v4 + Bits UI
  lib/
    tweaks/
      catalog.ts      All registry tweaks as typed data (60+)
      bloatware.ts    AppX wildcard patterns (~55)
      profiles.ts     Preset bundles (Gaming, Privacy Max, …)
      bridge.ts       TS wrappers for every Tauri command
      executor.ts     applyTweak / revertTweak / getTweakState
    ui/               shadcn-style components (Bits UI), BulkActionBar
    components/       Layout, ProfileCard, TweakSection, TweakRow
    log.svelte.ts     localStorage activity log (500 entries)
    admin.svelte.ts   Elevation + auto-UAC store
    theme.svelte.ts   system / light / dark
  routes/             Dashboard, Bloatware, Privacy, AI, …
                      WindowsUpdate, Drivers, Specs, Startup,
                      Services, Logs, Settings, NotFound

src-tauri/src/
  lib.rs              Plugin init + command registry
  sysinfo.rs          Windows version + elevation + relaunch_elevated
  tweaks.rs           PowerShell runner + AppX + registry + restore point
  sysquery.rs         Hardware / Startup / Services
  winupdate.rs        Microsoft.Update.Session search + install
  driver_search.rs    Vendor webview with auto-fill injection
```

## Stack

| Layer        | Tech                                                |
| ------------ | --------------------------------------------------- |
| Frontend     | Svelte 5 (runes), TypeScript strict, Vite 6, Tailwind v4 |
| UI primitives| Bits UI, Lucide icons, Geist (variable)             |
| Routing      | `svelte-spa-router` (hash)                          |
| Backend      | Rust + Tauri 2                                      |
| Registry     | `winreg` crate                                      |
| Elevation    | `windows-rs` (TokenElevation), PowerShell `Start-Process -Verb RunAs` |
| Win Update   | `Microsoft.Update.Session` COM (no PS module)       |
| AppX         | PowerShell `Get-/Remove-AppxPackage`                |

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the phased plan toward "best Windows debloater of all time": hosts + DNS, winget app manager, +100 more tweaks, system maintenance, custom profile builder, i18n, portable mode.

## Inspirations

- [Win11Debloat](https://github.com/Raphire/Win11Debloat) — feature scope reference
- [ChrisTitusTech/winutil](https://github.com/ChrisTitusTech/winutil) — winget integration idea
- [Belim/SophiApp](https://github.com/Sophia-Community/SophiApp) — depth of tweak catalog
- [builtbybel/privatezilla](https://github.com/builtbybel/privatezilla) — privacy focus

All registry keys and PowerShell commands used here are from public Microsoft documentation.

## License

MIT
