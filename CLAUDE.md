# Reclaim Your Windows — Claude Code Context

Tauri 2 + Svelte 5 desktop tool that debloats Windows 11, surfaces hidden settings, and runs system queries. Win11Debloat-inspired feature set but with **live state detection**, **reversibility-by-design**, and a **modern Mica UI**. UI stack derived from `E:\DEV\rechnungs-tool` (Zettel), now visually distinct.

## Current state

**v0.8.0** — OneDrive removal, right-click menu editor, real shell-icon extraction (exe + AppX), CI/release pipeline. Built on top of v0.7.0. i18n + signed-release distribution still open before v1.0.0.

v0.1.0 baseline (26 tasks):
- 7 tweak categories (Privacy, AI, Search, Explorer, Taskbar, Updates, Performance)
- 4 profile presets (Gaming, Privacy Max, Performance, Reclaim Basics)
- Bloatware remover with live AppX detection (~55 curated patterns)
- Windows Update center (search + install via `Microsoft.Update.Session` COM API)
- Drivers page (GPU detection + Auto-Search webview with form injection for NVIDIA/AMD/Intel)
- System info: Specs (CPU/GPU/RAM/Storage/MB/BIOS), Startup apps, Services
- Self-elevation flow (auto UAC at launch, lite-mode fallback, click-to-elevate everywhere)
- Activity log with localStorage persistence
- Floating BulkActionBar pattern for selections

v0.2.0 additions (Phase 1):
- `/hosts` route — curated builtin blocklists (MS Telemetry, Office/Edge, MS Ads)
  plus remote StevenBlack lists fetched on demand. Sentinel-based merge
  (`# >>> Reclaim: Name` … `# <<< Reclaim: Name`) leaves user lines untouched.
  Raw editor dialog with auto-`hosts.reclaim.bak` and one-click restore.
- `/network` route — DNS & DoH presets (Cloudflare / Cloudflare-Families / Quad9 /
  AdGuard / Google / Mullvad). One-click apply-to-all-connected, per-adapter
  custom servers, reset-to-DHCP, flush-cache.
- `src-tauri/src/network.rs` — hosts read/write/backup/restore, blocklist apply/remove,
  sentinel scan, `fetch_blocklist` via `reqwest`, DNS get/set/reset, DoH template add.
- New log actions: `network.blocklist_apply/remove`, `network.hosts_edit/restore`,
  `network.dns_set/reset`, `network.doh_set`.

v0.3.0 additions (Phase 2):
- `/apps` route — curated winget catalog with ~60 apps across 8 groups (Browsers,
  Communication, Dev, System tools, Media, Office, Gaming, Utilities). Per-app
  install / upgrade / uninstall, BulkActionBar for multi-install, Select-Recommended,
  upgrade-available badge with version diff.
- `src-tauri/src/winget.rs` — `winget_available`, `winget_version`,
  `winget_list_installed` / `winget_list_upgradable` (returns raw text, frontend regex-matches
  catalog IDs to versions), `winget_install` / `winget_uninstall` / `winget_upgrade` with
  `-e --silent --accept-source-agreements --accept-package-agreements`.
- `src/lib/apps/catalog.ts` — `AppEntry` type, `UNIQUE_APPS`, `GROUP_LABELS`, `GROUP_ORDER`,
  `RECOMMENDED_IDS`.
- Missing-winget banner with deep-link to App Installer in MS Store (fallback to web URL).
- New log actions: `app.install / app.uninstall / app.upgrade`.

v0.4.0 additions (Phase 3):
- New tweak category `notifications` + `/notifications` route. `NOTIFICATION_TWEAKS` (8 entries):
  toasts off, sounds off, lock-screen toasts off, tips/tricks, welcome experience,
  finish-setup, Start app suggestions, Defender summary off.
- +15 Privacy: inking/typing personalization, app access (Account, Contacts, Calendar,
  Call History, Messaging, App diagnostics), SmartScreen (Explorer/Edge/Store),
  Compat Appraiser + ProgramDataUpdater scheduled tasks, clipboard history,
  app launch tracking, handwriting data sharing.
- +5 AI: Paint Cocreator, Photos generative erase, WindowsAI policy umbrella, Edge Hub
  sidebar (Bing Chat), Office connected experiences feedback.
- +5 Search: SafeSearch, device search history, MSA/AAD cloud search, recent docs in Start.
- +10 Explorer: compact mode, no '- Shortcut' suffix, drive letters first, nav-pane
  expand/show-all, confirm-file-delete back, restore Explorer on logon, verbose status
  messages, hide Quick Access pinned/recent, thumbcache off on network.
