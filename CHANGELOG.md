# Changelog

All notable changes to Reclaim. Format loosely based on [Keep a Changelog](https://keepachangelog.com/).

## v1.1 — Gaming toolbox expansion

A gaming-first follow-up to v1.0.0: 28 new tweaks targeting input / network / GPU / CPU / fullscreen / audio latency, six new routes that go beyond the tweak catalog (snapshot-based background suspend, per-game GPU/AppCompat overrides, MSI mode toggling, NIC advanced-property editor, live ping monitor, anti-cheat compatibility matrix), a new `gaming-esports` built-in profile, a matching Install-Media template, plus a Dashboard redesign and a Win10 compatibility tier. No code-signing, no telemetry — same delivery model as v1.0.0.

Headline numbers:

- **228 tweaks** (was 200). Gaming category alone went 7 → 35 — comparable to or above what EXM Tweaks / Batlez / ToX bundle, but every entry has a `check[]` and either a `revert` or full `defaultValue` coverage, so the in-app status stays accurate and toggling off restores the OS default.
- **5 built-in profiles** (was 4) with the new `gaming-esports` at 48 tweaks for plugged-in desktop rigs — aggressive latency settings (NIC interrupt-moderation / EEE / flow-control off, AFD socket buffers, core parking off on AC, HPET off, TSC enhanced) that the regular `gaming` profile at 38 tweaks leaves alone.
- **7 Install-Media templates** (was 6) with the new "Esports Rig" pulling the gaming-esports profile + Steam/Discord/Epic/Firefox into a fresh-Windows-install bundle.
- **42 routes / 34 Rust modules / 156 Tauri commands** (was 36 / 29 / 137). Five new Rust modules: `gaming_session`, `anticheat`, `nic`, `msi`, `latency`.

### Added

- **`/gaming-session` route** (Gaming group, admin-only). One toggle: Reclaim snapshots the active power-plan GUID, Defender real-time state, and a closed whitelist of toggleable services (`WSearch`, `SysMain`, `DiagTrack`, `WerSvc`, `Spooler`, `WbioSrvc`, `BITS`, `wuauserv`, `BthAvctpSvc`, `TabletInputService`), then kills any subset of a closed whitelist of background processes (Discord, Spotify, browsers, OneDrive, Steam/Epic/EA/Ubi launchers, OBS, Code, …) the user picked. End-session reverses everything from the snapshot. Whitelist is hardcoded in `gaming_session.rs` — nothing user-controlled lands in a `taskkill` or `Set-Service` call. Snapshot is persisted to localStorage so a Reclaim crash mid-session lets the next launch surface a manual-restore offer.
- **`/per-game-profiles` route** (Gaming group, **no admin required** — HKCU only). Pick an `.exe`; Reclaim writes to `HKCU\Software\Microsoft\DirectX\UserGpuPreferences` (the same key Windows Settings → Graphics writes) plus the per-user AppCompat `Layers` key. Per-game controls: GPU performance preference (auto / power-saving / high-performance), disable fullscreen optimizations, HighDPIAware override, Run-as-admin. Icons come from the existing `get_file_icons` extractor. Removing a profile cleans both registry locations so there are no orphans.
- **`/msi-mode` route** (Gaming group, admin-only — the OC-scene "Holy Grail" tweak). Enumerates physical PCI devices via `Get-PnpDevice -PresentOnly` (with a `Win32_PnPEntity` fallback for stripped-down SKUs), groups by class (Display / SCSIAdapter / MEDIA / Net / HIDClass / System / USB), shows the current `MSISupported` and `MessageNumberLimit` per device, and toggles them. `HKLM\SYSTEM\CurrentControlSet\Enum\…` is SYSTEM-owned and grants Administrators read-only access, so direct writes get `ACCESS_DENIED`. Reclaim first attempts a direct write with `-ErrorAction Stop` (some keys are admin-writable after a recent driver install); on failure it falls back to a one-shot SYSTEM scheduled task (`schtasks /create /ru SYSTEM /rl HIGHEST` → `reg.exe add` / `reg.exe delete` → `/delete`), then verifies the value landed by reading it back. Sticky "wrong values prevent boot" warning that the user must explicitly dismiss, plus a one-click restore-point shortcut.
- **`/nic-tuning` route** (Network group, admin-only). Live editor for `Get-NetAdapterAdvancedProperty`. Sixteen curated latency-relevant properties (EEE, FlowControl, InterruptModeration, RSS, JumboPacket, LSO v2 IPv4/IPv6, Realtek Green Ethernet, Advanced EEE, USB Selective Suspend, TCP/UDP Checksum Offload, …) with explanations and recommended values; "Show all" expander dumps every remaining property. Per-property Select uses the driver's published `ValidRegistryValues` / `ValidDisplayValues`. Reset goes through `Reset-NetAdapterAdvancedProperty` which restores the driver's published default. Adapter-restart button cycles the NIC for properties that need it (Jumbo Packet, Speed/Duplex).
- **`/latency-monitor` route** (Network group, **no admin required**). Live ICMP ping with sparklines. Eight built-in preset endpoints (Steam, Riot, Epic, Battle.net, Discord, Cloudflare, Google DNS, GitHub) plus user-added custom targets in a small dialog. 2 / 5 / 10 s polling, rolling 60-sample buffer rendered as a color-coded sparkline with min / avg / max / loss % stats. Sequential `System.Net.NetworkInformation.Ping.Send` with 1.5 s timeout — at 8 healthy targets the wall clock stays under 300 ms per tick. Pure read-only, no system changes.
- **`/anti-cheat-compat` route** (Gaming group). Probes Secure Boot (via `Confirm-SecureBootUEFI`), TPM 2.0 (via WMI `Win32_Tpm`), VBS + HVCI (via WMI `Win32_DeviceGuard`'s `VirtualizationBasedSecurityStatus` and `SecurityServicesRunning`), Test Mode + kernel debug (via `bcdedit /enum {current}` regex on token names — locale-independent), then renders a 4-card compatibility matrix for Riot Vanguard, Easy Anti-Cheat, BattlEye and VAC. Each anti-cheat lists its specific issues; rows can be one-click-fixed where possible (`bcdedit /set testsigning off`, `bcdedit /debug off`) or open the existing `/recovery` route's UEFI restart for Secure Boot. Read-only by default — fixes are explicit and dialog-gated.
- **28 new gaming tweaks** (gaming category went 7 → 35):
  - **Input & peripheral** (5): `mouse-hover-time-fast` (400 ms → 1 ms tooltips), `keyboard-delay-fast` (minimum repeat-delay), `keyboard-speed-fast` (maximum repeat-rate), `usb-selective-suspend-off-global` (`HKLM\SYSTEM\CurrentControlSet\Services\USB!DisableSelectiveSuspend = 1`), `hid-power-management-off` (`SelectiveSuspendEnabled` + `EnhancedPowerManagementEnabled` = 0 on every HID device — 2-level explicit iteration, not Recurse, so the scan stays under 500 ms).
  - **Network latency** (6): `tcp-delack-ticks-off` (per-interface `TcpDelAckTicks=0`, complements the existing TCPNoDelay tweak), `qos-reserved-bandwidth-off` (`NonBestEffortLimit=0` — removes the 20 % QoS reservation), `nic-energy-efficient-ethernet-off` / `nic-flow-control-off` / `nic-interrupt-moderation-off` (driver-published `*EEE` / `*FlowControl` / `*InterruptModeration` keywords, set via `Set-NetAdapterAdvancedProperty`), `afd-receive-window-tune` (`DefaultReceiveWindow` / `DefaultSendWindow = 64 KiB`).
  - **GPU & display** (4): `hags-on` (`HwSchMode=2`, Hardware-Accelerated GPU Scheduling — recommended, required for Reflex/DirectStorage), `gpu-tdr-delay-extend` (`TdrDelay/TdrDdiDelay = 10 s` to survive shader-compile spikes), `nvidia-telemetry-services-off` (disables `NvTelemetryContainer` service + matching scheduled tasks; no-op on non-NVIDIA systems), `amd-ueip-off` (`HKLM\SOFTWARE\AMD\CN!UserExperienceProgram = 0`).
  - **CPU & scheduling** (4): `power-throttling-off-policy` (`PowerThrottlingOff = 1` — kills EcoQoS background throttling so alt-tabbing doesn't stutter), `bcdedit-tscsync-enhanced` (`bcdedit /set tscsyncpolicy Enhanced` for smoother high-resolution timing on multi-CCD Ryzen + big.LITTLE Intel), `core-parking-off-ac` (forces 100 % cores un-parked on AC; setting GUID `0cc5b647-c1df-4637-891a-dec35c318583` via `powercfg -setacvalueindex`), `processor-perf-boost-aggressive` (PERFBOOSTMODE = 2 — CPU climbs to highest P-state immediately on any work, instead of waiting for sustained load).
  - **Fullscreen + Game Bar** (4): `fullscreen-optimizations-off-global` (`GameDVR_FSEBehavior=2` + 3 sibling values — forces real exclusive fullscreen, tighter DX11 frame pacing), `game-bar-fully-off` (kills the Game Bar overlay UI completely, stronger than the existing Game DVR tweak which leaves the UI enabled), `xbox-game-monitoring-off` (`xbgm` service), `game-bar-presence-writer-off` (GamePresenceWriter scheduled task).
  - **Storage / visual / audio** (5): `ntfs-8dot3-off` (`fsutil behavior set disable8dot3 1` — check reads `NtfsDisable8dot3NameCreation` from the registry, locale-independent), `ntfs-mft-zone-large` (MFT zone reservation raised to 25 % of volume), `transparency-effects-off` (`EnableTransparency=0` — Mica/Acrylic off, GPU/DWM win on integrated graphics), `dwm-input-io-completion-on` (`DwmInputUsesIoCompletionPort=1` — lower-overhead input pipeline under heavy compositor load), `audio-enhancements-off` (PKEY_AudioEndpoint_Disable_SysFx = 1 on every render endpoint — kills the SFX/MFX chain, often shaves ms off audio latency).
- **`gaming-esports` built-in profile** (48 tweaks). Everything the `gaming` profile applies (38 tweaks) plus the warning-tagged aggressive latency add-ons that the regular `gaming` profile leaves alone: NIC interrupt-moderation / EEE / flow-control off, AFD socket buffers enlarged, CPU core parking off on AC, HPET off, TSC sync Enhanced, transparency effects off, AMD UEIP off, audio enhancements off. Meant for plugged-in desktop rigs where competitive ping matters; clearly described as "higher power draw + higher CPU load" in the profile description so laptop users self-select out.
- **"Esports Rig" Install-Media Task-Sequence template** (template #7). Standard preamble + the new gaming-esports profile's reg-tweaks + the same minimal-keep AppX debloat list as the existing "Gaming Rig" template + winget pre-install of Steam, Discord, Epic Games Launcher, Firefox.
- **Dashboard "Catalog coverage" section** — permanent per-category snapshot. 12 mini progress bars in a 3-column grid showing `applied / total` and a percentage bar per category. Replaces the categories-grid shortcut UI that v1.0.0 had on the dashboard.
- **Dashboard "Recent activity" feed** — last 6 user-visible log entries with relative timestamp + level icon. Click "Open log →" jumps to `/logs`. Lifecycle noise (`system.boot`, `service.tick`) is filtered out.
- **Windows 10 compatibility tier.** README gains a Windows 10 "Best effort" status badge alongside the Win11 "Primary" badge plus an explicit graceful-degradation paragraph: every registry / service / scheduled-task tweak works the same on Win10 1809+, Win11-only features (Recall, Click to Do, Widgets, Mica) silently no-op because the underlying capabilities don't exist, the frosted-glass window effect falls back to standard opaque rendering. Settings page surfaces an inline `InfoBanner` when the system build number is < 22000. No separate build needed — same binary, same catalog.

### Changed

- **Sidebar reorganisation.** v1.0.0's `Customize` group had grown to 15 items in v1.1's catalog phase, which felt overwhelming. The five gaming-specific routes split out into a dedicated new `Gaming` group (Gaming tweaks / Gaming Session / Per-game profiles / Anti-cheat compat / MSI mode manager), Customize is back to its original 10 OS-tweak entries (Privacy / Defender / Security / Browser / Explorer / Taskbar & Start / Search / Notifications / Performance / Memory & caching), and the lone "Developer" group's `Windows features` item moved into `System info` where it sits next to Services and Scheduled tasks (all three are "OS subsystem on/off" pages thematically). Total group count unchanged (10), every group now has 2–10 items.
- **Dashboard redesign.** Profile cards and the categories grid both removed — they duplicated the dedicated `/profiles` tab and the sidebar respectively. The "Apply all recommended" + "Create restore point" hero buttons stay. KPI tile count went 3 → 4 (added "Profiles available" — built-in + custom). Recent activity feed and Catalog coverage section replace the deleted blocks.
- **Activity log noise filter.** `system.boot` ("Session started") was being pushed on every Reclaim cold start and `service.tick` on every background-check heartbeat. Neither is a user-visible action — they cluttered both the `/logs` page and the new Dashboard recent-activity feed. Both call sites removed; `log.svelte.ts` `load()` now filters `NOISE_ACTIONS` on hydrate and rewrites localStorage so existing history is cleaned the next time Reclaim starts; `push()` silently drops them as defence-in-depth.
- **`gaming` built-in profile expanded** from 18 → 38 tweaks. Picks up the new input-latency / NVIDIA-telemetry / GPU-HAGS / Game-Bar-fully-off / fullscreen-opt-off layer without crossing into the aggressive Esports territory.

### Fixed

- **PowerShell 5.1 listing-pipeline incompatibility — the silent-empty-array bug.** All four list-returning commands in the new routes (`nic_list_adapters`, `nic_list_properties`, `msi_list_devices`, `latency_ping_hosts`) ended their PowerShell payload with `ConvertTo-Json -AsArray`. The `-AsArray` parameter was added in PowerShell 7.0 / Core 6.0; on PowerShell 5.1 (which is the default `powershell.exe` on Win10/11) the parameter binding fails, the script aborts, stdout comes back empty, and the Rust side falls through to `Vec::new()`. Result: the corresponding routes showed "No adapters found" / "No PCI devices found" / "No ping samples" on every Win10/11 system that didn't have PowerShell 7+ explicitly installed. Replaced all four call sites with `ConvertTo-Json -InputObject @($out) -Depth N -Compress`, which produces a proper JSON array on both PS 5.1 and 7+. Verified live on PS 5.1 against `Get-PnpDevice` and `Get-NetAdapter` output.
- **`audio-enhancements-off` was inverted.** Apply was writing `PKEY_AudioEndpoint_Disable_SysFx = 0`, which ENABLES the system effects chain — exactly the opposite of the tweak's intent. Now writes `= 1` and uses a `New-Item -Force` to create the `FxProperties` subkey if a freshly-installed endpoint hasn't been touched by the audio stack yet. Check switched from dot-notation property access (`(Get-ItemProperty …).'{guid},5'`, fragile because of the comma in the property name) to `PSObject.Properties | Where-Object Name -eq …` enumeration.
- **`core-parking-off-ac` + `processor-perf-boost-aggressive` checks were broken on non-English Windows.** Both used `powercfg /query` regex matches on `current ac power setting index`, which is a localised UI string. On German Windows it reads "Aktueller Einstellungsindex für Netzbetrieb"; the regex never matched and Reclaim reported the tweak as "off" forever even after a successful apply. Both checks now resolve the active scheme GUID via `powercfg /getactivescheme` (locale-independent — GUIDs are just hex) and then read the `ACSettingIndex` DWORD directly from `HKLM\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes\<active>\<subgroup>\<setting>`.
- **`ntfs-8dot3-off` check was broken on non-English Windows.** Parsed `fsutil behavior query disable8dot3`'s output via a `disable8dot3\s+=\s+1` regex; that text is localised. Now reads `NtfsDisable8dot3NameCreation` directly from the FileSystem registry key.
- **`hid-power-management-off` was slow.** Used `Get-ChildItem -Recurse` over `HKLM\SYSTEM\CurrentControlSet\Enum\HID`, which iterates the entire subtree (LogConf, Properties, child class GUIDs, every device's every channel — thousands of subkeys on a typical desktop). Replaced with an explicit two-level iteration that targets only `<HID-bus-id>\<instance>\Device Parameters`, dropping the scan from multi-second to under 500 ms.
- **NIC tuning adapter list was too restrictive.** v1.1's first cut used `Get-NetAdapter -Physical` which excludes USB NICs and some Killer / Realtek / Intel drivers that report `HardwareInterface=$false` even on a physical card. Dropped the `-Physical` filter; the list now shows every adapter the Network Connections panel does. Virtual NICs (Hyper-V vEthernet, WSL, VPN) are kept in the list — their advanced-property listing is naturally empty and there's nothing to break.
- **`Set-NetAdapterAdvancedProperty` type-mismatch on numeric registry values.** The Rust bridge sends every value as a JSON string, then PowerShell forwards it to `Set-NetAdapterAdvancedProperty -RegistryValue '<string>'`. DWORD-typed properties (most of the numeric ones — InterruptModeration, FlowControl, EEE, …) reject the quoted argument because they expect an integer. The script now `[int64]::TryParse`s the value and passes it unquoted on success; the `catch` block falls back to the quoted form for `REG_SZ`-typed properties.
- **MSI mode toggle silently no-op'd on most devices.** `HKLM\SYSTEM\CurrentControlSet\Enum\…\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties` is SYSTEM-owned with Administrators read-only ACL. The original v1.1 script used `New-ItemProperty … -Force | Out-Null` without `-ErrorAction Stop`, so PowerShell's default non-terminating-error behaviour swallowed `ACCESS_DENIED` and Rust saw success. Fix: surface errors with `-ErrorAction Stop` and add a SYSTEM-context fallback. When the direct write fails, Reclaim creates a one-shot scheduled task with `/ru SYSTEM /rl HIGHEST`, runs `reg.exe add` (or `reg.exe delete` for the disable path), polls until the task finishes (max 4 s), deletes the task, then reads the value back to verify the write actually landed.
- **MSI device listing used a brittle `PCI\` prefix check.** `Get-PnpDevice` returns devices in mixed-prefix namespaces (`PCI\`, `USB\`, `HDAUDIO\`, `ACPI\`, `HID\`, vendor-specific like `LGHUBDEVICE\`). MSI mode is a PCI-Express feature so the prefix filter is correct in principle, but combined with the `-AsArray` JSON bug above meant the list was reliably empty. With both fixes in place the list now shows 30+ PCI devices on a typical desktop (GPU + chipset bridges + audio + NVMe + Net + USB controllers).
- **Latency monitor parallel-ping pipeline was fragile.** v1.1's first cut used `Ping.SendPingAsync` + `Task.WaitAll` with a `Task.FromResult($null)` placeholder for the catch arm to keep index alignment. The mixed `Task<PingReply>` / `Task<object>` types triggered subtle `IsCompletedSuccessfully` evaluation issues. Replaced with sequential `Ping.Send(host, 1500)`. Sequential is plenty fast — 8 healthy targets finish in under 300 ms total — and the code path is identical across PowerShell 5.1, 7.x, and Server-Core SKUs.

### Internal

- **`src-tauri/data/{tweaks,bloatware,apps}.json`** regenerated against the expanded catalog (`pnpm catalog:export`). 228 tweaks, 158 bloatware patterns, 107 apps, 5 profiles.
- **5 new Rust modules** in `src-tauri/src/`: `gaming_session.rs` (process + service whitelist + state snapshot), `anticheat.rs` (Secure Boot / TPM / VBS / HVCI / testsigning / kernel debug probe + bcdedit fixes), `nic.rs` (`Get-NetAdapter*` wrappers with strict input validation), `msi.rs` (PnP enumeration + MSISupported toggle with SYSTEM-task fallback), `latency.rs` (`System.Net.NetworkInformation.Ping` host validation + batch limit). Plus the existing `tweaks.rs` was extended with the AsArray-free JSON output pattern as a shared idiom.
- **19 new Tauri commands** registered in `lib.rs::invoke_handler!` and wrapped in `src/lib/tweaks/bridge.ts` (session snapshot/kill/start/stop/restore/whitelist, anti-cheat get-state/disable-test-mode/disable-kernel-debug, NIC list-adapters/list-properties/set-property/reset-property/restart, MSI list-devices/set-supported/set-message-limit, latency ping-hosts).
- **`LogAction` type** extended with `gaming-session.start` + `gaming-session.end`. `ACTION_LABELS` gets matching human-readable labels.
- **`README.md` + `CLAUDE.md` refreshed** with the new counts (228 / 5 / 7 / 42 / 34 / 156), new category row in the README tweak table (Memory: 6, Gaming: 35), v1.1 "Gaming toolbox" paragraph below the Profiles section, and an updated route inventory in CLAUDE.md.
- `svelte-check`: 0 errors / 0 warnings. `cargo check`: clean.

## v1.0.0

**First stable release.** Two new features (Recovery route, headless install-media CLI), a full QA pass on every tweak against a Hyper-V Win 11 25H2 VM, a complete validation of the install-media generator end-to-end, and an architectural simplification of the profile model.

Headline numbers:

- **200 tweaks** roundtripped on a real Win 11 25H2 VM via PowerShell Direct. **199/200 pass apply → check → revert → check** cleanly. The one remaining is `reserved-storage-off` and is **not a Reclaim bug**: Windows refuses `Set-WindowsReservedStorageState` (error `0x800f0975`) while servicing operations are in flight — Microsoft's own `Set-WindowsReservedStorageState` cmdlet fails with the same code in the same conditions. On a settled user system it works.
- **121/121 `recommended:true` bloatware patterns** purged via the generated `setupcomplete.cmd` on a freshly-installed Win 11 25H2 VM — both `Get-AppxPackage -AllUsers` and `Get-AppxProvisionedPackage -Online` show zero matches afterward. Pre-OOBE sponsored-apps blockers (WhatsApp, Spotify, Disney+, Netflix, TikTok, Instagram, Facebook, LinkedIn) **never install** in the first place — the HKLM CloudContent + 18 `HKU\.DEFAULT` ContentDeliveryManager policies emitted in `specialize` block the Store push before OOBE even hands the user the desktop.
- **Zero Reclaim bugs** across both the tweak roundtrip sweep and the install-media end-to-end. Test harness (`scripts/test-tweaks-in-vm.ps1`, `scripts/test-install-media.ps1`, `scripts/setup-test-vm.ps1`) is committed so future regressions are caught.

### Added

- **`/recovery` route** (admin-only, under "System info"). Two sections:
  - **Advanced restart targets.** Four buttons: *Advanced Startup menu* (`shutdown /r /o` → WinRE), *UEFI firmware setup* (`shutdown /r /fw`, requires UEFI not legacy BIOS), *Safe Mode (Minimal)* (`bcdedit /set {current} safeboot minimal` + restart), *Safe Mode with Networking* (same with `safeboot network`). Safe-Mode variants show a sticky-flag warning dialog with the `bcdedit /deletevalue {current} safeboot` undo command — the boot flag persists until removed.
  - **Windows System Restore points.** Lists real restore points via `Get-ComputerRestorePoint` (sequence number, description, type, creation time). One-click revert via `Restore-Computer -RestorePoint <N>` + scheduled reboot. "Create" button enables System Protection on `C:`, sets `SystemRestorePointCreationFrequency=0` to bypass Windows' undocumented 24h throttle, runs `Checkpoint-Computer`, and verifies the new point actually exists by comparing max-sequence-number before/after. The old `create_restore_point` was silently no-op'ing within 24h windows because of that throttle — now fixed.
- **`reclaim.exe --gen-install-media <config.json> --out-dir <dir>`** — headless install-media generator. Pairs with `scripts/gen-unattend-config.mjs` which builds the JSON from `--profile <id>`, `--locale <de-de|en-us|…>`, `--fully-automated`, `--username`, `--password`, `--target-disk`. Reads the same exported catalog JSONs the rest of the CLI uses. Closes the "gold-image CI pipeline" gap — you can now produce `autounattend.xml` + `setupcomplete.cmd` from a build server without ever opening the GUI.
- **CLI shell-check support.** `cli.rs::check_tweak_state` and `executor.ts::getTweakState` previously honored only `kind: "reg"` checks. Both now accept `kind: "shell"` — the script exits 0 for "on", non-zero for "off". Mixed reg+shell checks compose with AND semantics. Critical for tweaks whose state isn't reg-observable (DISM-managed features, fsutil flags, netsh state, MMAgent settings, scheduled task state).
- **Test harness scripts** (`scripts/setup-test-vm.ps1`, `scripts/test-tweaks-in-vm.ps1`, `scripts/test-install-media.ps1`, `scripts/gen-unattend-config.mjs`). Build a fresh Win 11 Hyper-V VM with PSDirect enabled, roundtrip every tweak in the catalog, generate + validate the install-media pipeline end-to-end. Output goes to `test-output/` which is `.gitignore`-d.
- **MobaXterm** added to the apps catalog (`Mobatek.MobaXterm`, group `dev`, recommended).

### Changed

- **Bloatware is decoupled from profiles.** Profiles now store **tweaks only**; the debloat step in every ISO build is uniformly the `recommended:true` subset of the bloatware catalog. ProfileBuilder lost the entire "Bloatware" section (the giant grouped multi-select). `Profile.bloatwarePatterns` field stays on the type for backwards-compatibility with old `.reclaim` exports (silently dropped on import) but is no longer serialized. Net effect: simpler mental model ("profile = which Windows settings to flip"), one debloat list to curate, zero double-maintenance of "is this in the bloatware list AND in the privacy-max profile's override list?".
- **`Microsoft.Todos` flipped to `recommended:true`.** Was an oversight — it's exactly the kind of pre-installed productivity app the privacy-max profile is supposed to remove. The IM E2E test specifically confirms it's now killed.
- **`debloat-appx` step default in Advanced mode** pre-fills with the `recommended:true` set instead of the empty list. Users uncheck what they want to keep — opt-out matches the "no bloatware by default" UX.
- **24 catalog tweaks got proper `check[]` entries.** Previously the sweep found 23 tweaks reporting `state=unknown` because their apply was shell-based and the CLI/GUI executor only knew reg-based checks. Pattern by pattern:
  - **Service tweaks** (8): explicit reg check on `HKLM\SYSTEM\CurrentControlSet\Services\<name>\Start == 4` for `diagtrack-service-off`, `search-indexing-off`, `maps-broker-off`, `retail-demo-off`, `xbox-services-off` (3 services), `wmp-network-sharing-off` (shell-fallback for "service-absent" case), `dmwap-push-off`, `sysmain-off`. Reg reads are deterministic and ~10× faster than running `Get-Service`.
  - **Scheduled-task tweaks** (3): shell check via `Get-ScheduledTask` for `compat-telemetry-task-off`, `program-data-updater-off`, `ssd-scheduled-defrag-off`, plus the multi-task `diagtrack-tasks-off`. All tolerant of Win 11 25H2 task removals — a missing task counts as "goal already achieved".
  - **DISM / fsutil / netsh / powercfg / bcdedit / Defender** (6): switched from parsing localized stdout to structured PS cmdlets that return enums independent of UI locale (`Get-WindowsReservedStorageState`, `Get-NetTeredoConfiguration`, `Get-MpPreference`, `Get-WindowsOptionalFeature` / `Get-SmbServerConfiguration`, locale-stable string match on `powercfg /getactivescheme` GUID). Fixed `reserved-storage-off` and `ipv6-teredo-off` not registering as applied on German Windows (DISM/netsh return localized strings).
  - **MMAgent tweaks** (3): `memory-compression-off` and `page-combining-on` now wrap the `Disable-MMAgent` / `Enable-MMAgent` call in a `try/finally` that temporarily starts the SysMain service if it was disabled. Reason: the `PS_MMAgent` WMI provider runs inside SysMain, so the cmdlet fails with `Windows System Error 1058` when SysMain is off — a real user hit this exact bug. Service state is restored to its prior value when the cmdlet finishes (or crashes).
  - **Misc** (4): `hide-gallery` + `hide-home` got explicit `revert` (delete the CLSID key) + reg `check`. `game-mode-on` lost its `defaultValue: 1` (apply and revert were writing the same value — revert was a no-op). `hibernation-off` apply + revert swallow `powercfg`'s exit code so Hyper-V VMs (which don't support hibernation at the firmware level) don't report crash.
- **`hide-widgets` migrated from HKCU to HKLM Dsh policy.** Win 11 25H2 locked the legacy `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced!TaskbarDa` value — `reg.exe` and `Set-ItemProperty` both return `Access Denied` against the user's own hive (verified independently of Reclaim). The modern path is `HKLM\SOFTWARE\Policies\Microsoft\Dsh!AllowNewsAndInterests = 0`, which actually works. Side effect: this tweak now requires admin where it used to be user-local. The HKCU path was a broken no-op on 25H2 — at least now it does something.
- **Terminal panel stays mounted while hidden.** Previously `{#if tasks.tasks.length > 0 && tasks.panelOpen}` ripped the whole wrapper out of the DOM on close, destroying xterm's rendered viewport even though the `Terminal` object survived in `tasks.svelte.ts`. Reopening showed an empty terminal. Now the wrapper stays mounted whenever tasks exist; visibility toggles via `style:display` so the DOM (and xterm's rows) persist.
- **`build_xml` and `build_setupcomplete_script`** are `pub(crate)` so `cli.rs::cmd_gen_install_media` can call them directly from sync context, no async-runtime gymnastics.

### Removed

- **`/context-menu` Shell Extension manager** (route + Rust module + bridge wrappers + log action + cache resource). Used by no built-in profile, no documentation, no tweak depended on it; the parallel registry tweak `classic-context-menu` (which switches Win 11 back to the Win 10-style context menu, totally different feature) is unaffected and stays.

### Fixed

- **`create_restore_point` silently no-op'd within 24h** of the last restore point because Windows' `SystemRestorePointCreationFrequency` defaults to 1440 minutes. Now disables the throttle via `HKLM\Software\Microsoft\Windows NT\CurrentVersion\SystemRestore!SystemRestorePointCreationFrequency = 0` before each call **and** verifies a new point actually exists afterward by comparing max-sequence-number before/after. If `Checkpoint-Computer` returned success but no new sequence number appeared, the command surfaces a real error instead of lying.
- **`hide-widgets`** (see *`hide-widgets` migrated…* above) — was a silent no-op on Win 11 25H2.
- **`game-mode-on` revert** was a no-op (apply value == defaultValue, so revert wrote the apply value again).
- **`hide-gallery` + `hide-home`** had no `revert` and no `check`, violating CLAUDE.md's shell-tweak contract.
- **`memory-compression-off` / `page-combining-on`** crashed with `Error 1058` after `sysmain-off` was applied.
- **`hibernation-off` revert** crashed on Hyper-V Gen 2 VMs (and other firmware that doesn't expose hibernation) because `powercfg -h on` returns non-zero.
- **`reserved-storage-off` / `ipv6-teredo-off` checks** read localized DISM/netsh stdout — never matched on German Windows.
- **`compat-telemetry-task-off` / `program-data-updater-off`** crashed on Win 11 25H2 because the scheduled tasks were removed from the OS — now tolerated via `try/catch + exit 0` (a missing task IS the goal).

### Internal

- **`src-tauri/data/{tweaks,bloatware,apps}.json`** regenerated against the updated catalog (`pnpm catalog:export`).
- **`test-output/`** added to `.gitignore`. Test harness outputs (sweep JSON/MD reports, install-media artifacts) are local-only.
- `svelte-check`: 0 errors / 0 warnings. `cargo check`: clean. `cargo build --release`: clean.

## v0.20.1

Design-system polish + Task-Sequence editor tightening. No new features, no new tweaks, no new routes — just internal consolidation and a handful of user-visible UX fixes on top of v0.20.0.

### Changed

- **Design system primitives expanded** (Phase 10–11 of the internal design-system migration). Four new shared primitives added to `src/lib/ui/`:
  - `FormField` — `<label class="flex flex-col gap-1.5">` + `<span class="text-xs font-medium text-muted-foreground">` pattern that was hand-rolled in ~20 places.
  - `TextInput` — the canonical `h-9 rounded-md border bg-card …` input with `mono` / `readonly` / `disabled` / `bind:value` props. Now extended with a `tone: "primary" | "muted"` variant.
  - `TextLink` — replaces ~15 hand-rolled `<button class="text-primary hover:underline">` action buttons (select-all / clear / inline-actions). `tone="muted"` covers the Clear-button variant.
  - `FilterChip` — the `h-8 px-3 rounded-md` toggle-pill pattern from `/logs` + `/windows-update` filter rows, now a single primitive.
- **`StatusHero`** primitive added in Phase 9 — wraps the Activation + OneDrive hero-card pattern (`HeroBanner` + `StatusAvatar` + title + badges + description + dl details) into a single composable that auto-maps `tone` → avatar tone.
- **InstallMedia Advanced Mode template picker** restyled to match Simple-mode profile picker. Previously the right column held only a single tiny `{N}/{M} steps active` badge in a `grid-cols-[1fr_1fr]` — 50% of the card was whitespace. Now shows a proper info-tile (Sparkles icon + template name + description + 3 summary badges: active/total steps + reg tweaks + AppX removals).
- **Task Sequence editor — singleton enforcement.** Adding a step in Advanced mode now respects per-type cardinality. Every step type except `custom-cmd` is a singleton (one `meta` step has all locale + account fields; one `debloat-appx` step has all AppX patterns; etc.) — the "Add step" picker disables a type if one already exists and shows an "Already added" badge. `custom-cmd` remains multi-addable (different hooks, different commands).
- **Task Sequence editor — canonical insertion order.** New steps are inserted into the sequence at their canonical phase-position (`meta` → `bypass` → `edition` → `oobe-skip` → `privacy` → `disk-setup` → `driver-inject` → `debloat-appx` → `reg-tweaks` → `apps-install` → `custom-cmd`) instead of being appended. Drag-and-drop still works for users who want a custom order — mostly relevant for multiple `custom-cmd` steps at the same hook, where sequence order determines execution order.
- **Template descriptions shortened** in Advanced Mode's template picker. The previous descriptions were 1–3 sentences with examples and warnings; the new ones are single concise sentences (e.g. Privacy Maximum: "Strips telemetry, removes 60+ AppX, blocks sponsored apps." Fully Automated: "Wipes Disk 0, auto-creates admin, full Privacy-Maximum debloat. Destroys all data on Disk 0.").
- **Eleven step-component rewrites** in `src/lib/tasksequence/steps/`. `MetaStep`, `EditionStep`, `CustomCmdStep` rebuilt around `FormField` + `TextInput` (eleven hand-rolled `labelClass` / `labelTextClass` / `fieldClass` consts removed). `DebloatAppxStep`, `RegTweaksStep`, `AppsInstallStep` got their plain `<button class="text-primary hover:underline">` action buttons swapped for `<TextLink>`. `DriverInjectStep` swapped its raw `<input>` for `<TextInput readonly mono>`. `MetaStep` had a leftover empty `<div></div>` grid-cell placeholder removed.
- **Internal-only:** ~420 migration sites across ~40 files now route through the design-system primitives instead of inline Tailwind. `pnpm check`: 0 errors, 0 warnings.

### Fixed

- **`MetaStep` orphaned grid cell.** The locale-preset Select was in a `grid-cols-2` row with an explicit empty `<div></div>` as the right cell — leftover from an earlier two-up layout. Locale-preset now sits at full width above the username/password/computer-name/organization 2-column grid.
- **Hosts.svelte row action `pt-1`** corrected to `pt-0.5` to match the rest of the row-action sites.
- **Scheduled Tasks rows** migrated to the shared `<ListRow>` + amber-tint background instead of hand-rolled flex.
- **Drivers WU driver-class divider** uses `<SectionHeading level="h3">` instead of a hand-rolled `text-[10px] font-semibold uppercase` block.

## v0.20.0

Install Media gets a real **Task Sequence editor** with Simple + Advanced modes, custom commands at any Setup hook, winget app installation, driver-folder injection, fully-automated zero-click install, and a USB-drive serial number that's actually identifying instead of `000000000005||`.

### Added

- **Install Media → Task Sequence editor (`/install-media`, replaces `/iso-builder`).** Two modes selectable from the page header:
  - **Simple mode (default).** Profile dropdown (built-in `PROFILES` + your `customProfiles` from `/profiles`) + 4 inputs (locale, username, password) + one **Fully automated** toggle. Build/Flash one-click. Everything else is sane defaults (all bypasses, all OOBE skips, all privacy on, Win 11 Pro). One screen, zero learning curve.
  - **Advanced mode.** Full Task Sequence editor: 11 step types arranged in a drag-and-droppable list, each with an enable/disable switch and a delete button. Add-step modal with all 11 types. Each step expands to its own typed config UI. Six built-in templates (Privacy Maximum, Gaming Rig, Office Workstation, Bare Minimum, Blank Slate, **Fully Automated (zero clicks)**) populate the step list.
- **Eleven step types** mapped to the right Setup hook automatically. The user reasons in terms of "install drivers" / "remove bloatware", the converter routes each step to `windowsPE` / `specialize` / `oobeSystem` / `setupcomplete` / `firstlogon` as appropriate:
  - `meta` — locale + username + password + computer name + organization + autologon. Bound to the standard `Microsoft-Windows-Setup` / `Microsoft-Windows-Shell-Setup` / `Microsoft-Windows-International-Core` components.
  - `bypass` — TPM / Secure Boot / RAM / Storage / CPU / Network requirement skips, emitted as `LabConfig` reg writes in the windowsPE pass.
  - `edition` — Win 11 SKU picker with KMS client setup keys + custom-key override.
  - `oobe-skip` — Hide EULA / online-account-screens / privacy prompts in the OOBE pass.
  - `privacy` — 8 OOBE privacy defaults (telemetry, ad-ID, location, tailored experiences, Find My Device, inking/typing, diagnostic data, Cortana).
  - `disk-setup` — Auto-wipe + GPT-partition a specific disk number. Off by default + explicit confirmation checkbox; this is what flips the install from "Setup asks for disk" to "zero clicks".
  - `driver-inject` — Folder picker. Contents are copied into `\$OEM$\$1\Drivers\` on the boot medium during ISO build / USB flash; Windows Setup auto-installs every `.inf` it finds.
  - `debloat-appx` — Grouped multi-select against the bloatware catalog (consumer / office / gaming / communication / media / system / oem / other). Patterns end up in `setupcomplete.cmd` for two-pass AppX removal as SYSTEM after OOBE.
  - `reg-tweaks` — Grouped multi-select against the tweak catalog, filtered to entries with at least one RegOp (shell-only tweaks can't be applied via unattend).
  - `apps-install` — Winget IDs from the apps catalog. Get `winget install --exact --id --silent` appended to `setupcomplete.cmd` after AppX removal.
  - `custom-cmd` — Free-form shell command attached to any of the 5 Setup hooks via a dropdown. Description shown in setup logs.
- **Fully-automated mode.** Zero-click install: Simple-mode toggle (or the "Fully Automated" template in Advanced) emits a `<DiskConfiguration>` block that wipes a specific disk number, defaults the password to `Reclaim!` if you didn't set one, enables AutoLogon, and pre-selects everything for OOBE. Plug in stick, boot, walk away, return to a logged-in desktop with full debloat applied. The DiskConfiguration is only emitted when the disk-setup step is enabled AND its confirmation checkbox is ticked — `<DiskConfiguration>` does NOT come back by default, you have to explicitly opt in (we burned three patch versions on this exact mistake in v0.18.x).
- **USB drive serial numbers are now meaningful.** Reads `Get-Disk .UniqueId` instead of just `.SerialNumber` and pulls the 24-char hardware-derived hex ID out of the `USBSTOR\DISK&VEN_…&PROD_…\<HARDWAREID>&0` PNP-style path. For well-behaved firmware that's identical to the sticker serial; for garbage firmware (Kingston DataTraveler etc. that reports literal `0000000005` + uninitialized control bytes) Windows synthesizes a stable hash from VID/PID/etc. and we surface that. Falls back to a sanitized raw `SerialNumber` if `UniqueId` parsing fails. 10 unit tests covering the cleanup heuristics + the PNP-ID extractor.
- **New Tauri command `generate_setupcomplete_cmd`** alongside the existing `generate_autounattend_xml` — the Task Sequence build/flow needs both files emitted from a single config.
- **`UnattendConfig` gained three new extension fields**: `custom_commands: Vec<CustomCommand>` (hook + command + description), `winget_apps: Vec<String>`, `disk_auto_setup: Option<DiskAutoSetup>` (disk number). All `#[serde(default)]` so the existing CLI / GUI call sites keep working without changes.

### Changed

- **Default `selectedEditionKey`** was the old retail-generic `VK7JG-NPHTM-…` key from before v0.18.2's KMS-list rewrite — not present in the new editions list, so the picker silently showed "Pick an edition" on first paint. Default is now `W269N-WFGWX-…` (Windows 11 Pro KMS client setup key). Resolves on first paint without user touching it.
- **Sidebar route entry renamed** from "/iso-builder" to "/install-media". The label "Install media" stays the same. The old route is fully removed — anyone bookmarking it (in-app) gets a NotFound; the old `IsoBuilder.svelte` file is deleted.
- **All step / template / UI text English-only** (project convention) — initial Task Sequence build had German strings sprinkled in from the conversation; cleaned up.

### Fixed

- **Step-component dropdowns now use the project's bits-ui `Select` primitive** instead of native HTML `<select>`. First v0.20-pre iteration used `<select>` which broke the Mica/dark-theme look completely; this matches IsoBuilder's pre-v0.18 styling and the rest of the app. Goes for the locale picker, edition picker, hook picker, template picker.
- **StepCard padding** — was inheriting `Card`'s default `gap-6 py-6` which made every step row enormously tall. Now uses the `overflow-hidden gap-0 py-0 card-inset` row-list pattern from `CLAUDE.md` with tight `px-5 py-3` headers.

### Notes

- The Advanced mode's drag-and-drop uses native HTML5 DnD (no extra library). Per-row drag handle + drop indicator on the StepCard.
- localStorage persistence for both stores: `reclaim.task-sequence` (advanced) and `reclaim.install-media-simple` (simple-mode state + mode flag). Switching modes preserves both — your Simple-mode profile/password/locale are still set when you switch back from Advanced.
- The setupcomplete.cmd output from v0.20 also runs winget installs and custom-setupcomplete-hook commands in addition to the two-pass AppX sweep from v0.19. Single log file: `C:\Windows\Setup\Scripts\setupcomplete.log`.

## v0.19.0

**Aggressive bloatware killer for Install-Media.** v0.18.3 finally got the schema right and the install completed, but real-world testing showed: ~85 of 96 AppX patterns missed (renamed packages on Win11 25H2), Microsoft Teams survived (`MicrosoftTeams` is gone, the new package is `MSTeams_8wekyb3d8bbwe` and the pattern wasn't marked `recommended: true`), WhatsApp wasn't even in the pattern list, and Sponsored Apps (Spotify / Disney+ / TikTok / Netflix / Instagram / LinkedIn) get pushed by Microsoft Store automatically after the first network-connect — by the time setupcomplete.cmd runs, the download has already started.

### Added

- **Pre-OOBE sponsored-apps killer.** New batch of HKLM + HKU\\.DEFAULT writes injected into the specialize-pass `Microsoft-Windows-Deployment/RunSynchronous` block whenever the profile carries any AppX patterns. Specialize runs BEFORE the OOBE network-connect — this is the only window where we can stop Microsoft Store from fetching the consumer-apps manifest at all. Writes:
  - HKLM\\…\\CloudContent: `DisableWindowsConsumerFeatures`, `DisableCloudOptimizedContent`, `DisableConsumerAccountStateContent`, `DisableSoftLanding`, `DisableThirdPartySuggestions` all = 1
  - HKLM\\…\\WindowsStore\\AutoDownload = 2 (blocks Store auto-download)
  - HKU\\.DEFAULT\\…\\ContentDeliveryManager: 18 SubscribedContent / ContentDelivery / PreInstalled / Suggestions / RotatingLockScreen / SoftLanding switches all = 0. Default-user-hive writes propagate as the template for every account created later, so the admin's first profile already has these off from creation.
- **Two-pass removal in setupcomplete.cmd.** Pass 1 runs the AppX-removal sweep, then `ping 127.0.0.1 -n 61` sleeps 60s for any in-flight Store installs to finish, then Pass 2 mops up. Each pass now hits both `Get-AppxProvisionedPackage` (kills image baseline for any future user account) AND `Get-AppxPackage -AllUsers` (kills the freshly-created admin's already-installed copies). Logs to `setupcomplete.log` per pass for audit.
- **+8 sponsored-app patterns** explicitly added, both wildcard and publisher-prefixed forms:
  - WhatsApp Desktop (`*WhatsApp*`, `5319275A.WhatsAppDesktop`)
  - Instagram (`Facebook.InstagramBeta`)
  - Facebook (`Facebook.Facebook`)
  - LinkedIn (`7EE7776C.LinkedInforWindows`)
  - TikTok (`BytedancePte.Ltd.TikTok`)
  - Spotify publisher form (`SpotifyAB.SpotifyMusic` — wildcard already existed)
  - Disney+ publisher form (`Disney.37853FC22B2CE`)
  - Netflix publisher form (`4DF9E0F8.Netflix`)
- **Copilot pattern audit.** Added catch-all `*Copilot*` wildcard and `MicrosoftWindows.Client.AIX` (the 25H2 Copilot+ AI Experience component).

### Fixed

- **`MSTeams` pattern is now `recommended: true`.** Was in `bloatware.ts` since v0.13.0 but not marked recommended, so Privacy Maximum silently excluded it. Result: Teams survived every install attempt. Now both `MicrosoftTeams` (legacy consumer) AND `MSTeams` (current new Teams) ship in Privacy Maximum's debloat list.

### Notes

- Verified via real-install log (`C:\\Windows\\Setup\\Scripts\\setupcomplete.log`): of v0.18.3's ~96 patterns, 13 actually matched and got removed (BingNews/Weather/Search, GetHelp, OfficeHub, Solitaire, XboxGamingOverlay etc). The other ~83 missed for three reasons that v0.19.0 addresses: renamed packages (Teams, Copilot), missing patterns (WhatsApp), and sponsored apps that download AFTER setupcomplete runs.

## v0.18.3

**Actual root-cause fix for the "Der Computer wurde unerwartet neu gestartet" install crash that v0.18.1 and v0.18.2 chased without finding.** The unattend.xml was schema-invalid the whole time: `<RunSynchronous>` sat inside the `Microsoft-Windows-Shell-Setup` component during the `specialize` pass, but that element only belongs in `Microsoft-Windows-Setup` (windowsPE) or `Microsoft-Windows-Deployment` (specialize/auditUser/oobeSystem). Windows Setup parses the unattend.xml on the windeploy → setup.exe transition (the "Wir bereiten alles für Sie vor" loading screen), schema validation fails with `0x80220001 "The provided unattend file is not valid"`, setup.exe exits with `0x1F`, system reboots, next boot shows the unexpected-restart error. Reproduced 1:1 in the user's `setuperr.log`:

```
[setup.exe] SMI data results dump:
  Source = Name: Microsoft-Windows-Shell-Setup, ... /settings/RunSynchronous
  Description = Die Einstellung ist in dieser Komponente nicht definiert.
[0x060432] IBS  The provided unattend file is not valid; hrResult = 0x80220001
```

### Fixed

- **`<RunSynchronous>` moved out of the Shell-Setup component in the specialize pass into a dedicated `Microsoft-Windows-Deployment` component.** Shell-Setup keeps `<ComputerName>`, `<TimeZone>`, `<RegisteredOrganization>`, `<RegisteredOwner>` — all of which are valid for it. The privacy/OOBE reg writes that get emitted via RunSynchronous now sit in a separate Deployment component sibling in the same `<settings pass="specialize">` block.

### Notes

- The 50–54% crash point users reported is exactly where Setup invokes `setup.exe` from `windeploy.exe` to load the oobeSystem settings. That's the only place Setup re-parses the unattend.xml schema-strictly after install.
- AppX-removal architecture from v0.18.2 (`$OEM$\$$\Setup\Scripts\setupcomplete.cmd`) is unchanged — that worked correctly, the crash before it was reached came from the schema bug. FirstLogonCommands volume reduction (batching 80+ separate commands into one cmd script) is not yet in this release; will follow if real-world testing shows it's needed.

## v0.18.2

Second hotfix on the v0.18.x install-media line: v0.18.1 still crashed Setup mid-install with "Der Computer wurde unerwartet neu gestartet" on profiles with more than a handful of AppX patterns (Privacy Maximum hit it every time). Root cause: the workaround I shipped — base64-encoding the entire setupcomplete.cmd into a single `RunSynchronousCommand` `<Path>` in the specialize pass — produces a ~50 KB `cmd /c …` invocation. Windows Setup uses `CreateProcess` for those, which has an 8 KB command-line limit, so Setup blew up with `ERROR_FILENAME_EXCED_RANGE`, rebooted, and reported the unexpected-restart error on the next boot.

### Fixed

- **AppX-Removals now travel via `$OEM$\$$\Setup\Scripts\setupcomplete.cmd` as a separate file on the boot medium** instead of being embedded base64-inline in the unattend XML. The ISO builder writes the file into `\sources\$OEM$\$$\Setup\Scripts\` of the work dir before oscdimg repack; the USB flasher writes it to `\$OEM$\$$\Setup\Scripts\` of the FAT32 partition after the install image is in place. Windows Setup auto-copies `$OEM$\$$\` to `%WINDIR%\` during install and runs the resulting `C:\Windows\Setup\Scripts\setupcomplete.cmd` as SYSTEM after `oobeSystem`. No more 50 KB command lines. The autounattend.xml now emits `<UseConfigurationSet>true</UseConfigurationSet>` in the windowsPE Setup component to tell Setup to look for `$OEM$`.
- **Default `selectedEditionKey` was the old retail-generic key** (`VK7JG-NPHTM-…`) which doesn't match any entry in the v0.18.0-rewritten edition list, so the picker silently showed "Pick an edition" until the user touched it and `<ImageInstall>` got omitted from the XML. Default is now `W269N-WFGWX-…` (Windows 11 Pro KMS client setup key) which exists in the list, and the edition selector actually resolves on first paint.

### Internal

- New Tauri command `generate_setupcomplete_cmd(config: UnattendConfig) -> String` exposed via bridge `generateSetupCompleteCmd()`. Returns the script body; empty string when the config has no AppX patterns.
- `IsoBuildRequest` + `UsbFlashRequest` both gained an optional `setupcomplete_cmd` field; the corresponding PowerShell scripts copy the temp file into the right $OEM$ subtree.
- The base64 encoder I shipped in v0.18.1 (~30 LoC inline in `unattend.rs`) is gone — wasn't needed since the script no longer travels through the XML.

## v0.18.1

Hotfix on top of v0.18.0: the unattended Win11 install crashed at the end with "Der Computer wurde unerwartet neu gestartet" / "Windows konnte die Installation nicht abschließen" between the `specialize` and `oobeSystem` passes. Two root causes — both fixed — plus a unified design-system pass across every route and an OneDrive sidebar-icon trim.

### Fixed

- **AppX-Removals moved out of the `specialize` pass into a Windows-Setup `setupcomplete.cmd`.** `Remove-AppxProvisionedPackage -Online` in `specialize` corrupted Sysprep state when any pattern returned a non-zero exit — common with the Privacy Maximum profile's ~30 AppX patterns. We now write `C:\Windows\Setup\Scripts\setupcomplete.cmd` (base64-encoded into a single PowerShell `[IO.File]::WriteAllText` call in `specialize`) and let Windows Setup execute it as SYSTEM after `oobeSystem` completes — outside Sysprep's window, where the removals are safe. The script logs to `C:\Windows\Setup\Scripts\setupcomplete.log` for post-install audit.
- **Blank-password local account block is now skipped.** Win11 24H2+ LSA refuses to create local accounts with blank passwords; emitting `<Value></Value>` with `<PlainText>true</PlainText>` aborted the `oobeSystem` pass and triggered the same "unexpected restart" loop. When `password` is empty we drop the whole `<UserAccounts>` block — Setup falls back to its own account-creation screen, which works fine. UI banner in the Install-Media page warns about this whenever the password field is empty.
- **OneDrive sidebar icon** was minimally clipped on the left because of an over-scaled internal transform (`scale(1.12)`). Dropped to `scale(1.05)` — sits cleanly inside the viewBox now, still optically balanced against Lucide icons.

### Changed

- **Unified design system.** Every route now uses the new `PageHeader` component (consistent title + description + actions layout); content sections share the same `card-inset` rhythm. See `docs/DESIGN_SYSTEM.md` for the rules and the per-route audit. No functional changes, purely visual consistency.
- **Install Media password field copy** changed from "Password (empty = no password)" + placeholder "(leave empty for none)" to "Password (recommended)" + placeholder "Set a password". The old copy made blank-password sound like a deliberate option; on 24H2+ it isn't.

### Internal

- New `src/lib/ui/PageHeader.svelte` component (~25 LoC) — slot-based, takes title/description/actions snippets.
- `unattend.rs` gained a small inline base64 encoder (~30 LoC, std-only) so the existing `base64` crate dependency doesn't leak in here; the helper is local to the setupcomplete.cmd write.
- `ps_single_quote` helper removed (no longer used — the only call site moved to base64-encoded payload).

## v0.18.0

USB-stick flasher + Install-Media correctness pass + live Windows Update progress. The "Install media" page now writes bootable USB sticks end-to-end (no Rufus needed), the generated autounattend.xml actually completes the install on real hardware again (six install-breakers fixed), and `/windows-update` streams per-update download + install percent through an xterm instead of a generic spinner.

### Added

- **USB-stick flasher (`/install-media` → "Flash to USB stick")**. New section on the existing Install Media page. Lists USB-attached disks via `Get-Disk | Where-Object BusType -eq 'USB'`, filters out system + boot disks, double-confirm dialog with disk/model/serial/size, then writes the selected ISO using Microsoft's own single-FAT32 + DISM-split layout:
  - Single FAT32 partition (capped at 32 GiB because the built-in `Format-Volume` won't do FAT32 larger than that; the remainder is left unallocated and is plenty for a Win11 ISO which uses <10 GiB after splitting).
  - `install.wim > 4 GiB` triggers `dism /Split-Image /SWMFile install.swm /FileSize:3800` so the install image fits FAT32's 4 GiB file-size limit. `install.esd` and pre-split `install*.swm` are copied as-is.
  - Optional autounattend.xml injection at both the root + `\sources\` (toggle on the same page).
  - All work streams through the existing PTY/xterm + Tasks infrastructure, so resize/cancel/scrollback work the same way as ISO build does.
  - **Why not the Rufus dual-partition layout?** A FAT32 boot partition + NTFS install partition only works with a custom UEFI:NTFS bootloader (Rufus' own, not redistributable). The single-FAT32 + DISM-split approach is what `MediaCreationTool` itself uses for >4 GB WIMs — no third-party components needed.
- **New Rust commands**: `list_usb_drives`, `usb_flash_iso` (PTY-streamed). New TS bridge wrappers `listUsbDrives` + `usbFlashIso`, new `runUsbFlashTask` in `tasks.svelte.ts`. New `iso.usb.flash` activity-log action.
- **Live Windows Update install progress (`/windows-update`)**. New streaming command `install_windows_updates_stream` emits one JSON event per phase tick (`queued`, `download_start`, `download_progress`, `download_done`, `install_start`, `install_progress`, `install_done`, `finished`); the UI renders per-update phase + percent in the existing table instead of the previous opaque spinner.

### Fixed

- **Install Media autounattend.xml** — six install-breakers found in an audit; the prior version booted but couldn't finish a real install on most hardware.
  - **No more forced `<DiskConfiguration>` + `DiskID=0` wipe.** The previous unattend hard-coded "wipe disk 0, install to partition 3"; on any system where the install target doesn't enumerate as disk 0 (NVMe + SATA mixes, USB-boot scenarios) this either wiped the wrong drive or aborted setup. The disk block is gone — Setup now asks once where to install, and edition is still pre-selected via `<InstallFrom>/<MetaData>/IMAGE/NAME`. One interactive click in an otherwise fully-unattended flow, traded for hardware-independence.
  - **`<Reseal><Mode>Audit</Mode>` removed.** This was being emitted in the `specialize` pass whenever all three OOBE-skip flags were on (the default!). Reseal is only valid in `auditUser`/`generalize`; in `specialize` it makes the XML schema-invalid and aborts unattended setup on 24H2/25H2.
  - **KMS keys list rewritten** against Microsoft's official Windows 11 KMS client setup keys. The prior list had Pro/Pro N/Home labels pointing at the wrong keys (e.g. the "Pro" entry was actually the Win10/11 retail-generic key, the "Pro N" entry was the real Pro key) — edition selection during install was unpredictable.
  - **`<SkipMachineOOBE>` + `<SkipUserOOBE>` removed.** Deprecated since Win10; on Win11 24H2/25H2 their presence can abort the `oobeSystem` pass with `0x80070002`. Replaced by the per-page `Hide*Screen` flags that were already emitted.
  - **`<HideLocalAccountScreen>` removed.** Not a real schema element; either silently ignored or rejected by stricter Setup builds. `HideOnlineAccountScreens` (the documented one) stays.
  - **AppX removals moved from `<FirstLogonCommands>` to `<RunSynchronous>` in the `specialize` pass.** FirstLogonCommands runs as the new user with a UAC-filtered medium-IL token — `Remove-AppxProvisionedPackage -Online` requires elevation and was silently failing (every removal swallowed by `-ErrorAction SilentlyContinue`). The `specialize` pass runs as SYSTEM, so removals now actually succeed. The `Get-AppxPackage -AllUsers` half is dropped because no users exist yet at specialize time and provisioned-package removal is sufficient for fresh-install debloat.
- **`disable_diagnostic_data` wrote to a non-existent policy path** (`MaxTelemetryAllowed` under `Policies\DataCollection`) — silent no-op. Now reuses the documented `AllowTelemetry` path at value 1 (Basic) when telemetry isn't already fully off.
- **USB flasher Initialize-Disk failure after Clear-Disk**. `Clear-Disk -RemoveData -RemoveOEM` wipes partitions but keeps the disk's `PartitionStyle` attribute; the next `Initialize-Disk … GPT` then failed with "disk has already been initialized". Script now re-queries `PartitionStyle` and only initialises if `RAW`, converts via `Set-Disk` if `MBR`, no-ops if already `GPT`.
- **Install Media: sticky bottom action bar replaced with header-action pattern** to match the rest of the app (see `ProfileBuilder.svelte`). The sticky bar was visually weird now that the page has three equal outputs (Save XML / Build ISO / Flash USB) — the bar was privileging just one of them.

### Internal

- New module `src-tauri/src/usb_flash.rs` (~330 LoC). Hardened input validation in Rust + a redundant disk-bus / system-disk check inside the PowerShell script itself (defence in depth).
- `unattend.rs` simplified: dropped `COMPONENT_DEPLOY` constant, dropped the AppX duplication in `build_first_logon_commands`, added a shared `run_sync_cmd` helper for emitting `<RunSynchronousCommand>` entries.
- `bridge.ts`: new `UsbDrive` type + `listUsbDrives`/`usbFlashIso` wrappers; `iso.usb.flash` added to `LogAction` enum.

## v0.17.0

Catalog depth + the last "we don't have that vs. WinUtil" gap closed: mass driver updates via the Windows Update Driver Catalog. Tweak catalog 180 → 200, apps catalog 67 → 106, every single icon slug verified against its source repo (and direct URLs HTTP-probed) before shipping.

### Added

- **+20 tweaks** to reach 200 entries:
  - **Privacy +4**: Disable Nearby Sharing (CDP authz policies), Block Office cloud content downloads (`UseOnlineContent=0`), Disable Windows Spotlight on lock screen (`DisableWindowsSpotlightOnLockScreen=1`), Block Microsoft Store auto-updates (`AutoDownload=2`).
  - **Explorer +4**: Disable balloon tips (`EnableBalloonTips=0`), Enable file checkboxes (`AutoCheckSelect=1`), Disable Search app background tracking (`BackgroundAppGlobalToggle=0`), Don't auto-restart apps after sign-in (`RestartApps=0` — Win11 specific).
  - **Performance +5**: Disable MapsBroker / RetailDemo / WMPNetworkSvc / dmwappushservice services, Disable Xbox Live services (XblAuthManager / XblGameSave / XboxNetApiSvc — XboxGipSvc explicitly left alone so controllers keep working).
  - **Notifications +2**: Hide "Apps slowing startup" toast (`StartupNotify=0`), Disable low disk space warnings (`NoLowDiskSpaceChecks=1`).
  - **Security +4**: Disable SMB1 protocol (server-config + optional feature, idempotent on 24H2), Disable Remote Assistance (`fAllowToGetHelp=0`), Disable Remote Desktop (`fDenyTSConnections=1`), Disable NetBIOS over TCP/IP (`NetbiosOptions=2` on every adapter, defeats Responder / Inveigh-style LAN credential spoofing).
  - **Memory +1**: Keep kernel resident in RAM (`DisablePagingExecutive=1`, system restart, RAM-rich systems only).
- **+39 winget apps** (67 → 106) across all 8 groups:
  - **Browsers**: Floorp, Opera, Opera GX, Ungoogled Chromium.
  - **Communication**: WhatsApp Desktop, Microsoft Teams (Free), Skype, Session.
  - **Dev**: IntelliJ IDEA Community, Android Studio, Cursor, Zed, Bun, Deno, Insomnia, GitKraken.
  - **System**: BleachBit, Autoruns (Sysinternals), System Informer, Snipaste, EarTrumpet.
  - **Media**: foobar2000, MusicBee, MPC-HC, Krita, Paint.NET, Lightshot.
  - **Office**: Calibre, Sumatra PDF, Adobe Acrobat Reader, draw.io.
  - **Gaming**: Playnite, Battle.net, Ubisoft Connect, RetroArch.
  - **Utilities**: Malwarebytes, Cryptomator, VeraCrypt, Wireshark.
  - **Excluded** from initial v0.17.0 candidate list because no proper icon exists in any source (homarr-labs/dashboard-icons, simple-icons, selfh.st/icons, app repo, winget manifest): lazygit, ExplorerPatcher, TreeSize Free. Will reconsider if upstream brand icons appear.
- **Mass driver updates panel (`/drivers`)** — new section under the existing rollback view. Scans Microsoft's Windows Update Driver Catalog (`searchWindowsUpdates(driverOnly: true)`), classifies results into Audio / Chipset / Display / Network / Storage / Input / Camera / Print / Other by inspecting the update title + categories, surfaces them grouped by class. Bulk-install via `installWindowsUpdates(ids)`. Admin-gated like the rollback section. Closes the "no non-GPU driver story" gap vs. WinUtil / Snappy-Driver-Installer; reuses existing WU + admin infra instead of inventing a new module.
- **Built-in profile updates.**
  - **Privacy Maximum** +4 tweaks: `nearby-share-off`, `office-content-download-off`, `spotlight-lockscreen-off`, `restart-apps-on-signin-off`. Description updated.
  - **Performance** +4 tweaks: `maps-broker-off`, `retail-demo-off`, `wmp-network-sharing-off`, `dmwap-push-off`.
  - **Reclaim Basics** auto-picks up new `recommended: true` tweaks: `balloon-tips-off`, `restart-apps-on-signin-off`, `maps-broker-off`, `retail-demo-off`, `wmp-network-sharing-off`, `smb1-off`, `remote-assistance-off`, `remote-desktop-off`.

### Quality

- **Every single app icon verified** before shipping. Process: pull the full slug lists from the three supported icon sources (homarr-labs/dashboard-icons 3152 svgs · simple-icons 3436 svgs · selfh.st/icons 6865 svgs), cross-reference each catalog entry; for direct `https://…` URLs, HTTP-probe to confirm the asset returns a non-empty 200. Initial v0.17.0 draft had 11 slugs that 404'd on the CDN (e.g. `simple:chromium` doesn't exist — that's `chromium` on homarr; `gitkraken` isn't on homarr but is `simple:gitkraken`); 4 favicons swapped for real brand icons (`simple:foobar2000`, `simple:ubisoft`, `simple:retroarch`); 5 weak favicons / GitHub-org avatars replaced with direct raw-GitHub URLs pointing at the actual app icon assets in each repo (BleachBit's `bleachbit.png`, EarTrumpet's `Square150x150Logo.scale-400.png`, System Informer's `Square44x44Logo.png`, Playnite's `playnite-logo-default.svg`, Sumatra PDF's `SumatraPDF_StoreLogo_150x150.png`). 3 apps cut from the list because no proper icon exists anywhere public (lazygit, ExplorerPatcher, TreeSize Free).

### Deferred

- **Choco support** for the apps catalog. Tracked for v0.18.0 — `installSources: ('winget'|'choco')[]` schema, Rust `choco_*` commands, source badge per app card, fallback chain when winget doesn't have an ID.

## v0.16.0

User-facing feature batch — two new tweak categories, one new sidebar group, dashboard surfaces them. Catalog grew from **167 → 180 tweaks** (+13). No infra rework, no schema changes; the auto-persist set keeps tracking the new tweaks the same way it did the old ones.

### Added

- **Memory & caching (`/memory`)** — new tweak category and route under **Customize**. 5 entries: Disable RAM compression (`Disable-MMAgent -MemoryCompression`, opt-in, warning on <8 GB systems), Disable SysMain / Superfetch (service stop + disable, recommended on SSDs), Disable Prefetch + Superfetch hints (HKLM `PrefetchParameters` 0/0), Enable RAM page combining (`Enable-MMAgent -PageCombining` — restore button), Clear pagefile on shutdown (security trade-off — slower shutdown). All admin.
- **Gaming (`/gaming`)** — new tweak category and route under **Customize**. 8 entries: Enable Game Mode (`HKCU\Software\Microsoft\GameBar`), Reserve all CPU for multimedia/games (`SystemResponsiveness=0`), Boost MMCSS Games task scheduling (4 values under `…\SystemProfile\Tasks\Games`), Strongly favor foreground app for CPU (`Win32PrioritySeparation=0x26`), Disable foreground-lock timeout (`ForegroundLockTimeout=0`), Disable network throttling (`NetworkThrottlingIndex=0xFFFFFFFF`), Low-latency TCP ACK + NoDelay on all interfaces (shell, enumerates `Tcpip\Parameters\Interfaces\*` and writes `TcpAckFrequency=1` + `TCPNoDelay=1`), Disable HPET (`bcdedit /set useplatformclock false` + `disabledynamictick yes` + `useplatformtick yes`, system restart). Five marked `recommended: true`, the latency / HPET / throttling ones are opt-in with explicit warnings.
- **Developer (`/developer`)** — brand-new sidebar group with one route. Shows the live state of five Windows optional features (WSL, VirtualMachinePlatform, HypervisorPlatform, Hyper-V, Windows Sandbox) via `Get-WindowsOptionalFeature -Online`, grouped into Linux on Windows / Virtualization / Sandbox sections. Enable / Disable goes through `Enable-WindowsOptionalFeature` / `Disable-WindowsOptionalFeature` via a streamed PTY (uses the same `run_pty_script` helper as Maintenance). Below the features: a read-only WSL distros list (parsed from `wsl --list --verbose`, handles WSL's UTF-16 stdout) and a Dev Drive support card (gates on build ≥ 22621). New Rust module `dev_features.rs` + 4 commands.
- **Built-in profile updates.**
  - **Gaming** profile gains `game-mode-on`, `system-responsiveness-gaming`, `mmcss-gaming-priority`, `cpu-priority-foreground-boost`, `foreground-lock-timeout-off`, `sysmain-off` (12 → 18 tweaks). Description updated.
  - **Performance** profile gains `sysmain-off`, `prefetch-off` (17 → 19 tweaks). Description updated.
  - **Privacy Maximum** and **Reclaim Basics** unchanged (Basics auto-picks up the new `recommended: true` tweaks: `sysmain-off`, `game-mode-on`, `system-responsiveness-gaming`, `mmcss-gaming-priority`, `cpu-priority-foreground-boost`, `foreground-lock-timeout-off`).
- **Dashboard surface** for the three new routes — Memory, Gaming and Developer get their own category cards with icons (MemoryStick / Gamepad2 / Code2) and counts.

### Internal

- `src-tauri/src/dev_features.rs` (~250 LOC) wraps DISM (`Get-WindowsOptionalFeature`, `Enable-WindowsOptionalFeature -NoRestart -All`, `Disable-WindowsOptionalFeature -NoRestart`), `wsl --list --verbose` and the build-number Dev Drive check. Static feature allow-list (5 entries) — `set_optional_feature_stream` rejects anything not in it, plus a paranoid `[A-Za-z0-9_-]` re-check before string interpolation. Streaming goes through `maintenance::run_pty_script`, so output lands in the global terminal panel like every other long op.
- 4 new Tauri commands (`list_optional_features`, `set_optional_feature_stream`, `list_wsl_distros`, `dev_drive_info`). Total now 112 across 25 modules.
- 1 new bridge helper (`runDevFeatureTask`) in `tasks.svelte.ts` — mirrors `runMaintenanceTask` / `runUnblockTask` / `runIsoBuildTask`.
- New routes: `Memory.svelte`, `Gaming.svelte`, `Developer.svelte`. Memory + Gaming are thin `<TweakSection>` wrappers; Developer is a custom page with status cards + enable/disable PTY-streaming buttons.

### Notes for v1.0.0

i18n (DE + EN) was removed as a v1.0.0 blocker — English-only is the shipping stance. See `docs/PLAN.md` and `docs/ROADMAP.md`. v1.0.0 now gates on a polish + bugfix pass; further depth (apps catalog → 150, mass non-GPU driver updates) is candidate work for v0.17.0 / v0.18.0.

## v0.15.2

UX revamp of the persistence service: the per-profile "Keep this profile applied" toggles are gone. Reclaim now auto-tracks whatever tweaks you've actually turned on — applying a tweak adds it to the persistence set, reverting removes it. No profile picker for persistence anywhere.

### Changed

- **Persistence is now "auto-track active tweaks" instead of per-profile.** Single global "Auto-persist active tweaks" toggle in Settings → Background Service. When you flip it on, Reclaim snapshots every tweak currently reading as "on" into the persistence set; after that, the executor wires `applyTweak` → add and `revertTweak` → remove automatically. The drift loop walks the set directly, no profile resolution. The user's mental model is now "what's on stays on", not "this profile stays applied".
- **One SYSTEM scheduled task instead of N.** v0.15.1 installed `\Reclaim\Persist-<profile-id>` per persisted profile. v0.15.2 installs a single `\Reclaim\Persist-Current` task that runs `reclaim.exe --apply-tweak <id1,id2,…> --admin-only` with every tracked admin tweak embedded in the action arguments. Re-installed (with `-Force`) whenever the tracked admin-id set or the check interval changes.

### Added

- **One-shot v0.15.1 → v0.15.2 migration.** On first boot of v0.15.2, any existing `persistedProfiles` in `service.json` are resolved to flat tweak ids (built-in PROFILES + custom profile builder lookups) and merged into the new `persist.tweakIds` set; persistence is auto-enabled to match the user's prior intent. Legacy `\Reclaim\Persist-<id>` scheduled tasks are torn down via the new `persistence_cleanup_legacy_tasks` command (requires admin; gracefully skipped if not elevated, with a clear log entry).
- **Tracked-tweaks transparency.** Expandable list under the auto-persist card shows exactly which tweaks are in the persistence set with category + admin badges and an explicit "not drift-checkable" badge for shell-only entries (they stay in the set but won't auto-re-apply).
- **Re-snapshot button.** If you've toggled tweaks outside of Reclaim's auto-track (or want to reset the set to "whatever's currently on"), one click rescans all 167 tweaks and replaces the set. The toast also shows how many shell-only tweaks couldn't be auto-detected so it's clear why the count may be lower than expected.
- **Clear tracked button.** Drops the entire persistence set without touching the underlying tweak state on disk.

### Fixed

- **Snapshot no longer silently skips tweaks without explicit `check[]`.** `getTweakState` already falls back to inspecting apply-side reg ops when no check array is provided, but the snapshot loop was pre-filtering on `tweak.check?.length > 0` and dropping every tweak that relied on the fallback path — making "Auto-persist on" appear to detect almost nothing on a Privacy-Max-heavy system. The filter is gone; only tweaks reading as `"unknown"` (genuinely undetectable shell-only ones) are skipped, and the toast surfaces that count.
- **Drift checker now uses `isDriftCheckable(tweak)`** as the skip-rule instead of `tweak.check?.length > 0`. Same fix — tweaks defined purely via apply reg ops are now drift-detected from those ops, instead of being silently ignored on every tick.
- **UI alignment with the rest of the app.** Background-service settings now live in three separate Cards (`Tray companion` / `Auto-persist tweaks` / `Notifications`) instead of one giant nested layout — mirrors how `Settings.svelte` already structures Appearance / System / Updates / About. Card titles are plain text without leading icons (`<CardTitle>Auto-persist tweaks</CardTitle>`, not `<Icon /> Auto-persist`), matching the rest of the Settings page. The mode picker is full-width with help text and the standard `h-9` height, not a cramped `min-w-[160px]` chip. Toggle tiles use `border-primary/40 bg-primary/5` when active (same visual language as the theme-picker tiles in the Appearance card).
- **Tracked-tweaks list grouped by category** (`PRIVACY (12)` / `AI & COPILOT (5)` / …) instead of a flat list with per-row category Badges — `TweakRow` itself doesn't show category badges because the route context implies the category, and the mixed-category persistence list now mirrors that by lifting the category into a section header instead of a per-row chip.

### Internal

- New `src/lib/persistence/migrate.ts` (~80 LOC). One-shot resolver that reads the legacy `persistedProfiles` field from localStorage, resolves to tweak ids via `PROFILES` + `customProfiles`, calls `service.setPersistedTweakIds([...])`, then invokes the Rust `persistence_cleanup_legacy_tasks` command. Idempotent via `service.legacyProfilesMigrated`.
- `service.svelte.ts`: dropped `PersistedProfile[]` model entirely. New `PersistState` shape: `{enabled, mode, tweakIds, systemTaskEnabled, lastCheck, lastDriftCount, totalDriftsFixed}`. `mergeWithDefaults` reads the legacy `persistedProfiles` header to preserve `mode` / `enabled` / lifetime stats during migration.
- `executor.ts`: `applyTweak` calls `service.addPersistedTweak(id)` after success; `revertTweak` calls `service.removePersistedTweak(id)`. The store helpers are no-ops when persist is disabled.
- `persistence/checker.ts` rewritten — single iteration over `persist.tweakIds`, lookup in a pre-built `tweakById` map of `ALL_TWEAKS`. No more `resolveProfileById` / `resolveProfileTweaks` calls in the loop.
- `persistence.rs` rewritten — singular task `\Reclaim\Persist-Current`. New `persistence_cleanup_legacy_tasks` Tauri command that enumerates `Get-ScheduledTask -TaskPath '\Reclaim\'`, filters to anything matching `Persist-*` but not the new singleton, and `Unregister-ScheduledTask`s each one. Returns the removed count.
- `BackgroundServiceCard.svelte`: replaced per-profile iteration with the new single-section UI. Reactive `$effect` syncs the SYSTEM task whenever the tracked admin-id set changes (sort-stable hash compare so writes don't fire on every Svelte update).
- +1 Tauri command (`persistence_cleanup_legacy_tasks`). Total: 108 commands across 24 modules.

## v0.15.1

Patch release on the v0.15 persistence service: fixes three UX bugs that landed in v0.15.0 and ships SYSTEM-context scheduled tasks so admin tweaks finally persist too (the "HKLM deferred to v0.16+" caveat from v0.15.0 is closed).

### Fixed

- **Closing the window with X actually hides to the tray now.** v0.15.0 wired the Rust-side `on_window_event` close handler correctly (`prevent_close()` + `hide()`), but on Tauri 2 / Windows the IPC close path from `getCurrentWindow().close()` ignores `prevent_close` and tears the window down anyway — which made the event loop exit and the tray companion die with it. The Titlebar X now calls `win.hide()` directly when "Keep running in tray when closed" is on, bypassing the broken IPC pipeline entirely. Alt+F4 / OS-initiated close paths still go through the Rust handler as a backstop (those respect `prevent_close`). An `ExitRequested` safety net in the runtime callback uses `prevent_exit()` if something destroys the window externally, so the tray icon never dies silently — and `service::show_main` re-creates the window if needed when the tray "Open Reclaim" menu is clicked.
- **Keep-in-tray and Start-with-Windows switches actually toggle when clicked.** Both Switch components in Settings → Background Service had `e.stopPropagation()` but no `onCheckedChange` — direct clicks on the switch did nothing while clicks on the surrounding card area worked. Easy to mis-interpret as "the setting is on" without it actually being on. Both switches now wire `onCheckedChange` to the same handler the surrounding card uses, with `stopPropagation` only preventing the duplicate fire.
- **Autostart no longer triggers UAC at every Windows login.** `try_elevate_at_startup` now skips when `--autostart` is present in argv. Previously Reclaim's autostart entry fired a UAC prompt at every boot — dismissing or missing it would still launch the unelevated copy into tray, but the prompt itself was a UX killer (and on systems where UAC is set to auto-deny, the entry looked broken). v0.15's autostart UX is now what the v0.15.0 changelog promised.

### Added (extends v0.15 persistence)

- **SYSTEM-context persistence for admin tweaks.** Profiles can now re-apply HKLM + shell tweaks in the background without ever showing a UAC prompt to the user. Per-profile toggle in Settings → Background Service installs `\Reclaim\Persist-<id>` as a SYSTEM-running scheduled task that calls `reclaim.exe --apply-profile <id> --admin-only --silent --no-elevate` at logon plus on the configured interval (1h / 6h / 12h / 24h). Closes the v0.15.0 "HKLM persistence deferred" gap.
  - Status surface per profile: live Task Scheduler state (`Ready` / `Running` / `Disabled`), Last-run + Next-run timestamps, **Trigger now** button.
  - Changing the global check interval rebuilds every installed SYSTEM task with the new cadence — no orphaned schedules.
  - Tear-down on un-persist: disabling a profile that has an admin task installed removes the scheduled task too (so the user can't accidentally leave SYSTEM re-applying tweaks they opted out of).
  - HKCU side stays in the tray companion: `S-1-5-18` (SYSTEM) has its own HKCU hive that the user never sees, so re-applying HKCU under SYSTEM would silently miss the target. The new `--admin-only` CLI flag enforces the split.
- **New `--admin-only` CLI flag.** Filters `--apply-profile` / `--apply-tweak` to only HKLM + shell ops; HKCU-only tweaks are silently skipped. Used by the SYSTEM persistence task; also useful for sysadmins pushing per-machine settings from a deployment script.

### Internal

- New Rust module `src-tauri/src/persistence.rs` (~170 LOC). Four `#[tauri::command]`s: `persistence_install_task`, `persistence_uninstall_task`, `persistence_task_status`, `persistence_run_task_now`. Static PowerShell scripts splice profile ids only after `[a-zA-Z0-9_-]+` validation, never user-controlled display text.
- `cli.rs` gains an `admin_only: bool` arg, filter is applied inside `apply_tweak_ids` so it covers both `--apply-tweak` and `--apply-profile` paths (the latter routes through it).
- `bridge.ts`: 4 new wrappers (`persistenceInstallTask` / `Uninstall` / `Status` / `RunNow`), 1 new exported type (`PersistenceTaskStatus`).
- `BackgroundServiceCard.svelte`: tracks per-profile task status in `$state<Record<string, PersistenceTaskStatus>>`, refreshes on mount + after each toggle / interval change.
- `lib.rs` now uses `Builder::build()? .run(|app_handle, event| ...)` instead of plain `.run()` so the `ExitRequested` event can be intercepted with `prevent_exit()`. Window-close handling stays in `on_window_event` as a backstop for OS-initiated paths.
- +4 Tauri commands (persistence module). +1 Rust module. Total: 107 commands across 24 modules. 33 routes unchanged.

## v0.15.0

### Added

- **Persistence service + tray companion.** Reclaim now installs itself as a permanent presence in the Windows notification area instead of being a one-shot GUI that exits on close. The big payoff: persisted profiles get their **HKCU** tweaks re-applied silently after Windows updates flip them back — closing O&O ShutUp10++ Premium's last paid differentiator. New behaviors:
  - **System tray icon** with menu (Open Reclaim / Check now / Settings… / Quit Reclaim). Left-click toggles window visibility; closing the X button hides to tray instead of quitting (toggleable in Settings).
  - **Start with Windows** toggle in Settings → Background Service. Wires through `tauri-plugin-autostart`, boots straight to tray (no window flash) via a `--autostart` launch flag. Hard-disabled in portable builds with explanation text — portable mode stays stateless by design.
  - **Active persistence list** in Settings. Built-in + custom profiles, per-profile **Keep applied** toggle with **Update-only** (default) or **Strict** mode. Update-only re-applies only when Windows has installed a hotfix in the last 48h (absorbs timezone clock skew on `Get-HotFix InstalledOn`); Strict re-applies any drift every tick. Per-profile Run-now button + status line showing last check, drifts re-applied, lifetime total.
  - **Notification dispatcher** (`tauri-plugin-notification`) with three channels: drift re-applied, Windows Updates available, NVIDIA driver updates available. Clicking a toast opens Reclaim on the relevant route (`/profiles`, `/windows-update`, `/drivers`) — no one-click installs from the toast itself (WU reboots; driver installs can brick GPUs).
  - **24h throttle** per notification channel — same payload-hash within 24h is silently dropped.
  - **Windows Update + NVIDIA driver pollers.** Reuses existing `search_windows_updates` and `lookup_nvidia_driver`; runs WU check every 12h, driver check every 24h, gated by `service.json#last*Check` timestamps. Skipped automatically when on battery below 30% via new `get_power_state` query (desktops always proceed). Naive NVIDIA version compare (last-N-digits of `Win32_VideoController.DriverVersion` against marketing version) avoids false positives.
  - **Single-instance lock** (`tauri-plugin-single-instance`) — double-clicking the desktop icon while the tray is running focuses the existing window instead of spawning a second `reclaim.exe`.
  - **Configurable check interval** (1h / 6h / 12h / 24h, default 6h). Rust-side Tokio loop sleeps in 60s chunks so a Settings change takes effect within a minute without restarting the task.
  - **First-close hint** — the first time the window closes to tray while the user is on a session that hasn't seen the hint yet, an in-app toast explains the new behavior so it's not surprising.

### Out of scope (initially deferred; HKLM closed in v0.15.1)

- ~~**HKLM persistence.**~~ ✅ Shipped in v0.15.1 via SYSTEM-context scheduled tasks per profile (`\Reclaim\Persist-<id>`), invoked through the existing CLI mode with the new `--admin-only` flag.
- **AMD / Intel driver pollers.** No programmatic vendor API exists today; would need scraping (fragile) or a hosted JSON mirror. NVIDIA-only for v1.

### Fixed

- **`cachedResource` could throw `state_unsafe_mutation`** when re-keyed (e.g. after removing a bloatware app, the icons resource re-keys via its `version` arg). The cache was mutating its `entry` state synchronously inside the call, which Svelte 5 forbids when called from a `$derived` block. Mutations + fetch kickoff are now deferred to a microtask so the derived completes first.

### Internal

- New Rust module `src-tauri/src/service.rs` — Tokio interval, `ServiceState` Mutex (interval / keep-in-tray / force-quit), `service_*` Tauri commands, helper functions for tray menu wiring (`show_main`, `emit_trigger_check`, `emit_navigate`).
- `lib.rs` builds the tray icon + menu in the setup hook via `tauri::tray::TrayIconBuilder` (new `tray-icon` feature on the `tauri` crate). `on_window_event(CloseRequested)` checks `ServiceState.keep_in_tray` and either hides or lets the close through. The tray "Quit" menu sets a `force_quit` flag so the next CloseRequested passes through naturally.
- `cli.rs`: `--autostart` and `--no-elevate` are now both no-op flags that don't trigger CLI mode (so the autostart-launched reclaim.exe routes to GUI).
- `sysquery.rs`: + `get_power_state` (parses `Win32_Battery.BatteryStatus`) and `recent_hotfix_installed_since(hours)` (`Get-HotFix | Where InstalledOn -ge $cutoff`).
- New frontend modules: `service.svelte.ts` (config store mirrored to `<app_data_dir>/service.json` + listens to Rust ticks), `notify.ts` (toast dispatcher with throttling + click routing via route-tag encoded in body), `persistence/checker.ts` (HKCU-only drift loop reusing existing `getTweakState` + `applyTweak`), `persistence/updateChecker.ts` (WU + NVIDIA pollers), `components/BackgroundServiceCard.svelte` (Settings UI).
- 96 → 100 Tauri commands. 21 → 22 Rust modules. 33 routes unchanged.

## v0.14.0

### Added

- **CLI mode.** The same `reclaim.exe` that launches the GUI now drives every tweak / profile / bloatware operation from argv when invoked with `--`-style flags. Designed for sysadmin and gold-image scenarios (MDT / Intune / first-logon) where the Tauri window is dead weight. New flags:
  - `--list-profiles`, `--list-tweaks [--category <c>]`, `--list-bloatware` — print the catalog (optionally as `--json`).
  - `--apply-profile <id> [--include-bloatware]` — apply every tweak in a built-in profile (`basics`, `gaming`, `privacy-max`, `performance`).
  - `--apply-tweak <id1>[,id2,…]` / `--revert-tweak …` / `--check-tweak …` — single-tweak operations.
  - `--remove-bloat <pattern1>[,p2,…]` — AppX wildcard removal (`'*Spotify*'`, `Microsoft.BingNews`, …) for both current-user and provisioning.
  - `--import-profile <file.reclaim> [--apply] [--include-bloatware]` — load a custom `.reclaim` envelope (same JSON the GUI exports), validate it, optionally execute.
  - `--export-state [--json]` — dump every tweak's current on/off state for compliance auditing.
  - `--silent` / `-q`, `--json`, `--yes` / `-y` are global modifiers.
- **Catalog export pipeline.** New `pnpm catalog:export` (also runs automatically before `pnpm tauri:build`) bundles the TS catalog (`src/lib/tweaks/{catalog,bloatware,profiles}.ts` + `src/lib/apps/catalog.ts`) via esbuild and dumps it to `src-tauri/data/*.json`. The CLI binary `include_str!`s those files so headless and GUI mode share the exact same tweak / bloatware / profile data — no drift possible.
- **`install.ps1` — same-version detection + silent install + terminal progress bar.**
  - Now detects existing installs across `HKLM`, `HKLM\Wow6432Node`, and `HKCU` uninstall keys, and exits cleanly with a clear "Reclaim vX.Y.Z is already installed — nothing to do." message instead of silently re-running the installer. Opt-out via `$env:RECLAIM_FORCE='1'` for a forced reinstall.
  - New `$env:RECLAIM_SILENT='1'` runs the NSIS installer with `/S` (or MSI with `/qn /norestart`) — no installer wizard, just the terminal. Combine with `$env:RECLAIM_MODE='install'` for fully unattended provisioning. Honored by `install` and `msi`; ignored for `portable` (nothing to silence).
  - Replaces IWR's slow default progress bar with an in-line `[========     ] 42%  3.2 / 7.6 MB @ 4.5 MB/s` style display that works in plain `cmd.exe`, Conhost, and Windows Terminal alike. Buffered to ~120 ms ticks so fast connections don't melt the terminal.
  - While the silent installer runs, a small `|/-\` spinner with "Installing Reclaim vX.Y.Z" keeps the terminal alive instead of dead air; the post-install uninstall-key recheck confirms success.
  - New `$env:RECLAIM_NO_LAUNCH='1'` skips the "Launch Reclaim now?" prompt after a portable download (so the script can be chained from another script).

### Internal

- New Rust module `src-tauri/src/cli.rs` (~700 LOC). Reuses the existing `tweaks::run_ps` / registry primitives — the new `reg_write_sync` / `reg_delete_value_sync` / `reg_read_sync` helpers were factored out of the existing `#[tauri::command]` wrappers so both worlds share one implementation.
- `main.rs` dispatches into CLI when any `--`-flag is present besides `--no-elevate`; otherwise the existing GUI elevate path runs unchanged.
- Console attachment via `AttachConsole(ATTACH_PARENT_PROCESS)` so the GUI-subsystem binary writes back to the spawning `cmd` / `pwsh` terminal — no second `reclaim-cli.exe` to ship.
- Activity log mirroring works the same as GUI: CLI writes JSON-lines to `%APPDATA%/Reclaim/activity.log` so subsequent GUI sessions see headless changes in the Activity Log route.
- `install.ps1` em-dashes inside string literals were replaced with ASCII hyphens to work around Windows PowerShell 5.1's CP1252 default decoding of byte `0x94` (RIGHT DOUBLE QUOTATION MARK) which would otherwise prematurely terminate the string. Comments still use em-dashes — PS skips comments entirely so the bug is invisible there.

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

### Open for v1.0.0 (as of v0.7.0)

- i18n (DE + EN locales). *Later dropped from v1.0.0 scope — see docs/PLAN.md; the app ships English-only.*
- Code-signing the installer (EV cert or SignPath). *Later dropped — see v0.11.0 entry.*

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
