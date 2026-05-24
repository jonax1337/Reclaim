# Reclaim — Post-v1.0 Feature Plan

Proposed-but-not-committed work, captured out of the May 2026 market analysis vs. Win11Debloat, ChrisTitusTech/winutil, O&O ShutUp10++, Sophia Script, Talon, Privatezilla, Optimizer and Tiny11Builder. None of these are scheduled for v1.0.0 — v1.0.0 still gates on i18n (DE + EN). This file collects what would extend Reclaim's lead in its niche ("native GUI + live-state + deterministic revert + cross-domain scope") after that.

For shipped work see [`../CHANGELOG.md`](../CHANGELOG.md). For the original phased plan see [`ROADMAP.md`](ROADMAP.md).

---

## Killer features (new USPs)

These are the items that would change Reclaim's competitive position — not just "more of the same" but features no GUI competitor currently has, or that close a single specific gap to a specific tool.

### 1. Persistence service

**What.** A background Scheduled Task (or Windows service) that runs once per day, uses our existing `check[]` arrays on every applied tweak from a "persisted profile", detects drift (Windows-Update reverted something, Microsoft reset a setting), and re-applies the tweaks silently.

**Why it matters.** This is the single feature that O&O ShutUp10++ Premium charges money for ("Premium privacy enforcement that persists across updates", 3.0.1076 May 2026). Reclaim already has all the primitives — `regReadMany` for drift detection, `applyTweak`/`revertTweak` for re-application, the activity log for audit. We just don't have a thing that runs them on a schedule.

**How.** Two layers:
- A bundled `reclaim-watchdog.exe` (or invocation of `reclaim.exe --watchdog` if we ship the CLI mode below) that takes a profile id, reads its tweaks via the existing executor, and reports + re-applies drift. Logs to the same `activity.log` JSON-lines mirror.
- A first-class UI in Settings: "Keep this profile applied" toggle next to the profile selector, creates the Scheduled Task via the existing `schtasks.rs` module.

**Scope.** Small-to-medium. The hard part (idempotent tweak engine) already exists. The Scheduled Task plumbing is ~200 lines of Rust + a Settings card.

**Competitive impact.** Neutralizes O&O Premium's one remaining differentiator. After this, we beat O&O on every axis they're stronger on, while keeping all our advantages (apps catalog, hosts/DNS, maintenance, driver tools, recall, OneDrive, install media).

---

### 2. CLI mode

**What.** Add a `--cli` (or `--apply-profile <id>`, `--debloat <pattern>`, `--silent`, `--check`) argument-driven mode to `reclaim.exe` so the same binary that runs the Webview UI also functions as a headless deployment tool. Cargo `clap` (or `argh`) feature, gated so it adds <50 KB to the GUI binary.

**Why it matters.** Win11Debloat's last remaining genuine USP is "scriptable for unattended provisioning" — Sysadmins, MDT/Intune pipelines, gold-image build scripts. They put us into "for end users" vs "for sysadmins" segmentation. A CLI mode collapses that.

**Examples that would just work:**
```powershell
reclaim.exe --apply-profile privacy-max --silent
reclaim.exe --apply-tweak telemetry-off --silent
reclaim.exe --remove-bloat "*Spotify*","Microsoft.BingNews"
reclaim.exe --import-profile path\to\custom.reclaim --apply --silent
reclaim.exe --export-state json > current.json   # for compliance auditing
```

**Scope.** Small. The executor + bridge already abstract everything we need; CLI just needs to wire arguments to the same paths and skip the Webview init. ~2-3 days including arg-parsing UX.

**Competitive impact.** Closes Win11Debloat's last non-marketing USP. Opens enterprise/MSP use cases that we currently can't serve at all.

---

### 3. i18n (DE + EN)

**What.** Localize all UI strings to German and English. Use `svelte-i18n` or a tiny custom rune-based store. Move ~600 hardcoded strings into `src/lib/i18n/{de,en}.ts` keyed translation tables. Language picker in Settings, autodetect from Windows display language on first launch.

