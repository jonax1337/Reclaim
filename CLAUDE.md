# Reclaim Your Windows — Claude Code Context

Tauri 2 + Svelte 5 desktop tool that debloats Windows 11, surfaces hidden settings, and runs system queries. Win11Debloat-inspired feature set but with **live state detection**, **reversibility-by-design**, and a **modern Mica UI**. UI stack derived from `E:\DEV\rechnungs-tool` (Zettel), now visually distinct.

## Current state

**v1.0.0 — first stable release.** All phases shipped. The v1.0.0 release adds a `/recovery` route (advanced restart targets + Windows System Restore point management), a headless `reclaim.exe --gen-install-media` CLI, shell-check support in the executor (so non-reg-observable tweaks like `Disable-MMAgent` / `Get-WindowsReservedStorageState` now have a working state probe), and a full QA pass that confirmed 199/200 tweaks roundtrip cleanly on Win 11 25H2 plus 121/121 recommended bloatware patterns purged via an end-to-end IM install. Bloatware is now decoupled from profiles — every ISO build uses the same `recommended:true` filter; profiles control tweaks only. The `/context-menu` Shell-Extension manager was removed (the `classic-context-menu` reg tweak is unaffected). For a per-version diff see [`CHANGELOG.md`](CHANGELOG.md). Post-v1.0 ideas in [`docs/PLAN.md`](docs/PLAN.md).