- +8 Taskbar: combine-when-full, small mode, hide search box, hide tray People,
  multi-monitor current-monitor-only, primary-monitor-only, NoRecentDocsHistory,
  show-all-tray icons.
- +5 Updates: exclude drivers from WU, extended active hours (6–23), notify before
  download, block Insider Preview, no-auto-restart-with-users.
- +10 Performance: Reserved Storage off (DISM), NTFS last-access off (fsutil),
  scheduled defrag off, IPv6 Teredo off, NDU service off, High Performance plan,
  menu show delay 0ms, visual effects best-performance, WSearch indexing off.
- `PROFILES.privacy-max` extended to ~50 ids; `PROFILES.gaming` and `PROFILES.performance`
  reference the new perf tweaks.

**Next**: see `docs/ROADMAP.md`. Phase 4 is System Maintenance (DISM/SFC/Power Plans).

v0.5.0 additions (Phase 4):
- `/maintenance` route — three sections (Repair / Cleanup & disk / Network) plus a
  Power Plans manager. Live console pane with autoscroll shows stdout/stderr line-by-line.
- Operations: SFC /scannow · DISM CheckHealth/ScanHealth/RestoreHealth ·
  WinSxS cleanup and ResetBase · Network stack reset (winsock + ip + flushdns +
  release/renew) · CleanMgr launcher (GUI) · Memory Diagnostic launcher (mdsched).
- Power plans: list with active flag, one-click activate, "Unlock Ultimate Performance"
  duplicates the hidden GUID so it appears in the list.
- `src-tauri/src/maintenance.rs` — streaming via `tauri::ipc::Channel<StreamEvent>`.
  `run_streamed()` spawns a PowerShell child, reads stdout + stderr on separate threads,
  emits StreamEvents (`stdout` / `stderr` / `exit`). GUID input validated for power-plan
  ops; PowerShell payload is static per operation, no string injection.
- Bridge: `maintenanceRun(op, onEvent)`, `listPowerPlans`, `setPowerPlan`,
  `unlockUltimatePerformance`, `launchCleanmgr`, `launchMemoryDiagnostic`.
- New log actions: `maintenance.run`, `power.set`, `power.unlock`.

**Next phase**: Phase 5 — Profile Builder + JSON import/export.

v0.6.0 additions (Phase 5):
- `/profiles` route — full profile management with built-in section (read-only, exportable)
  and custom section (edit / export / delete / apply). Header has Import + New buttons.
- `/profile-builder` route — form-driven creator/editor: name/tagline/description/gradient
  picker, two `<details>`-based accordions for tweaks (grouped by category) and bloatware
  (grouped by category). "Add all recommended" shortcut, per-section all/none toggle.
- `ProfileV1` versioned JSON envelope schema (`schemaVersion: 1`, name/tagline/description/
  gradient/tweakIds/bloatwarePatterns/custom/createdAt). `parseEnvelope()` validates,
  drops unknown tweak ids (warns user), regenerates id.
- `customProfiles` reactive `$state` store backed by localStorage key `reclaim.custom-profiles`.
  `profileEdit` mini-store carries the draft between Profiles list and ProfileBuilder.
- `GRADIENT_PRESETS` — 8 named gradient choices (Violet/Indigo/Emerald/Sunset/Sky/Rose/Lime/Slate).
- `src-tauri/src/files.rs` — tiny `read_text_file` / `write_text_file` commands for paths
  picked via `@tauri-apps/plugin-dialog` (`save()` / `open()`). No tauri-plugin-fs dep.
- Sidebar: "Profiles" added to the unlabeled top group next to Dashboard.
- New log activity already covered by existing `tweak.apply` action.

**Next phase**: Phase 6 — i18n + Portable + Onboarding + Auto-Updater (1.0.0).

v0.7.0 additions (Phase 6, partial):
- **Profile file format**: export now writes `.reclaim` files (still JSON inside). Import
  accepts both `.reclaim` and `.json` for backwards compatibility.
- **Onboarding** — `OnboardingDialog.svelte` shows on first launch (when
  `localStorage["reclaim.onboarded"] !== "1"`). Single dialog with two optional toggles:
  create restore point + apply Reclaim Basics. Skip dismisses without acting.
- **Portable mode** — `is_portable()` returns true when `portable.txt` or a `data/` directory
  sits next to the executable. `app_data_dir()` resolves to either `<exe-dir>/data` (portable)
  or `%APPDATA%/Reclaim` (installed) and creates it on demand. Settings page shows the mode
  + a clickable path that opens the folder in Explorer.
