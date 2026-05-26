# Architecture

Deeper technical reference for `src/` and `src-tauri/`. Keep this in sync with `CLAUDE.md` — that's the brain dump, this is the deep-dive.

## Mental model

Reclaim is a **typed data catalog** (tweaks, profiles, bloatware) interpreted by a **Rust execution layer** (registry writes, PowerShell scripts, Windows COM APIs), with a **Svelte 5 UI** that reads catalog data + live system state.

Everything reversible is reversible because the catalog records the Windows default. Everything observable is observable because we read the registry directly, not from cache.

## Three-tier flow

```
User clicks switch → TweakRow.toggle()
  → executor.applyTweak(tweak)
  → for each op in tweak.apply:
      → if RegOp: bridge.regWrite(...)
      → if ShellOp: bridge.runPowershell(...)
  → log.success(...)
  → TweakSection refreshes state via getTweakState
```

The same flow runs backwards for `revertTweak`.

## State sources

- **Live registry**: `getTweakState` reads every `check` op and compares to expected value. No caching.
- **Live PowerShell**: app inventories (`Get-AppxPackage`), service list (`Get-Service`), startup entries, hardware info — all queried fresh on route mount, cached only for the lifetime of the route.
- **localStorage**:
  - `reclaim.activity-log` (last 500 entries)
  - `reclaim.prefs` (theme; mirrored to `<app_data_dir>/prefs.json`)
  - `reclaim.custom-profiles` (user-created profiles)
- **sessionStorage**:
  - `reclaim.elevate-denied` — stops auto-UAC prompting until app restart
- **In-memory** ($state stores): `admin`, `theme`, `log`, route-local state.

## Component contracts

### `TweakSection`

Input: `tweaks: Tweak[]` (one category).
Manages: `states` (Record<id, TweakState>), `selected` (Set<id>), `loading`, `busy`.
Filters: hides admin-requiring tweaks when `!admin.elevated`.
Children: `TweakRow[]` + floating `BulkActionBar`.

### `TweakRow`

Input: `tweak`, `state`, `selected`, callbacks `onChange`, `onSelectChange`.
Owns: `localOn` (optimistic toggle state), `busy`.
Click anywhere (except `[data-no-select]` elements) → toggles selection.

### `BulkActionBar`

Floating pill, `position: fixed; bottom-5; left-1/2; z-40`.
Renders when `count > 0`. Slide-up animation via Svelte transitions.
Children slot for action buttons. Clear-X always present.

### `ProfileCard`

Input: `profile`, `onApplied` callback.
Opens confirm Dialog showing all referenced tweak titles → batch-applies (skipping already-on), calls `onApplied`.

### `Layout`

Sidebar nav with grouped items. Titlebar with elevate badge/button.
Lite-mode signal: items with `adminOnly: true` get a `ShieldAlert` indicator.

## Backend module responsibilities

