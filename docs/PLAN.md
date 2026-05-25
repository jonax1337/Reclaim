# Reclaim — Post-v1.0 Feature Plan

Proposed-but-not-committed work, captured out of the May 2026 market analysis vs. Win11Debloat, ChrisTitusTech/winutil, O&O ShutUp10++, Sophia Script, Talon, Privatezilla, Optimizer and Tiny11Builder. None of these are required for v1.0.0 — there are no technical blockers left for the 1.0 release; what remains is a polish + bugfix pass. This file collects what would extend Reclaim's lead in its niche ("native GUI + live-state + deterministic revert + cross-domain scope") either as part of one of the last pre-1.0 minors or post-v1.0.

For shipped work see [`../CHANGELOG.md`](../CHANGELOG.md). For the original phased plan see [`ROADMAP.md`](ROADMAP.md).

---

## Already shipped (was on this list)

- **Persistence service** — v0.15.0 + v0.15.1. Tray companion with background timer + HKCU drift re-apply per profile (v0.15.0). SYSTEM-running scheduled task path for HKLM + shell tweaks via per-profile opt-in toggle, no UAC prompt at boot (v0.15.1). Both layers together close every gap O&O ShutUp10++ Premium charges money for.
- **CLI mode** — v0.14.0 + v0.15.1. Same `reclaim.exe` accepts `--apply-profile`, `--apply-tweak`, `--remove-bloat`, `--import-profile`, `--export-state` etc. The new `--admin-only` flag (v0.15.1) lets a SYSTEM-context call filter to HKLM + shell ops only. Catalog shared with GUI via build-time export to `src-tauri/data/*.json`. Closed Win11Debloat's last non-marketing USP.
- **Granular gaming tweaks** — v0.16.0. New `gaming` tweak category + `/gaming` route with 8 entries: Game Mode, MMCSS SystemResponsiveness, MMCSS Games priority block, Win32PrioritySeparation, ForegroundLockTimeout, NetworkThrottlingIndex, TCP ACK+NoDelay on all interfaces, HPET off (with system-restart marker). Five recommended; HPET / throttling / TCP are opt-in with explicit warnings.
- **Developer features tab** — v0.16.0. New `/developer` route under its own sidebar group with live state of WSL, VirtualMachinePlatform, HypervisorPlatform, Hyper-V and Windows Sandbox via `Get-WindowsOptionalFeature`. Enable / disable streamed through `run_pty_script` into the global terminal panel. Read-only WSL distros list + Dev Drive support card. New Rust module `dev_features.rs` + 4 commands.
- **Apps catalog expansion (winget half)** — v0.17.0. 67 → 106 winget entries (+39 across all 8 groups). Every icon slug verified against the master lists of homarr-labs/dashboard-icons, simple-icons, selfh.st/icons; direct `https://…` URLs HTTP-probed for non-empty 200s. 3 candidates (lazygit, ExplorerPatcher, TreeSize Free) cut because no proper icon exists anywhere public. Choco support deferred to v0.18.0 as a separate scope.
- **Tweaks → 200** — v0.17.0. +20 entries across privacy / explorer / performance / notifications / security / memory. Closes most of the Sophia-Script depth gap.
- **Mass driver updates (non-GPU)** — v0.17.0. `/drivers` got a Windows Update driver-catalog scanner with class-grouping (Audio / Chipset / Display / Network / Storage / Input / Camera / Print / Other) and bulk-install. Reuses the existing WU + admin infrastructure instead of a new module.
- **USB-stick flasher + Install-Media correctness pass** — v0.18.0 → v0.18.3. New `usb_flash.rs` with single-FAT32 + DISM /Split-Image layout (handles install.wim > 4 GB without third-party UEFI:NTFS shims). Six install-breakers in the v0.13.0 unattend.xml generator fixed in real-install-log forensics: forced Disk-0 wipe removed, schema-invalid `<Reseal>` in specialize removed, KMS keys list rewritten against MS docs, deprecated SkipMachineOOBE/SkipUserOOBE removed, bogus HideLocalAccountScreen removed, blank-password handling fixed, RunSynchronous moved into Microsoft-Windows-Deployment component (Shell-Setup is not a valid parent in specialize — produced `0x80220001` schema error → setup.exe exit `0x1F` → reboot loop). AppX removal moved into `\$OEM$\$$\Setup\Scripts\setupcomplete.cmd` via UseConfigurationSet sidecar instead of inline base64 (which broke `CreateProcess`'s 8 KB command-line limit on Privacy Maximum's 30+ patterns). Plus live WU install progress streaming.
- **Aggressive bloatware killer** — v0.19.0. Pre-OOBE sponsored-apps blocker (HKLM CloudContent + WindowsStore + 18 HKU\.DEFAULT ContentDeliveryManager writes in specialize). Two-pass AppX removal in setupcomplete.cmd with 60s sleep. Patterns refreshed: MSTeams flagged `recommended:true`, `*Copilot*` wildcard, 8 explicit Sponsored-Apps publisher-prefixed namespaces (WhatsApp / Spotify / Disney+ / Netflix / TikTok / Instagram / Facebook / LinkedIn).
- **Install Media Task Sequence editor** — v0.20.0. `/install-media` replaces `/iso-builder`. Simple mode (default, 1-click) + Advanced mode (drag-drop editor, 11 step types, 6 templates). New step types beyond what v0.13.0 had: `driver-inject` (folder picker → `\$OEM$\$1\Drivers\`), `apps-install` (winget IDs appended to setupcomplete.cmd), `custom-cmd` (free-form command at any of 5 Setup hooks), `disk-setup` (opt-in fully-automated zero-click install with `<DiskConfiguration>`). New `generate_setupcomplete_cmd` Tauri command + `custom_commands` / `winget_apps` / `disk_auto_setup` fields on `UnattendConfig`. USB drive serial display now shows the Windows-derived hardware ID from `Get-Disk .UniqueId` instead of raw iSerialNumber descriptor (Kingston-style "0000000005||" garbage → stable 24-char hex ID).

---

## Scope expansions (more of what we already do)

These are "make existing categories bigger / deeper" — not new USPs but addressing specific gaps in the market-analysis table where competitors clearly out-scoped us.

### 1. Apps catalog → 150-200 entries with choco support (targeted for v0.18.0)

**Current.** 106 winget apps across 8 groups, 16 recommended (after v0.17.0).

**Gap.** ChrisTitusTech/winutil ships ~200+ apps via winget + choco. v0.17.0 closed the bulk of the winget gap (67 → 106) but stayed winget-only. Some niche dev / sysadmin tools only have choco packages.

**Work.** Add choco support alongside winget. New `installSources: ('winget'|'choco')[]` field on `AppEntry`, source badge per app card, fallback chain when one source doesn't have an ID. Rust `choco_*` bridge commands. Add another ~40 apps that are choco-only or benefit from dual-source resilience. Re-evaluate the 3 v0.17.0-cuts (lazygit / ExplorerPatcher / TreeSize Free) if anyone bothers to publish proper icons upstream.

**Effort.** Medium. Schema change touches `apps/catalog.ts` + Apps.svelte; new Rust module mirrors `winget.rs` patterns.

---

## Where these fit relative to v1.0.0

- **Required for v1.0.0:** nothing. There are no technical blockers; v1.0.0 ships when the polish + bugfix pass on the existing 36 routes is done.
- **Targeted for v0.18.0:** apps catalog #1 above (choco + remaining expansion) + polish.
- **Post-v1.0.0:** further depth (NTFS toggles, hardware quirks, per-app firewall blocks for 250 tweaks).

## Icon quality bar (set in v0.17.0)

Catalog additions now MUST have a verifiable icon before merging. The audit pipeline:

1. Resolve icon spec to a CDN URL via `iconUrl()`.
2. For `simple:` / `selfhst:` / homarr-default slugs, cross-reference the master list of each repo (pulled via the GitHub tree API) — slug must exist in the source repo.
3. For direct `https://…` URLs (raw GitHub asset paths), HTTP-probe for a non-empty 200.
4. `favicon:<domain>` is a soft fallback — Google's API serves a generic placeholder for any domain (even 404'd ones), so favicon entries should only be used when the domain's actual favicon is decent (probe and inspect size).
5. If none of the above yield a real icon, the app is **cut from the catalog** rather than shipped with an avatar or placeholder. v0.17.0 cut lazygit / ExplorerPatcher / TreeSize Free for this reason.

The audit script is ad-hoc Python that lives in conversation history, not in the repo. If we add 30+ apps in one release again, consider committing it to `scripts/`.

### Explicitly NOT a v1.0.0 blocker

- **i18n (DE + EN).** English-only is the shipping stance. May happen post-v1.0 as a nice-to-have (some inspiration: O&O ShutUp10 ships ~30 languages, Optimizer had 24), but it does **not** gate 1.0.

## Where these would NOT go

- Anything that **builds Reclaim a Windows installer ISO from scratch** (that's Tiny11Builder's territory, orthogonal — we install onto running systems).
- Anything that **edits arbitrary group policies via an `Edit GPO` UI** (gpedit.msc already exists, we'd just be a worse copy).
- Anything **AI-driven** — we're a tool against AI bloat, would be ironic.

## Marketing / reach (not technical but the largest single lever)

Out of scope for this file but worth one paragraph: the technical gap to WinUtil and Win11Debloat is small. The visibility gap is enormous. A "Why I built Reclaim" blog post linked from Reddit r/Windows11, r/sysadmin and HackerNews would move more needle than any single feature listed above. Mention from Chris Titus or a similar voice would 10× users in a week.