- **Log mirror** — `log_append(entry)` writes one JSON line per log entry to
  `<app_data_dir>/activity.log`. `log.svelte.ts` fires this fire-and-forget alongside the
  localStorage write. Crash-safe — survives webview cache wipes.
- **Auto-updater** — `tauri-plugin-updater` plugin wired in (Cargo + Rust init +
  `@tauri-apps/plugin-updater` JS dep). Settings page has a "Check for updates" button.
  **Not yet shippable** until:
  1. Generate Ed25519 keypair: `pnpm tauri signer generate`
  2. Add the public key + endpoint to `tauri.conf.json` under `plugins.updater`
  3. Sign release builds with `tauri build --target <…> --bundles …` using the private key
  4. Publish `latest.json` + the signed installer to GitHub Releases
  The "Check for updates" button currently falls back to opening the GitHub releases page
  in the browser when the updater isn't configured — so it stays useful in dev.
- New Rust module: `src-tauri/src/app_info.rs`.

**Still open for v1.0.0**:
- i18n (DE + EN locales, custom 50-line store, refactor every `.svelte` string).
- Real updater config (Ed25519 keypair + signed release pipeline).
- Code-signing the installer (EV cert or SignPath).

v0.8.0 additions:
- `/onedrive` — Hero card with the real Microsoft OneDrive logo + status badges
  (Running/Idle/Installed). Two-step flow: pick redirected folders to back up
  (Documents/Desktop/Pictures/sync root) via Tauri dialog → robocopy to chosen path;
  then uninstall via the official `OneDriveSetup.exe /uninstall`, remove leftover
  folders, unpin the sidebar CLSID, optionally write the
  `DisableFileSyncNGSC` group policy to prevent re-install.
- `/context-menu` — list & toggle shell-extension `ContextMenuHandlers`. Aggregates
  Files / Folders / Folder-background / Drives / AllFileObjects, dedupes by CLSID,
  resolves friendly names from `HKCR\CLSID\<id>`. Toggle writes
  `HKLM\…\Shell Extensions\Blocked\<guid>`. System entries dimmed by default with a
  Show System toggle. Disabled entries bubble to the top.
- **Real shell icons** for Startup + Bloatware + OneDrive:
  - `src-tauri/src/icons.rs` — `get_file_icons(cmds)` uses a `ResolveCommand`
    helper that handles quoted paths, env-var expansion, .lnk target resolution,
    Squirrel-updater path-hop (`Update.exe` → `app-*.*.*\<Name>.exe`), and
    progressive whitespace trim for unquoted paths with embedded spaces
    (`F:\Riot Games\Riot Client\…`). PNG bytes via
    `Icon.ExtractAssociatedIcon($resolved).ToBitmap()`.
  - `get_appx_icons(patterns)` reads `Square44x44Logo` (or fallbacks) from each
    installed package's `InstallLocation\AppxManifest.xml` — same files Start
    Menu uses for the Apps list.
  - `resolve_commands(cmds)` batch path resolver, reused by the Properties verb
    and Open File Location actions.
  - `open_properties(command)` invokes the Shell.Application "Properties" verb on
    the resolved path — same dialog as right-click → Properties in Explorer.
- **Startup enumerator** now also scans `StartupFolderPackagedAppX` (the UWP
  autostart bucket) and renders UWP entries with their real package icons.
- **Per-row 3-dot menu** (fixed-positioned popover that escapes Card overflow):
  Open file location · Properties · Copy path/AUMID · Search online. Hover state
  is inset-rounded inside `p-1` container (shadcn-style, not full-bleed).
- **CI**: `.github/workflows/check.yml` runs svelte-check + cargo check on every
  push/PR. `.github/workflows/release.yml` triggers on `v*` tags or
  `workflow_dispatch`; builds NSIS + MSI via `pnpm tauri build`, optionally signs
  with `TAURI_SIGNING_PRIVATE_KEY` secrets, generates `latest.json` for the
  updater, drafts a GitHub Release with the artifacts. To go live: drop the
  private key into repo secrets and push a `vX.Y.Z` tag.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Svelte 5 (runes only), TypeScript strict, Vite 6, Tailwind v4, Bits UI |
| Routing | `svelte-spa-router` (hash) |
| Rust | Tauri 2 + `winreg` + `windows-rs` (TokenElevation) |
| Persistence | localStorage (logs, theme); no DB |
| Window effect | Mica via `tauri.conf.json` `windowEffects` |
| Plugins | shell, dialog, opener, window-state, process |

## Architecture

### `src/lib/tweaks/` — the catalog system