| Module | Owns |
|---|---|
| `sysinfo.rs` | Windows version detection (build-num based for Win11), `is_elevated` via TokenElevation, `relaunch_elevated` (Start-Process RunAs + exit current) |
| `tweaks.rs` | `run_ps` (the shared PS runner with CREATE_NO_WINDOW), registry read/write/delete, AppX list/remove, restore point, explorer restart, base64 encoder for elevated wrap |
| `sysquery.rs` | Hardware info (WMI/CIM JSON), startup apps (Run keys + StartupApproved binary), services list/control |
| `winupdate.rs` | `Microsoft.Update.Session` COM API: search + install; streaming variant (`install_windows_updates_stream`) emits per-update phase + percent events |
| `driver_search.rs` | Open child `WebviewWindow` with vendor URL + `initialization_script` that fills the form |
| `unattend.rs` | `autounattend.xml` generator + `setupcomplete.cmd` body generator. Wire format = `UnattendConfig`. Routes `custom_commands` to the right Setup hook (`windowsPE` / `specialize` → RunSynchronous in correct component; `oobeSystem` / `firstlogon` → FirstLogonCommand; `setupcomplete` → appended to script). Conditional emission: `<DiskConfiguration>` only when `disk_auto_setup: Some(_)`, `<UserAccounts>` only with non-empty password, `<ImageInstall>` only when `edition` or `disk_auto_setup` set. Pre-OOBE sponsored-apps blocker (HKLM CloudContent + HKU\.DEFAULT ContentDeliveryManager writes) emitted in specialize whenever AppX patterns are present |
| `iso_builder.rs` | ADK `oscdimg.exe` ISO repack. Mounts source ISO, robocopy contents to work dir, drops `autounattend.xml` at root + `\$OEM$\$$\Setup\Scripts\setupcomplete.cmd` in the work dir, oscdimg-rebuilds as hybrid bootable ISO |
| `usb_flash.rs` | USB flasher. `list_usb_drives` enumerates `Get-Disk` USB entries, extracts a stable hardware ID from `.UniqueId` (vs the often-garbage iSerialNumber descriptor). `usb_flash_iso` runs the diskpart + DISM /Split-Image pipeline in a PTY (ConPTY): clean disk, init GPT, single FAT32 partition (cap 32 GiB), robocopy ISO contents, split install.wim > 4 GB into install*.swm chunks, optionally drop autounattend.xml + setupcomplete.cmd onto the stick |
| `gaming_session.rs` (v1.1) | `/gaming-session` backend. `session_snapshot` captures active power-plan GUID + Defender realtime state + Running/Stopped status of a hardcoded whitelist of toggleable services. `session_kill_processes` taskkills entries from a separate hardcoded whitelist of background apps. `session_set_power_plan` / `session_set_defender_realtime` / `session_stop_services` / `session_restore_services` are the per-step actions. Nothing user-controlled lands in a `taskkill` or `Set-Service` call — whitelist guards or strict GUID format checks gate every entry |
| `anticheat.rs` (v1.1) | `/anti-cheat-compat` backend. `ac_get_state` returns Secure Boot (via `Confirm-SecureBootUEFI`), TPM 2.0 (via WMI `Win32_Tpm`), VBS + HVCI (via WMI `Win32_DeviceGuard`), and testsigning / kernel debug (via locale-independent regex on `bcdedit /enum {current}` token names). `ac_disable_test_mode` + `ac_disable_kernel_debug` wrap the corresponding bcdedit flips |
| `nic.rs` (v1.1) | `/nic-tuning` backend. `nic_list_adapters` returns the user-visible NICs. `nic_list_properties` enumerates `Get-NetAdapterAdvancedProperty` with `ValidRegistryValues` / `ValidDisplayValues` arrays as parallel strings for the driver-published value picker. `nic_set_property` validates every input through a strict character whitelist before any PowerShell interpolation, then tries numeric `[int64]::TryParse` first and falls back to a string form. `nic_restart` cycles the adapter for properties that need it |
| `msi.rs` (v1.1) | `/msi-mode` backend. `msi_list_devices` enumerates `Get-PnpDevice -PresentOnly` filtered to Display / SCSIAdapter / MEDIA / Net / HIDClass / System / USB classes, with a `Win32_PnPEntity` fallback for SKUs without the Get-PnpDevice cmdlet. `msi_set_supported` writes `MSISupported=1` (or removes the value); device IDs are regex-validated. `HKLM\SYSTEM\…\Enum` is SYSTEM-owned with Administrators read-only ACL — direct writes get `ACCESS_DENIED`. Falls back to a one-shot SYSTEM scheduled task (`schtasks /create /ru SYSTEM /rl HIGHEST` → `reg.exe add` / `reg.exe delete` → `/delete`) and verifies the value landed by reading it back |
| `latency.rs` (v1.1) | `/latency-monitor` backend. `latency_ping_hosts` calls `System.Net.NetworkInformation.Ping.Send(host, 1500)` sequentially for up to 32 strict-validated DNS-safe hosts. Identical schema across PowerShell 5.1 and 7+. Read-only |

