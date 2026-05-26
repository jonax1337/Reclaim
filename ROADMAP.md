# Reclaim Roadmap — GOATED Plan

Status of the gaming-toolbox expansion plan. See [`CHANGELOG.md`](CHANGELOG.md) for the per-version history of what already landed; this file tracks what's done, what was dropped, and what's still open.

**Current release: [v1.1.0](https://github.com/jonax1337/Reclaim/releases/tag/v1.1.0).**

## ✅ Shipped in v1.1.0

### Win10 compatibility tier
- ✅ README "Best effort" status badge alongside the Win11 "Primary" badge
- ✅ Settings page surfaces an inline `InfoBanner` when the system build number is < 22000
- ✅ Graceful degradation documented (Recall / Click-to-Do / Widgets / Mica silently no-op on Win10)

### 28 new gaming tweaks (catalog 200 → 228, gaming category 7 → 35)

| Sub-category | Count | IDs |
|---|---:|---|
| Input & peripheral | 5 | `mouse-hover-time-fast`, `keyboard-delay-fast`, `keyboard-speed-fast`, `usb-selective-suspend-off-global`, `hid-power-management-off` |
| Network latency | 6 | `tcp-delack-ticks-off`, `qos-reserved-bandwidth-off`, `nic-energy-efficient-ethernet-off`, `nic-flow-control-off`, `nic-interrupt-moderation-off`, `afd-receive-window-tune` |
| GPU & display | 4 | `hags-on`, `gpu-tdr-delay-extend`, `nvidia-telemetry-services-off`, `amd-ueip-off` |
| CPU & scheduling | 4 | `power-throttling-off-policy`, `bcdedit-tscsync-enhanced`, `core-parking-off-ac`, `processor-perf-boost-aggressive` |
| Fullscreen + Game Bar | 4 | `fullscreen-optimizations-off-global`, `game-bar-fully-off`, `xbox-game-monitoring-off`, `game-bar-presence-writer-off` |
| Storage / visual / audio | 5 | `ntfs-8dot3-off`, `ntfs-mft-zone-large`, `transparency-effects-off`, `dwm-input-io-completion-on`, `audio-enhancements-off` |

### 6 new routes
- ✅ `/gaming-session` — snapshot-based background suspend with auto-revert
- ✅ `/per-game-profiles` — per-EXE GPU + AppCompat Layers via HKCU (no admin)
- ✅ `/msi-mode` — per-PCI MSI/MSI-X toggle with SYSTEM-task fallback for ACL-locked Enum subkeys
- ✅ `/nic-tuning` — `Get-NetAdapterAdvancedProperty` editor with 16 curated properties
- ✅ `/latency-monitor` — live ping with sparklines (8 presets + custom targets)
- ✅ `/anti-cheat-compat` — Vanguard / EAC / BattlEye / VAC compatibility matrix with one-click fixes

### Profiles & install media
- ✅ `gaming` built-in profile expanded 18 → 38 tweaks
- ✅ New `gaming-esports` built-in profile (48 tweaks, plugged-in desktop rigs)
- ✅ New "Esports Rig" Install-Media Task-Sequence template

### Beyond the original plan (bonus)
- ✅ Dashboard redesign — profile cards + categories grid out; 4 KPI tiles + Recent activity feed + permanent Catalog coverage breakdown
- ✅ Sidebar reorg — new `Gaming` group, Customize trimmed back to 10 OS-tweak entries, Developer's lone item merged into System info
- ✅ Activity log noise filter — `system.boot` ("Session started") + `service.tick` no longer logged or persisted
- ✅ Cluster of route bugfixes uncovered during testing (PS 5.1 `ConvertTo-Json -AsArray` incompat, inverted `audio-enhancements-off`, locale-dependent powercfg/fsutil checks, MSI `HKLM\…\Enum` ACL fallback, NIC numeric-vs-string typing, latency ping sequentialisation)

## ✗ Dropped during execution

| ID | Why dropped |
|---|---|
| `gpu-preemption-off` | Vendor-specific (NVIDIA-only), unclear semantics across driver versions |
| `gpu-msi-mode-on` | Superseded by `/msi-mode` route — better UX as an enumerated picker than a single boolean tweak |
| `disable-cstates-perf-plan` | Too aggressive for laptops, high idle power draw |
| `audio-exclusive-mode-priority` | Per-device iteration too fragile for a clean revert path |
| `disk-io-page-lock-limit` | Legacy XP-era tweak — modern Windows ignores it |
| `animations-window-off` | Already covered by `visual-effects-best-performance` (Performance category) |

## 🔓 GOATED++ — Open for a future v1.2 / v1.x

Optional follow-ups that weren't in the original v1.1 plan. None are blockers; pick by user demand.

### Small extensions (≤ 1 day each)

- **Process-Lasso-lite route** — live process list with priority / affinity override + automatic rule per game. Was in early brainstorm, dropped before the v1.1 plan was finalised. Pairs well with `/per-game-profiles` (one acts on the EXE registry, the other on the live process).
- **MessageNumberLimit slider in `/msi-mode`** — the Rust command already exists (`msi_set_message_limit`), only the UI widget is missing. 1–2048 numeric stepper next to the MSI toggle.
- **NIC Tuning vendor presets** — one-click "Intel I225 Gaming Preset" / "Realtek 8125 Defaults" / "Killer Esports". Curated bundles on top of the existing per-property API.
- **Tweak-conflict detection** — UI warning when two enabled tweaks would write opposing registry values. Catalog-time static analysis, no runtime cost.
- **Esports Rig E2E test** — run `scripts/test-install-media.ps1` against the new template inside a Hyper-V VM, analogous to the v1.0.0 IM sweep. Confirms all 48 tweaks roundtrip cleanly.

### Mid-size (1–3 days each)

- **Latency monitor — DPC-latency** via PresentMon ETW integration. The existing route only shows network round-trip; adding system-side DPC latency would catch driver / interrupt issues. Needs PresentMon as a bundled external tool or vendored binary.
- **Driver search expansion** — current Driver page only handles GPU (NVIDIA / AMD / Intel). Same auto-search pattern for Wi-Fi / LAN / audio adapters.
- **Activity log file mirror cleanup** — the `activity.log` JSON-lines file on disk still contains pre-v1.1 `system.boot` / `service.tick` entries. Add a one-shot Rust command that rewrites the file filtered against the same `NOISE_ACTIONS` set the localStorage hydrate already uses.

### Larger themes (multi-day)

- **Per-game watchdog** — detect a known game's `.exe` launching and apply the matching per-game profile automatically. Requires extending the existing service-tick loop with a process watcher, plus a per-profile "auto-apply on launch" toggle.
- **Anti-cheat detection refresh** — Riot tightens Vanguard's TPM / Secure Boot demands periodically; the compat matrix's rule set should be revalidated each Riot policy change. Could surface a "last reviewed against …" date on the `/anti-cheat-compat` route.
- **Multi-NIC bonding helper** — for users with multiple physical NICs, expose `New-NetSwitchTeam` / `Add-NetSwitchTeamMember` as a guided flow.

## Out of scope

Things that have come up but are explicitly **not** on this roadmap:

- **Code signing** — the v0.11.0 Activation Launcher (literal `get.activated.win` URL in the binary) likely closes both the winget-pkgs and SignPath Foundation paths; Reclaim ships unsigned via GitHub Releases via design.
- **Spectre / Meltdown mitigations off / CFG off / ASLR off** — anti-cheats reject these, FPS gain on modern silicon is < 1 %, security cost is not worth it.
- **In-game overlay** — would need signed kernel-level code injection. Hard out.
- **GeForce Experience / Adrenalin replacements** — fan curves, RGB control, OC profiles. Belongs to MSI Afterburner / OpenRGB territory, not a Windows tweaker.

## How to propose new items

Open an issue with the `roadmap` label. Include:
1. What the feature does
2. The Windows API / registry / WMI path it would touch
3. Whether it's reversible without admin (HKCU only) or requires admin (HKLM / shell)
4. Why it's not already covered by an existing tweak or route

Items that get traction from real user reports move from "GOATED++" into a scheduled v1.x milestone.