- **`catalog.ts`** — every tweak is a typed `Tweak` record with `apply: TweakOp[]`, optional `revert`, optional `check[]`. `TweakOp` is either `RegOp` (hive/path/name/type/value/defaultValue) or `ShellOp` (PowerShell script). Tweaks are grouped per category and unioned into `ALL_TWEAKS`.
- **`bloatware.ts`** — `BloatwareEntry[]` with PowerShell wildcard patterns (`*Spotify*`). Frontend converts to regex via `patternMatches`.
- **`profiles.ts`** — `Profile` references tweaks by id; `resolveProfileTweaks` looks them up.
- **`bridge.ts`** — TS wrappers around every Tauri command (`get_system_info`, `list_installed_appx`, `reg_read/write`, `search_windows_updates`, …). All `invoke` calls go through here.
- **`executor.ts`** — `applyTweak` / `revertTweak` / `getTweakState` / `tweakRequiresAdmin`. Hooks into `log` for every operation.

### `src/lib/` — shared

- **`log.svelte.ts`** — `$state`-based activity log, 500 entries, persists to localStorage. `log.success/info/warn/error` with action + target + message + optional details.
- **`admin.svelte.ts`** — elevation store. `admin.elevated`, `admin.checked`, `admin.requesting`. `maybeAutoElevate` runs on cold launch (sessionStorage flag stops re-prompting after denial). `relaunchElevated` invokes Rust to UAC and exits.
- **`theme.svelte.ts`** — `system | light | dark`. Persists to localStorage. Toggled only via Settings (sidebar switcher was removed).
- **`utils.ts`** — `cn()` via tailwind-merge + clsx.

### `src/lib/ui/` — shadcn-style wrappers

Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Switch, Checkbox, Dialog, Titlebar, Toaster, **BulkActionBar** (floating pill at `bottom-5`, `rounded-2xl`, primary-accent dot), toast (`toast.success/error/warning/action`). Geist font (variable). Icons via `@lucide/svelte`.

### `src/lib/components/`

- **`Layout.svelte`** — Titlebar (with elevate-button) + 4-group sidebar (Clean up / Customize / Updates & drivers / System info / App) + main scroll area. Sidebar uses `bg-foreground/[0.04] backdrop-blur-xl sidebar-bg` for Win11 chrome look.
- **`ProfileCard.svelte`** — gradient-topped card with name, tagline, description, tweak-count, "Preview" button → confirm dialog → batch apply.
- **`TweakSection.svelte`** — header bar (active count + select-all + apply-recommended + revert-all) + Card list + BulkActionBar. Filters out admin-requiring tweaks in lite mode, shows banner.
- **`TweakRow.svelte`** — row with left primary-accent bar (when on or selected), checkbox (click anywhere on row to select), title + badges, switch on right. `data-no-select` on switch/checkbox.

### `src/routes/`

Dashboard, Bloatware, Privacy, AI, Search, Explorer, Taskbar, Performance, Updates (settings), WindowsUpdate (scan+install), Drivers, Specs, Startup, Services, Logs, Settings, NotFound.

### `src-tauri/src/`

- **`lib.rs`** — plugin init + `invoke_handler!` registry.
- **`sysinfo.rs`** — `get_system_info` (uses build-number for Win11 detection — `ProductName` is hardcoded to "Windows 10" by MS), `is_elevated` (windows-rs `TokenElevation`), `get_accent_color`, `relaunch_elevated` (Start-Process -Verb RunAs, then exit current).
- **`tweaks.rs`** — `run_ps` (pub(crate), `CREATE_NO_WINDOW`), `list_installed_appx`, `remove_appx`, `reg_read/write/delete_value`, `create_restore_point`, `restart_explorer`. Also custom base64 encoder for elevated PowerShell wrapping.
- **`sysquery.rs`** — `get_hardware_info` (WMI JSON), `list_startup_apps` (Run keys + Startup folders + StartupApproved binary), `set_startup_enabled` (writes 12-byte binary `0x02`/`0x03` to StartupApproved), `list_services`, `set_service`.
- **`winupdate.rs`** — `search_windows_updates` (online search via `Microsoft.Update.Session`), `install_windows_updates` (AcceptEula + Download + Install collection).
- **`driver_search.rs`** — `open_driver_search` opens new `WebviewWindowBuilder` to vendor URL with `initialization_script` that fills NVIDIA dropdowns by option-text match and auto-clicks Search. AMD/Intel use a simpler search-box injector.

## Critical conventions