All modules emit JSON arrays via `ConvertTo-Json -InputObject @($out)` — the `-AsArray` parameter is PowerShell 7.0+ only and silently breaks on PS 5.1 (the default `powershell.exe`).

`run_ps` is shared (`pub(crate)`). All other modules' shell ops go through it.

## PowerShell script patterns

### Reading WMI as JSON

```ps
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores | ConvertTo-Json -Compress
```

PowerShell collapses single-item arrays to scalar, so frontend uses `asArray()` helper.

### Elevated wrap (used by `run_powershell(script, elevated=true)`)

1. Base64-encode the script
2. Wrap in a PowerShell parent that decodes + runs via `Start-Process -Verb RunAs` and redirects output to a temp file
3. Parent reads the temp file and returns its content

This works because UAC requires a fresh process. The detached child writes to disk; parent reads back. Don't pass arbitrary user input through this — scripts are always static catalog data.

### Long-running ops

Currently block until done (Windows Update install can take minutes). Phase 4 introduces event-stream pattern via Tauri events.

## Tweak operation semantics

```ts
type RegOp = {
  kind: "reg";
  hive: "HKCU" | "HKLM" | "HKCR" | "HKU";
  path: string;       // backslash-escaped subkey
  name: string;       // value name, "" for default value
  type: "DWORD" | "SZ" | "EXPANDSZ";
  value: number | string;
  defaultValue?: number | string;  // for auto-revert fallback
  deleteOnRevert?: boolean;        // delete instead of restore default
};
```

Revert logic (when no explicit `revert: TweakOp[]` is provided):

1. For each `RegOp` in `apply`:
   - If `defaultValue` set → `regWrite` with that value
   - Else → `regDeleteValue`
2. `ShellOp` cannot auto-revert; MUST supply explicit `revert` array

`tweakRequiresAdmin` flags any tweak with at least one HKLM `RegOp` or any `ShellOp` (conservative — most shell ops need admin).

## Mica + transparency

`tauri.conf.json`:
```json
"windows": [{
  "decorations": false,
  "transparent": true,
  "windowEffects": { "effects": ["mica"] }
}]
```

CSS:
```css
body { background-color: oklch(0.99 0 0 / 94%); }  /* light */
[data-theme="dark"] body { background-color: oklch(0.14 0.006 285 / 82%); }
```

Cards: `bg-card/95 backdrop-blur-md` — almost opaque, slight backdrop blur for the Win11 frosted-glass look.
Sidebar: `bg-foreground/[0.04] backdrop-blur-xl` — 4% foreground overlay, theme-agnostic distinction from body. `.sidebar-bg` adds a radial primary-tint at top-left.
Titlebar: same overlay approach, slightly subtler.

Fallback (no Mica): body alpha keeps the app usable on Win10 or older Win11 builds. Mica is applied transparently by DWM when available.

## Self-elevation flow

```
App start
  ↓
admin.refresh()
  ↓
admin.elevated?
  ├─ yes → continue
  └─ no → admin.maybeAutoElevate()
            ↓
          sessionStorage["reclaim.elevate-denied"] ?
            ├─ "1" → skip (continue in lite mode)
            └─ none → admin.relaunchElevated()
                        ↓ (invokes Rust)
                      Start-Process -Verb RunAs current_exe
                        ↓
                      UAC dialog
                        ├─ Yes → exit current; elevated child takes over
                        └─ No → PS exits non-zero
                                  ↓
                                set sessionStorage flag
                                  ↓
                                continue in lite mode
```

Lite mode UX:
- Titlebar badge becomes a click-to-elevate button
- Dashboard shows banner card → click → re-trigger UAC
- TweakSection shows banner per-page with hidden count
- Services page is fully gated behind elevation banner
- Sidebar marks admin-only routes with `ShieldAlert` icon
- Bloatware page stays accessible but removals may fail (logged + toasted)

## Activity log format

