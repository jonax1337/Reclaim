# Changelog

All notable changes to Reclaim. Format loosely based on [Keep a Changelog](https://keepachangelog.com/).

## v0.1.0 — initial feature-complete baseline

### Added

**Tweaks** (60+ across 7 categories):
- Privacy: telemetry, advertising ID, activity history, location, feedback nag, tailored experiences, Find my device, error reporting, CEIP, Wi-Fi Sense, autoplay, OneDrive sync ads, clipboard cloud sync, shared experiences, Spotlight desktop, suggested actions
- AI & Copilot: Copilot, Recall, Click to Do, Edge AI, Notepad Copilot
- Search: Bing in Start, Cortana, web search, search highlights
- Explorer: classic context menu, file extensions, hidden files, hide Home/Gallery, launch This PC, long path support, full path in title bar
- Taskbar & Start: align left, hide widgets/task view/chat, hide sponsored recs, lockscreen tips, seconds in clock, hide recently added / most used, taskbar end-task
- Performance: Sticky/Toggle/Filter keys prompts, background apps, Storage Sense, Fast Startup, Game DVR, mouse accel, DiagTrack service, telemetry scheduled tasks, hibernation
- Updates: defer features, no auto-restart, delivery optimization off

**Bloatware remover** — 55+ curated AppX patterns with live-detection (only shows what's installed). Groups: consumer, office, gaming, communication, media, system.

**Profiles** — Gaming, Privacy Maximum, Performance, Reclaim Basics.

**Windows Update center** — search + install via Microsoft.Update.Session COM API. Filter by Security / Quality / Driver / Optional. EULA auto-accept.

**Drivers page** — GPU detection (NVIDIA / AMD / Intel), shortcut to Windows Update driver scan, vendor-link buttons with anti-bloat install hints, **Auto-Search** that opens vendor manual search in a child webview with form pre-filled and search auto-clicked.

**System info**:
- Specs route — CPU, GPU (driver + date + resolution), RAM (with module slots), storage, motherboard, BIOS
- Startup apps route — HKCU/HKLM Run keys + Startup folders + StartupApproved binary toggle
- Services route — curated "notable services" list with explanations, "Show all" mode, confirm-disable dialog

**Activity log** — 500-entry localStorage-backed log, filterable by severity, expand for stderr.

**Self-elevation flow** — auto-UAC at cold launch, sessionStorage-tracked denial, lite-mode that hides admin-requiring tweaks, click-to-elevate from titlebar / Dashboard / TweakSection / Services.

**Floating BulkActionBar** — slide-up pill at bottom-center for multi-select operations (tweak pages, bloatware, Windows Update).

**Settings** — theme picker (system/light/dark), restore point button, Explorer restart, about info.

**UI / UX**:
- Win11 Mica via `tauri.conf.json` windowEffects + transparent
- Custom titlebar with elevate badge
- Sidebar with 5 grouped sections, active-state gradient + dot indicator
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