1. **Tweak is data, not code.** New tweak = one entry in `catalog.ts`. Logic stays in executor.
2. **Svelte 5 runes only**: `$state`, `$derived`, `$effect`, `$props`. No `export let`, no legacy stores in components.
3. **English UI strings, English code comments.** No German UI text anywhere.
4. **No comments except when WHY is non-obvious.** Don't narrate what code does.
5. **Reversibility is contract.** Every tweak either supplies `revert: TweakOp[]` or has `defaultValue` on every reg op so the fallback revert can restore. Shell-based tweaks MUST supply explicit `revert`.
6. **Admin detection per tweak**: any `RegOp` with `hive: "HKLM"` OR any `ShellOp` → `tweakRequiresAdmin == true`. Lite-mode filters these out.
7. **PowerShell scripts are static**, never built from user input.
8. **AppX patterns** are PowerShell wildcards (`*Foo*`). Bloatware UI converts to regex for matching against `Get-AppxPackage` output.
9. **Card list pattern**: use `<Card class="overflow-hidden gap-0 py-0 card-inset">` for row lists. The base Card has `gap-6` for stacked content; lists need `gap-0`.
10. **BulkActionBar pattern**: rows have `data-no-select` on interactive controls; rest of row is click-to-select.

## How to add a tweak

```ts
// in catalog.ts
{
  id: "kebab-case-id",
  category: "privacy",   // or one of the 7 categories
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

## How to add a Rust command

1. Implement in the appropriate module (`tweaks.rs`/`sysquery.rs`/`winupdate.rs`/etc.)
2. Mark with `#[tauri::command]`
3. Register in `src-tauri/src/lib.rs` `invoke_handler!`
4. Wrap in `src/lib/tweaks/bridge.ts` (camelCase TS wrapper, normalize snake_case → camelCase if needed)

## How to add a profile

In `src/lib/tweaks/profiles.ts`, add a `Profile` entry with:
- `id`, `name`, `tagline`, `description`
- `gradient` (Tailwind gradient classes — used in card top stripe and icon background)
- `tweakIds: string[]` — references existing tweak ids; missing ids are silently dropped at resolve time.

## Commands

- `pnpm tauri:dev` — full app (Webview2, hot reload)
- `pnpm dev` — frontend only (Tauri APIs unavailable; UI shows "Browser preview" hints)
- `pnpm check` — svelte-check (must be 0 errors before commit)
- `pnpm build` — Vite production build
- `pnpm tauri:build` — release bundle
- `cargo check` (from `src-tauri/`) — Rust validate
- **Always run `pnpm exec svelte-check` directly** if `pnpm check` fails on the pre-flight `pnpm install` step. Make sure `pnpm-workspace.yaml` has `allowBuilds: esbuild: true`.

## Tauri config notes

- `transparent: true` + `windowEffects: { effects: ["mica"] }` for Win11 Mica.
- `decorations: false` — custom titlebar via `lib/ui/Titlebar.svelte`.
- Body `bg` is `oklch(0.99 0 0 / 94%)` light / `oklch(0.14 0.006 285 / 82%)` dark → mostly opaque so Mica falls back gracefully on unsupported systems.
- Card uses `bg-card/95 backdrop-blur-md` — frosted glass over Mica.
- Sidebar uses `bg-foreground/[0.04]` (theme-agnostic 4% overlay) + `sidebar-bg` radial gradient hint.

## Cargo deps

```toml
tauri = "2"
tauri-plugin-{shell,dialog,opener,window-state,process} = "2"
serde, serde_json, thiserror
[target.cfg(windows)] winreg = "0.52", windows = "0.58" (Foundation, Registry, Security, Threading)
```

No URL or urlencoding crate — `driver_search.rs` has a small inline URL encoder.

## Don't

- Don't open new `WebviewWindow` for in-app routes — use `svelte-spa-router push()`. The driver-search window is the only exception (loads external URL).
- Don't bypass `bridge.ts` — every `invoke()` must go through a typed wrapper.
- Don't add a tweak that doesn't have either `revert` or full `defaultValue` coverage.
- Don't store sensitive data in localStorage. The activity log is fine; never write tokens or registry secrets there.
- Don't disable the auto-elevate prompt — denial is tracked in sessionStorage so it doesn't re-prompt that session.
- Don't use German strings anywhere in the UI.
- Don't write to HKLM without checking `admin.elevated` (the executor will fail silently, but you'd skip the UX feedback).
- Don't `gap-6` on a list card — use `gap-0 py-0`.

## Further reading

- `docs/ROADMAP.md` — phased plan (Phase 1-6) for getting from "best UX debloater" to "best of all time".
- `README.md` — user-facing overview.