```ts
type LogEntry = {
  id: number;
  ts: number;  // unix ms
  level: "info" | "success" | "warn" | "error";
  action: "tweak.apply" | "tweak.revert" | "appx.remove" | "system.restore_point" | "system.explorer_restart" | "system.boot";
  target: string;   // human label
  message: string;
  details?: string; // PS stderr, error messages, etc.
};
```

Persisted to localStorage as JSON array. Max 500 entries, newest first.

## File-by-file route map

| Path | Route | Owner |
|---|---|---|
| `Dashboard.svelte` | `/` | HeroBanner + 4 KPI tiles (Active tweaks / Recommended pending / Bloatware patterns / Profiles available) + Recent activity feed (last 6 user-visible log entries) + permanent per-category Catalog coverage breakdown |
| `Bloatware.svelte` | `/bloatware` | AppX scan + group filter + BulkActionBar |
| `Privacy.svelte` … `Updates.svelte` | `/privacy` etc. | Thin wrapper around `TweakSection` with the right category list |
| `Gaming.svelte` | `/gaming` | The 35 gaming tweaks (was 7 pre-v1.1) — MMCSS, latency, HAGS, fullscreen-opt, …  |
| `GamingSession.svelte` (v1.1) | `/gaming-session` | Snapshot-based background suspend with auto-revert on End |
| `PerGameProfiles.svelte` (v1.1) | `/per-game-profiles` | Per-EXE GPU preference + AppCompat Layers via HKCU (no admin) |
| `MsiModeManager.svelte` (v1.1) | `/msi-mode` | Per-PCI MSI/MSI-X toggle, grouped by device class, sticky boot-risk warning + restore-point shortcut |
| `NicTuning.svelte` (v1.1) | `/nic-tuning` | Live `Get-NetAdapterAdvancedProperty` editor with 16 curated properties + Show-all |
| `LatencyMonitor.svelte` (v1.1) | `/latency-monitor` | Live ping with sparklines (8 presets + custom targets, 2/5/10 s cadence) |
| `AntiCheatCompat.svelte` (v1.1) | `/anti-cheat-compat` | Vanguard / EAC / BattlEye / VAC compat matrix with one-click fixes |
| `WindowsUpdate.svelte` | `/windows-update` | WU scan + filter chips + install via COM |
| `Drivers.svelte` | `/drivers` | GPU detect + Auto-Search webview + WU shortcut |
| `Specs.svelte` | `/specs` | CPU/GPU/RAM/Storage/MB/BIOS cards |
| `Startup.svelte` | `/startup` | Startup entries with per-row switch |
| `Services.svelte` | `/services` | Notable services + full list + confirm dialog |
| `Logs.svelte` | `/logs` | Activity log with filter chips |
| `Settings.svelte` | `/settings` | Theme + system actions + about (Win10 banner when build < 22000) |

## Bridge layer

`src/lib/tweaks/bridge.ts` is the single contract between TS and Rust.
Every command:
1. Has a typed wrapper function
2. Normalizes snake_case → camelCase
3. Wraps Rust `Result<T, String>` in a Promise that rejects on error
4. Documents the underlying invoke name

Don't bypass it. If you need a Rust command from a route, add the wrapper first.

## Adding cross-cutting state

If you add new global state (like a new store similar to `admin`/`log`), follow the pattern:
- File: `src/lib/<name>.svelte.ts`
- Export a class instance: `export const <name> = new <Name>Store();`
- Mark fields with `$state(...)` so they're reactive
- Methods are regular async functions

## Performance notes

- Tweak status loads in parallel via `Promise.all` in `TweakSection.reload`
- Hardware info is one PowerShell call returning structured JSON (~200ms)
- AppX list takes 2-5 seconds — show loading state
- Windows Update search can take 60s+ — show explicit "may take a minute" message
- Service list is ~200-300 entries — paginate by filter, not by hard limit

## Security model

- We never download executable code at runtime (winget for Phase 2 is OS-vended)
- All registry writes are catalog-defined, never user-input
- PowerShell scripts are static strings, never built from input
- The driver-search webview loads external vendor pages but has no Tauri API permissions — it's a sandboxed browser
- Activity log is local-only, never transmitted