**Why it matters.** Listed as the **only** v1.0.0 blocker in CLAUDE.md. O&O ShutUp10 ships in ~30 languages, Optimizer had 24. Reclaim being English-only is the single biggest adoption blocker in DACH (Reclaim's primary geography given the author + Zettel lineage).

**Scope.** Medium. The string count is the work — ~600 user-facing strings across 33 routes + UI components. Per-tweak title/description (~151 × 2 = 302 strings) is the bulk. Frontend wiring is mechanical.

**Competitive impact.** Doesn't add competitive surface area, but blocks every DACH adoption conversation. Required for v1.0.0.

---

## Scope expansions (more of what we already do)

These are "make existing categories bigger / deeper" — not new USPs but addressing specific gaps in the market-analysis table where competitors clearly out-scoped us.

### 4. Apps catalog → 150-200 entries

**Current.** 46 winget apps, 16 recommended.

**Gap.** ChrisTitusTech/winutil ships ~200+ apps via winget + choco. We deliberately curated small for v1, but at this point we're leaving a lot of "is X available?" requests on the table.

**Work.** Add choco support alongside winget (new bridge command, fallback chain, source badge per app card). Triple the catalog with researched entries across all 8 groups. Optionally add scoop as a third source for dev tools.

**Effort.** Medium. The single-source assumption is baked into `apps/catalog.ts` + Apps.svelte — needs a generic `installSources: ['winget', 'choco']` field per app and a small UI badge.

---

### 5. Tweaks → 200

**Current.** 151 across 10 categories.

**Gap.** Sophia Script has ~150 callable functions, many of them edge-cases (WSL toggles, Hyper-V, Windows Sandbox, NTFS deeper toggles, hardware-specific). We cover the obvious 80 % well; the next 20 % opens up power-user appeal.

**Work.** New categories or extensions of existing:
- **Dev features** (WSL, Hyper-V, Windows Sandbox, Dev Drive toggles) — could be a whole new sidebar entry "Developer" or land inside existing System.
- **Hardware** (BitLocker auto-unlock, TPM clear via PowerShell, Modern Standby quirks)
- **NTFS depth** (compression by extension, junction-point management, sparse-file inspection)

**Effort.** Low per tweak; the engine handles them. Pure data-entry work in `catalog.ts` once we identify the targets. Maybe a week of research + tweak writing.

---

### 6. Mass driver updates (non-GPU)

**Current.** GPU only (NVIDIA / AMD / Intel) — vendor-page auto-find + NVIDIA streaming download.

**Gap.** Chipset / Audio / Network / Storage drivers are equally important. Right now we leave the user with `pnputil` rollback but no update path beyond Windows Update.

**Work.** Snappy-Driver-Installer-Style flow: enumerate installed driver packages, query a curated source (Windows Update Driver Catalog API + maybe a hosted JSON mirror) for newer versions, surface a Drivers tab with grouped update candidates per class. Streams downloads + driver-package installs.

**Effort.** Medium-high. The driver-catalog source-of-truth question is the hard part — Windows Update's driver catalog has an undocumented API that works but breaks occasionally. Alternative: lean on the OEM's own update tooling (HP Image Assistant, Lenovo Vantage, Dell Command Update) and just orchestrate them — but that re-introduces vendor bloat we explicitly want to avoid.

---

### 7. Granular gaming tweaks

**Current.** Performance category has 20 entries — enough for the "low-hanging" gaming wins (Game DVR, Game Bar, background apps, mouse accel, Game DVR background recording, Visual Effects best-performance, High Performance plan).

**Gap.** Optimizer's deeper gaming bundle (TCP/IP tweaks — TcpAckFrequency, TCPNoDelay, TcpDelAckTicks, Nagle's algorithm off; QoS DSCP marking; NDIS thread tuning; HPET disable on certain motherboards; CPU core parking thresholds). These are old-school but still measurably help latency-sensitive games.

**Work.** New `gaming` tweak category (or expand `performance`) with ~10-15 networking / power / scheduler tweaks. Each one needs careful framing — these can break legitimate setups. Heavy `warning:` text + `recommended: false` defaults.

**Effort.** Low per tweak. Research-heavy on which tweaks still matter on Win11 24H2+.

---

### 8. Developer features tab

**Current.** Nothing. WSL/Hyper-V/Sandbox toggles live in Windows Settings only.

**Gap.** WinUtil has a dedicated "Features" tab for this. It's a high-trust audience for us (developers debloat aggressively).

**Work.** New sidebar group "Developer" with toggles wrapping `dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux` and friends, plus per-WSL-distro listing. Real-time state via DISM Get-WindowsOptionalFeature.

**Effort.** Medium. DISM is reliable; the UI is the work. Could share the maintenance-PTY pattern for the long enable/disable runs.

---

## Where these fit relative to v1.0.0

- **Required for v1.0.0:** i18n (#3 above). Nothing else.
- **Should land before v1.0.0 if time allows:** CLI mode (#2) and Persistence service (#1) — they unlock entire user segments we currently don't serve.
- **Post-v1.0.0:** Scope expansions (#4-#8). All "more of the same" and don't change positioning, just depth.

## Where these would NOT go

- Anything that **builds Reclaim a Windows installer ISO from scratch** (that's Tiny11Builder's territory, orthogonal — we install onto running systems).
- Anything that **edits arbitrary group policies via an `Edit GPO` UI** (gpedit.msc already exists, we'd just be a worse copy).
- Anything **AI-driven** — we're a tool against AI bloat, would be ironic.

## Marketing / reach (not technical but the largest single lever)

Out of scope for this file but worth one paragraph: the technical gap to WinUtil and Win11Debloat is small. The visibility gap is enormous. A "Why I built Reclaim" blog post linked from Reddit r/Windows11, r/sysadmin and HackerNews would move more needle than any single feature listed above. Mention from Chris Titus or a similar voice would 10× users in a week.
