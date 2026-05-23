# Phases Quick Index

One-page summary of every phase from `docs/ROADMAP.md`. Use this as the starting prompt for a new Claude session:

> "Read CLAUDE.md, docs/ROADMAP.md, and docs/PHASES_QUICK_INDEX.md. Start Phase N."

---

| Phase | Version | Theme | Effort | Files to create |
|---|---|---|---|---|
| 1 | v0.2.0 | Network & Hosts | ~6h | `src-tauri/src/network.rs`, `src/lib/network/{blocklists,dns}.ts`, `src/routes/{Hosts,Network}.svelte` |
| 2 | v0.3.0 | winget App Manager | ~6h | `src-tauri/src/winget.rs`, `src/lib/apps/catalog.ts`, `src/routes/Apps.svelte` |
| 3 | v0.4.0 | +50-100 tweaks | ~8h | extend `src/lib/tweaks/catalog.ts`; maybe new `Notifications.svelte` route |
| 4 | v0.5.0 | System Maintenance | ~6h | `src-tauri/src/maintenance.rs`, `src/routes/Maintenance.svelte` |
| 5 | v0.6.0 | Profile Builder + JSON I/O | ~5h | extend `src/lib/tweaks/profiles.ts`, `src/routes/{ProfileBuilder,Profiles}.svelte` |
| 6 | v1.0.0 | i18n + Portable + Onboarding + Updater | ~8h | `src/lib/i18n.ts`, `src/locales/*.json`, `src/routes/Onboarding.svelte`, updater config |

## Per-phase deliverables (checklist)

### Phase 1
- [ ] hosts read/write/backup Rust commands
- [ ] DNS get/set + DoH set Rust commands
- [ ] Builtin blocklists table + remote-fetch via tauri-plugin-http
- [ ] `/hosts` route with blocklist toggles + raw editor + restore
- [ ] `/network` route with DoH preset picker + per-adapter DNS
- [ ] Nav group "Network" added in Layout
- [ ] Both routes lite-mode-gated (banner if not admin)
- [ ] Log every blocklist apply/revert + DNS change

### Phase 2
- [ ] winget detection + JSON-ish parsing
- [ ] install/uninstall/upgrade Rust commands with event-stream progress
- [ ] App catalog (~70 entries) with groups
- [ ] `/apps` route mirroring Bloatware structure
- [ ] BulkActionBar for "Install N"
- [ ] Detect winget missing → install hint
- [ ] Log every install/uninstall

### Phase 3
- [ ] +50-100 catalog entries (use ROADMAP.md list as menu)
- [ ] Decide if new `Notifications` category gets its own route or folds into Privacy
- [ ] Update profile presets to reference relevant new tweaks
- [ ] All new tweaks have `defaultValue` or explicit `revert`

### Phase 4
- [ ] DISM/SFC/CleanMgr/WinSxS/Power/Network commands
- [ ] Event-stream pattern for long-running ops (Tauri events)
- [ ] `/maintenance` route with action cards + live output console
- [ ] Ultimate Performance power plan unlocker
- [ ] All ops admin-gated

### Phase 5
- [ ] Custom profile schema (versioned, `schemaVersion: 1`)
- [ ] Reactive customProfiles store with localStorage backing
- [ ] Profile-builder UI with tweak/bloat tree pickers
- [ ] Export to JSON via dialog plugin
- [ ] Import from JSON with validation
- [ ] `/profiles` route as full mgmt page
- [ ] Dashboard profile cards still show built-ins only

### Phase 6
- [ ] Minimal i18n store (no external dep)
- [ ] All `.svelte` strings via `t("...")` keys
- [ ] DE + EN locale JSON
- [ ] Portable mode detection (data dir vs exe-relative)
- [ ] Onboarding wizard for first launch
- [ ] Updater plugin configured with Ed25519 key
- [ ] AppData log mirror
- [ ] 1.0.0 announcement notes

## Conventions reminder

Before starting any phase:
1. Branch from `main`: `git checkout -b phase-N-shortname`
2. Bump version in `package.json` + `tauri.conf.json` + `Cargo.toml`
3. Update `CLAUDE.md` "Current state" line when feature lands
4. Always: `pnpm exec svelte-check` + `cargo check` before commit
5. Toast + activity log for every user-visible operation
6. Bridge layer for every Rust command — no raw `invoke()` in routes
7. Admin-check banner for every admin-requiring action
