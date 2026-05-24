# Reclaim — Post-v1.0 Feature Plan

Proposed-but-not-committed work, captured out of the May 2026 market analysis vs. Win11Debloat, ChrisTitusTech/winutil, O&O ShutUp10++, Sophia Script, Talon, Privatezilla, Optimizer and Tiny11Builder. None of these are scheduled for v1.0.0 — v1.0.0 still gates on i18n (DE + EN). This file collects what would extend Reclaim's lead in its niche ("native GUI + live-state + deterministic revert + cross-domain scope") after that.

For shipped work see [`../CHANGELOG.md`](../CHANGELOG.md). For the original phased plan see [`ROADMAP.md`](ROADMAP.md).

---

## Already shipped (was on this list)

- **Persistence service** — v0.15.0 + v0.15.1. Tray companion with background timer + HKCU drift re-apply per profile (v0.15.0). SYSTEM-running scheduled task path for HKLM + shell tweaks via per-profile opt-in toggle, no UAC prompt at boot (v0.15.1). Both layers together close every gap O&O ShutUp10++ Premium charges money for.
- **CLI mode** — v0.14.0 + v0.15.1. Same `reclaim.exe` accepts `--apply-profile`, `--apply-tweak`, `--remove-bloat`, `--import-profile`, `--export-state` etc. The new `--admin-only` flag (v0.15.1) lets a SYSTEM-context call filter to HKLM + shell ops only. Catalog shared with GUI via build-time export to `src-tauri/data/*.json`. Closed Win11Debloat's last non-marketing USP.

---

## Killer features (new USPs)

These are the items that would change Reclaim's competitive position — not just "more of the same" but features no GUI competitor currently has, or that close a single specific gap to a specific tool.

### 1. i18n (DE + EN)

**What.** Localize all UI strings to German and English. Use `svelte-i18n` or a tiny custom rune-based store. Move ~600 hardcoded strings into `src/lib/i18n/{de,en}.ts` keyed translation tables. Language picker in Settings, autodetect from Windows display language on first launch.