Headline numbers:
- **200 reversible tweaks** across 13 categories (privacy, ai, search, explorer, taskbar, notifications, performance, updates, browser, security, memory, gaming) — comparable to Sophia Script's function count
- **155+ bloatware patterns** across 8 groups (incl. OEM bloat for HP / Lenovo / Dell, plus +8 Sponsored-Apps publisher-prefixed entries added in v0.19.0 — WhatsApp, Spotify, Disney+, Netflix, TikTok, Instagram, Facebook, LinkedIn)
- **106 winget apps** across 8 groups, every icon slug verified against its source repo (direct URLs HTTP-probed) before shipping
- **4 built-in profiles** + a full custom profile builder with `.reclaim` import/export
- **6 Install-Media Task-Sequence templates** (Privacy Maximum / Gaming Rig / Office Workstation / Bare Minimum / Blank Slate / Fully Automated zero-clicks)
- **36 routes** in an 11-group sidebar
- **118 Tauri commands** across 27 Rust modules
- **CLI mode**: the same `reclaim.exe` accepts `--apply-profile`, `--apply-tweak`, `--remove-bloat`, `--import-profile <file.reclaim>`, `--export-state`, `--admin-only` etc. for headless / gold-image / SYSTEM-task use.
- **Install Media generator + USB flasher**: produces both autounattend.xml AND a `\$OEM$\$$\Setup\Scripts\setupcomplete.cmd` sidecar from a Task Sequence; ISO builder via Windows ADK `oscdimg.exe`; USB flasher with single-FAT32 + DISM-split layout (handles install.wim > 4 GB without third-party UEFI:NTFS shims).
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
- Auto-track persistence UX: dropped the per-profile "Keep applied" picker entirely. Single "Auto-persist active tweaks" toggle that auto-adds on `applyTweak`, auto-removes on `revertTweak`. Single SYSTEM task `\Reclaim\Persist-Current` with every tracked admin-id embedded in the action args, re-installed (with `-Force`) whenever the tracked set or interval changes. v0.15.1 → v0.15.2 migration resolves any leftover `persistedProfiles` in `service.json` to flat tweak ids and tears down old `\Reclaim\Persist-<profile-id>` tasks (v0.15.2).
- Developer tab + Memory + Gaming categories: new `/developer` route under its own sidebar group (live state of WSL / VirtualMachinePlatform / HypervisorPlatform / Hyper-V / Sandbox via `Get-WindowsOptionalFeature`, enable/disable streamed through `run_pty_script`, read-only WSL distros list, Dev Drive support card). New `memory` tweak category (`/memory`, 5 tweaks — RAM compression, SysMain, Prefetch, Page Combining, ClearPageFileAtShutdown). New `gaming` tweak category (`/gaming`, 8 tweaks — Game Mode, MMCSS SystemResponsiveness, MMCSS Games priority block, Win32PrioritySeparation, ForegroundLockTimeout, NetworkThrottlingIndex, TCP ACK + NoDelay on all interfaces, HPET off). Gaming + Performance built-in profiles enriched with the relevant new tweaks. Dashboard surfaces all three new routes (v0.16.0).
- Catalog depth + mass driver updates: +20 tweaks to reach 200 across privacy / explorer / performance / notifications / security / memory (NetBIOS off, SMB1 off, MapsBroker, RetailDemo, dmwap, WMP-network-sharing, Xbox services, balloon tips, file checkboxes, Nearby Sharing off, Office cloud content off, lock-screen Spotlight off, etc.). Apps catalog 67 → 106 (+39 across all 8 groups — Floorp, Opera, IntelliJ CE, Android Studio, Cursor, Zed, Bun, Deno, BleachBit, Autoruns, foobar2000, Krita, draw.io, Playnite, Battle.net, VeraCrypt, Wireshark, …) **with every icon slug verified** against its source repo (homarr-labs/dashboard-icons, simple-icons, selfh.st/icons) and direct `https://…` URLs HTTP-probed for non-empty 200s before shipping; 3 apps (lazygit, ExplorerPatcher, TreeSize Free) cut because no proper icon exists in any public source. `/drivers` gained a Windows Update driver-catalog scanner that classifies updates into Audio / Chipset / Display / Network / Storage / Input / Camera / Print / Other and bulk-installs via the existing `installWindowsUpdates` command — closes the "no non-GPU driver path" gap vs. WinUtil. Privacy Maximum + Performance profiles enriched (v0.17.0).
- **USB-stick flasher** in Install Media — `Get-Disk | Where BusType -eq USB` enumeration with double-confirm dialog. Single FAT32 partition (cap 32 GiB due to Format-Volume limit), `dism /Split-Image /SWMFile install.swm /FileSize:3800` for install.wim > 4 GiB. Microsoft's native approach, no Rufus/UEFI:NTFS shim needed. New `usb_flash.rs` Rust module. Plus live Windows Update install progress (per-update phase + %) via `install_windows_updates_stream`. Plus **six bugs** in the v0.13.0 unattend.xml generator fixed that prevented unattended installs from completing: forced `<DiskConfiguration>`-on-Disk-0 wipe removed (Setup now asks once where to install), schema-invalid `<Reseal>` in specialize pass removed, KMS keys list rewritten against MS docs (Pro/Pro N were on wrong keys), deprecated `<SkipMachineOOBE>` + `<SkipUserOOBE>` removed (abort `oobeSystem` on 24H2/25H2), bogus `<HideLocalAccountScreen>` removed, blank-password local-account block conditionally skipped (24H2+ LSA refuses blank-password creation). AppX-removal moved into `setupcomplete.cmd` via `\$OEM$\$$\Setup\Scripts\` and the unattend now sets `<UseConfigurationSet>true</UseConfigurationSet>` so Setup auto-copies $OEM$ into `%WINDIR%`. AppX RunSynchronous was also moved out of the `Microsoft-Windows-Shell-Setup` component into a sibling `Microsoft-Windows-Deployment` component — Shell-Setup doesn't allow `<RunSynchronous>` as a child in specialize pass, and the resulting `0x80220001 "unattend file is not valid"` schema error was the root cause of the v0.18.x install-mid-reboot crashes (v0.18.0 → v0.18.3).
- **Aggressive bloatware killer**: Pre-OOBE CloudContent + WindowsStore + 18 SubscribedContent / ContentDeliveryManager writes emitted in `specialize` as both HKLM policies and `HKU\.DEFAULT\…` (Default-user-hive template, propagates to every new account). Closes the Sponsored-Apps push-during-OOBE window before the Store fetches its consumer manifest. setupcomplete.cmd now runs TWO passes with a 60s sleep between them so apps that finished downloading mid-run get caught on the second pass; each pass hits both `Get-AppxProvisionedPackage` (image baseline) AND `Get-AppxPackage -AllUsers` (the freshly-created admin's copies). Plus the bloatware catalog got the v0.18.3 audit treatment: MSTeams was in `bloatware.ts` since v0.13.0 but not marked `recommended:true` (so Privacy Maximum silently excluded it) — fixed. `Microsoft.Copilot` got a wildcard sibling. WhatsApp / Spotify / Disney+ / Netflix / TikTok / Instagram / Facebook / LinkedIn added as explicit publisher-prefixed patterns (was wildcards only; sponsored-apps publisher namespaces are stable enough to target directly) (v0.19.0).
- **Install Media → Task Sequence editor** (`/install-media`, replaces `/iso-builder`). Two modes selectable from the page header. **Simple mode (default)**: profile dropdown (built-in + custom) + 4 inputs + Fully-automated toggle, one-click Build/Flash. **Advanced mode**: drag-and-drop editor with 11 step types (`meta` / `bypass` / `edition` / `oobe-skip` / `privacy` / `disk-setup` / `driver-inject` / `debloat-appx` / `reg-tweaks` / `apps-install` / `custom-cmd`), each step a card with enable/disable + expandable typed config + delete; "Add step" modal; 6 built-in templates including **Fully Automated (zero clicks)**. Backend got `custom_commands` (hook + command + description, routed to the right Setup hook), `winget_apps` (appended to `setupcomplete.cmd` as silent `winget install`), and `disk_auto_setup` (emits `<DiskConfiguration>` only when explicitly opted in via the disk-setup step's confirmation checkbox). New `generate_setupcomplete_cmd` Tauri command alongside `generate_autounattend_xml`. Driver-injection step copies a user-picked folder into `\$OEM$\$1\Drivers\`. USB drive serial numbers now read `Get-Disk .UniqueId`'s hardware-derived hex ID instead of the often-garbage iSerialNumber descriptor — for Kingston DataTraveler "0000000005" + control bytes → `E0D55EA574AE1571787B06CE` (the Windows-stable ID). New `src/lib/tasksequence/` subsystem with types, store, simpleStore, converter, StepCard, and 11 step components (v0.20.0).

**Still open for v1.0.0**: nothing language-related — English-only is the shipping stance and i18n is **not** a v1.0.0 blocker. What remains before v1.0.0 is feature/catalog depth + a polish pass (see [`docs/PLAN.md`](docs/PLAN.md) and [`docs/ROADMAP.md`](docs/ROADMAP.md)). Code-signing is also not planned — the v0.11.0 activation launcher (literal `get.activated.win` URL in the binary) likely closes both the winget-pkgs and SignPath Foundation paths, so v1.0.0 ships unsigned via GitHub Releases only.

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
- **`persistence/checker.ts`** — HKCU-only drift loop (runs in the user-context tray companion). Single iteration over `service.config.persist.tweakIds` (auto-managed by `executor.ts`: applyTweak adds, revertTweak removes). Looks up each id in a pre-built `tweakById` map of `ALL_TWEAKS`, filters out admin-required tweaks and tweaks without `check[]`, optionally gates on `recent_hotfix_installed_since(48)` (update-only mode), re-applies anything reading as `off`. One drift toast per run (not per tweak). Admin tweaks are handled separately by the SYSTEM scheduled task installed via `persistenceInstallTask` (see `persistence.rs`).
- **`persistence/migrate.ts`** — One-shot v0.15.1 → v0.15.2 resolver. Reads any leftover `persistedProfiles` from raw localStorage / service.json, resolves to flat tweak ids via `PROFILES` + `customProfiles`, writes to `service.persist.tweakIds`, and invokes `persistence_cleanup_legacy_tasks` to remove `\Reclaim\Persist-<profile-id>` tasks from the old layout. Idempotent via `service.legacyProfilesMigrated`. Invoked from `App.svelte`'s onMount after `service.ready`.
- **`persistence/updateChecker.ts`** — Background WU + NVIDIA driver pollers. WU runs every 12h, drivers every 24h (timestamps in `service.json`). Both skip when on battery <30%. NVIDIA version compare is naive last-N-digits match against the marketing version.
- **`utils.ts`** — `cn()` via tailwind-merge + clsx.

### `src/lib/` — domain helpers (non-catalog)

- **`apps/catalog.ts`** — `AppEntry` type, 46 `UNIQUE_APPS`, `GROUP_LABELS`, `GROUP_ORDER`, 16 `RECOMMENDED_IDS`.
- **`hosts/`** — builtin blocklists (MS Telemetry, Office/Edge, MS Ads) and remote source URLs (StevenBlack lists).
- **`network/`** — DoH provider presets (Cloudflare, Cloudflare-Families, Quad9, AdGuard, Google, Mullvad) + DNS helpers.
- **`maintenance/`** — operation catalog (op id → label, description, expected duration, admin-required flag).
- **`profiles/`** — `GRADIENT_PRESETS` (8 named choices) + import/export helpers (parse / validate / serialize the `ProfileV1` envelope).
- **`tasksequence/`** — Install Media Task Sequence subsystem (v0.20.0):
  - **`types.ts`** — discriminated-union `TaskStep` with 11 variants (`meta` / `bypass` / `edition` / `oobe-skip` / `privacy` / `disk-setup` / `driver-inject` / `debloat-appx` / `reg-tweaks` / `apps-install` / `custom-cmd`), `TaskSequence` envelope, `STEP_LABELS` / `STEP_DESCRIPTIONS` / `defaultConfig()` lookup tables, `makeStep()` factory.
  - **`templates.ts`** — 6 built-in templates (Privacy Maximum / Gaming Rig / Office Workstation / Bare Minimum / Blank Slate / Fully Automated). Pulls profile tweak-ids + bloatware patterns from the live catalog.
  - **`store.svelte.ts`** — `$state`-based reactive store for Advanced-mode sequence editing, persisted to localStorage `reclaim.task-sequence`. CRUD: `addStep` / `removeStep` / `toggleStep` / `updateStep` / `updateStepConfig` / `reorder` / `loadTemplate`.
  - **`simpleStore.svelte.ts`** — separate state for Simple mode (profileId + locale + username + password + fullyAutomated toggle + targetDiskNumber + mode). Pure `buildSimpleConfig()` converts state → `UnattendConfig` without touching the sequence store.
  - **`toUnattend.ts`** — `convertSequence(seq)` walks enabled steps in order, folds their typed configs into the `UnattendConfig` wire format the existing Rust generator already knows. Routes `custom-cmd` steps to the right hook, dispatches `driver-inject` / `disk-setup` into the right sidecar fields.
  - **`StepCard.svelte`** — shared row-list wrapper with drag handle (native HTML5 DnD), expand/collapse, enable toggle, delete. Uses `Card class="card-inset overflow-hidden gap-0 py-0"` per CLAUDE.md row-list convention.
  - **`steps/*.svelte`** — 11 step components, one per type. Each renders its config UI with the shared `labelClass`/`labelTextClass`/`fieldClass` pattern + bits-ui `Select` for dropdowns.

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

### `src/routes/` — 36 routes

Routed by `svelte-spa-router`. Grouped in the sidebar as follows:

- **Top:** Dashboard (`/`), Profiles (`/profiles`)
- **Clean up:** Bloatware (`/bloatware`), OneDrive (`/onedrive`), AI & Copilot (`/ai`)
- **Install:** Apps (`/apps`), Install media (`/install-media`)
- **Customize:** Privacy (`/privacy`), Defender (`/defender`)\*, Security hardening (`/security`)\*, Browser (`/browser`)\*, Explorer (`/explorer`), Right-click menu (`/context-menu`)\*, Taskbar & Start (`/taskbar`), Search (`/search`), Notifications (`/notifications`), Performance (`/performance`)
- **Network:** Hosts & blocklists (`/hosts`)\*, DNS & DoH (`/network`)\*, Firewall (`/firewall`)\*
- **Updates & drivers:** Windows Update (`/windows-update`), Drivers (`/drivers`), Update settings (`/updates`)
- **System info:** Specs (`/specs`), Startup apps (`/startup`), Services (`/services`)\*, Scheduled tasks (`/scheduled-tasks`)\*, Maintenance (`/maintenance`)\*
- **Licensing:** Activation (`/activation`)
- **App:** Activity log (`/logs`), Settings (`/settings`)
- Plus `/profile-builder` (entered from `/profiles`) and `NotFound` (`*`).

\* admin required — hidden / locked in restricted mode, click-to-elevate buttons everywhere.

### `src-tauri/src/` — 27 modules, 118 commands

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
- **`persistence.rs`** — SYSTEM-context persistence via a single scheduled task. Commands: `persistence_install_task(tweak_ids: Vec<String>, interval_hours)` (replaces or removes), `persistence_uninstall_task()`, `persistence_task_status() -> PersistenceTaskStatus`, `persistence_run_task_now()`, `persistence_cleanup_legacy_tasks() -> usize` (one-shot v0.15.1 leftover cleanup). Static PowerShell wraps `Register-ScheduledTask` with `TaskPath '\Reclaim\'`, name `Persist-Current`, principal `SYSTEM / ServiceAccount / RunLevel Highest`, triggers `AtLogOn + repetition every interval_hours`, action `reclaim.exe --apply-tweak <id1,id2,…> --admin-only --silent --no-elevate`. Every tweak id is validated to `[A-Za-z0-9_-]{1,128}` before being joined into the action argument. Installing / uninstalling / triggering requires the parent process (`reclaim.exe` itself) to be elevated; the GUI gates the toggle on `admin.elevated`.
- **`usb_flash.rs`** (v0.18.0+) — USB-stick flasher. Commands: `list_usb_drives()` (parses `Get-Disk` JSON; cleans the raw `SerialNumber` and extracts the 24-char hardware ID from `UniqueId`'s `USBSTOR\…\<HWID>&0` path for a stable per-stick identifier even on garbage firmware) and `usb_flash_iso(task_id, req, …)` (PTY-streamed `diskpart` + `dism /Split-Image` pipeline: clean + GPT-init the disk, single FAT32 partition capped at 32 GiB, robocopy ISO contents excluding install.wim, split install.wim into install*.swm if > 4 GiB, optionally drop autounattend.xml + `\$OEM$\$$\Setup\Scripts\setupcomplete.cmd` onto the stick). Rust-side disk-bus + system-disk checks before any destructive op; PS script re-verifies the same in defence in depth. 10 unit tests for the serial cleanup heuristics.
- **`unattend.rs`** updates (v0.18.x – v0.20.0): `UnattendConfig` got `custom_commands: Vec<CustomCommand>` (routed per `hook` field into windowsPE-/specialize-`RunSynchronous`, oobeSystem-`FirstLogonCommand`, or appended to setupcomplete.cmd for the `setupcomplete` hook), `winget_apps: Vec<String>` (silent `winget install --exact --id …` lines appended to setupcomplete.cmd), and `disk_auto_setup: Option<DiskAutoSetup>` (only when Some, the windowsPE pass emits `<DiskConfiguration>` + `<InstallTo DiskID=N PartitionID=3>` for the fully-automated flow). New `generate_setupcomplete_cmd` command returns just the script body — both ISO builder + USB flasher use it. `pass_specialize` correctly emits `<RunSynchronous>` inside a dedicated `Microsoft-Windows-Deployment` component (Shell-Setup is not a valid parent for RunSynchronous in this pass — fixed v0.18.3). Pre-OOBE sponsored-apps blockers (HKLM CloudContent + WindowsStore + 18 HKU\.DEFAULT ContentDeliveryManager / SubscribedContent writes) emitted in specialize whenever any AppX patterns are present (v0.19.0). setupcomplete.cmd runs AppX removal in two passes with `ping 127.0.0.1 -n 61` between them so Microsoft-Store-pushed Sponsored Apps that finished mid-run get caught on the second pass (v0.19.0).
- **`iso_builder.rs`** updates (v0.18.x – v0.20.0): `IsoBuildRequest` accepts an optional `setupcomplete_cmd` string; when non-empty the PS pipeline writes it to `<work_dir>\$OEM$\$$\Setup\Scripts\setupcomplete.cmd` before the oscdimg repack so Windows Setup auto-copies it into `%WINDIR%` during install.

## Critical conventions

1. **Tweak is data, not code.** New tweak = one entry in `catalog.ts`. Logic stays in executor.
2. **Svelte 5 runes only**: `$state`, `$derived`, `$effect`, `$props`. No `export let`, no legacy stores in components.
3. **English UI strings, English code comments.** No German UI text anywhere — the app ships English-only by design.
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
- Don't use German strings anywhere in the UI — the app is English-only.
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