**Why it matters.** Listed as the **only** v1.0.0 blocker in CLAUDE.md. O&O ShutUp10 ships in ~30 languages, Optimizer had 24. Reclaim being English-only is the single biggest adoption blocker in DACH (Reclaim's primary geography given the author + Zettel lineage).

**Scope.** Medium. The string count is the work — ~600 user-facing strings across 33 routes + UI components. Per-tweak title/description (~167 × 2 = 334 strings) is the bulk. Frontend wiring is mechanical.

**Competitive impact.** Doesn't add competitive surface area, but blocks every DACH adoption conversation. Required for v1.0.0.

---

## Scope expansions (more of what we already do)

These are "make existing categories bigger / deeper" — not new USPs but addressing specific gaps in the market-analysis table where competitors clearly out-scoped us.

### 2. Apps catalog → 150-200 entries

**Current.** 67 winget apps across 8 groups, 16 recommended.

**Gap.** ChrisTitusTech/winutil ships ~200+ apps via winget + choco. We deliberately curated small for v1, but at this point we're leaving a lot of "is X available?" requests on the table.

**Work.** Add choco support alongside winget (new bridge command, fallback chain, source badge per app card). Triple the catalog with researched entries across all 8 groups. Optionally add scoop as a third source for dev tools.

**Effort.** Medium. The single-source assumption is baked into `apps/catalog.ts` + Apps.svelte — needs a generic `installSources: ['winget', 'choco']` field per app and a small UI badge.

---

### 3. Tweaks → 200

**Current.** 167 across 11 categories.

**Gap.** Sophia Script has ~150 callable functions, many of them edge-cases (WSL toggles, Hyper-V, Windows Sandbox, NTFS deeper toggles, hardware-specific). We cover the obvious 80 % well; the next 20 % opens up power-user appeal.

**Work.** New categories or extensions of existing:
- **Dev features** (WSL, Hyper-V, Windows Sandbox, Dev Drive toggles) — could be a whole new sidebar entry "Developer" or land inside existing System.
- **Hardware** (BitLocker auto-unlock, TPM clear via PowerShell, Modern Standby quirks)
- **NTFS depth** (compression by extension, junction-point management, sparse-file inspection)

**Effort.** Low per tweak; the engine handles them. Pure data-entry work in `catalog.ts` once we identify the targets. Maybe a week of research + tweak writing.

---

### 4. Mass driver updates (non-GPU)

**Current.** GPU only (NVIDIA / AMD / Intel) — vendor-page auto-find + NVIDIA streaming download.

**Gap.** Chipset / Audio / Network / Storage drivers are equally important. Right now we leave the user with `pnputil` rollback but no update path beyond Windows Update.

**Work.** Snappy-Driver-Installer-Style flow: enumerate installed driver packages, query a curated source (Windows Update Driver Catalog API + maybe a hosted JSON mirror) for newer versions, surface a Drivers tab with grouped update candidates per class. Streams downloads + driver-package installs.

**Effort.** Medium-high. The driver-catalog source-of-truth question is the hard part — Windows Update's driver catalog has an undocumented API that works but breaks occasionally. Alternative: lean on the OEM's own update tooling (HP Image Assistant, Lenovo Vantage, Dell Command Update) and just orchestrate them — but that re-introduces vendor bloat we explicitly want to avoid.

---

### 5. Granular gaming tweaks

**Current.** Performance category has 20 entries — enough for the "low-hanging" gaming wins (Game DVR, Game Bar, background apps, mouse accel, Game DVR background recording, Visual Effects best-performance, High Performance plan).

**Gap.** Optimizer's deeper gaming bundle (TCP/IP tweaks — TcpAckFrequency, TCPNoDelay, TcpDelAckTicks, Nagle's algorithm off; QoS DSCP marking; NDIS thread tuning; HPET disable on certain motherboards; CPU core parking thresholds). These are old-school but still measurably help latency-sensitive games.

**Work.** New `gaming` tweak category (or expand `performance`) with ~10-15 networking / power / scheduler tweaks. Each one needs careful framing — these can break legitimate setups. Heavy `warning:` text + `recommended: false` defaults.

**Effort.** Low per tweak. Research-heavy on which tweaks still matter on Win11 24H2+.

---

### 6. Developer features tab

**Current.** Nothing. WSL/Hyper-V/Sandbox toggles live in Windows Settings only.

**Gap.** WinUtil has a dedicated "Features" tab for this. It's a high-trust audience for us (developers debloat aggressively).

**Work.** New sidebar group "Developer" with toggles wrapping `dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux` and friends, plus per-WSL-distro listing. Real-time state via DISM Get-WindowsOptionalFeature.

**Effort.** Medium. DISM is reliable; the UI is the work. Could share the maintenance-PTY pattern for the long enable/disable runs.

---

## Where these fit relative to v1.0.0

- **Required for v1.0.0:** i18n (#1 above). Nothing else.
- **Post-v1.0.0:** Scope expansions (#2-#6). All "more of the same" and don't change positioning, just depth.

## Where these would NOT go

- Anything that **builds Reclaim a Windows installer ISO from scratch** (that's Tiny11Builder's territory, orthogonal — we install onto running systems).
- Anything that **edits arbitrary group policies via an `Edit GPO` UI** (gpedit.msc already exists, we'd just be a worse copy).
- Anything **AI-driven** — we're a tool against AI bloat, would be ironic.

## Marketing / reach (not technical but the largest single lever)

Out of scope for this file but worth one paragraph: the technical gap to WinUtil and Win11Debloat is small. The visibility gap is enormous. A "Why I built Reclaim" blog post linked from Reddit r/Windows11, r/sysadmin and HackerNews would move more needle than any single feature listed above. Mention from Chris Titus or a similar voice would 10× users in a week.
