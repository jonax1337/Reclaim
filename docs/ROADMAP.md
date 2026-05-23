# Reclaim — Phased Roadmap

Goal: become the most complete, transparent, and well-designed Windows debloater available. v0.1.0 already wins on UX, reversibility, and architectural cleanliness. These phases close the remaining feature-breadth gaps.

Each phase is **independent and self-contained**. Pick a phase, work through its tasks, ship as a minor version (`0.2.0`, `0.3.0`, …).

---

## Phase 1 — Network & Hosts (Privacy multiplier)

**Why first**: privacy is our brand. Block telemetry at the network layer, not just registry.

**Ship as `v0.2.0`.**

### Goals

1. hosts-file editor with curated telemetry blocklists
2. DNS-over-HTTPS toggle with provider presets (Cloudflare, Quad9, AdGuard)
3. Per-adapter DNS override

### Files to create

- `src-tauri/src/network.rs` — new module
  - `read_hosts() -> Result<String, String>` — read `C:\Windows\System32\drivers\etc\hosts`
  - `write_hosts(content: String) -> Result<(), String>` — backup current to `hosts.reclaim.bak` then write (atomic via temp + rename)
  - `apply_blocklist(name: String, entries: Vec<String>) -> Result<(), String>` — merge entries between sentinel comments like `# >>> Reclaim: Microsoft Telemetry`
  - `remove_blocklist(name: String) -> Result<(), String>`
  - `list_active_blocklists() -> Result<Vec<String>, String>` — scan hosts for sentinels
  - `get_dns_servers() -> Result<Vec<AdapterDns>, String>` — `Get-DnsClientServerAddress`
  - `set_dns_servers(adapter: String, ipv4: Vec<String>, ipv6: Vec<String>) -> Result<(), String>` — `Set-DnsClientServerAddress`
  - `set_doh_template(server_ip: String, template_url: String, dot_fallback: bool) -> Result<(), String>` — `Set-DnsClientDohServerAddress`

- `src/lib/network/blocklists.ts`
  ```ts
  export type Blocklist = {
    id: string;
    name: string;
    description: string;
    source: string;  // URL or "builtin"
    builtinEntries?: string[];  // for offline lists
  };
  export const BLOCKLISTS: Blocklist[] = [
    { id: "ms-telemetry", name: "Microsoft Telemetry", source: "builtin", builtinEntries: [...] },
    { id: "stevenblack-fakenews", name: "StevenBlack — Fake News", source: "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews/hosts" },
    // ...
  ];
  ```

- `src/lib/network/dns.ts`
  ```ts
  export const DOH_PROVIDERS = [
    { id: "cloudflare", name: "Cloudflare", ipv4: ["1.1.1.1", "1.0.0.1"], template: "https://cloudflare-dns.com/dns-query" },
    { id: "quad9", name: "Quad9", ipv4: ["9.9.9.9", "149.112.112.112"], template: "https://dns.quad9.net/dns-query" },
    { id: "adguard", name: "AdGuard DNS", ipv4: ["94.140.14.14", "94.140.15.15"], template: "https://dns.adguard.com/dns-query" },
    { id: "nextdns", name: "NextDNS (configured per-user)" },
  ];
  ```

- `src/routes/Hosts.svelte` — hosts editor UI
  - Top: list of blocklists with on/off switches (calls `apply_blocklist` / `remove_blocklist`)
  - Below: raw text editor (monospaced textarea) with "Save" + "Restore backup" buttons
  - Diff preview before save

- `src/routes/Network.svelte` — DNS + DoH UI
  - DoH preset picker (Cloudflare / Quad9 / AdGuard / NextDNS / Custom)
  - "Apply system-wide" button
  - Per-adapter table with current DNS, click to override

- Bridge wrappers in `src/lib/tweaks/bridge.ts`

### Nav changes

```ts
// In Layout.svelte navGroups, add a new group:
{
  label: "Network",
  items: [
    { href: "/hosts", label: "Hosts & blocklists", icon: ShieldOff },
    { href: "/network", label: "DNS & DoH", icon: Network },
  ],
}
```

### Technical notes

- **hosts write requires admin** — gate behind `admin.elevated`, show banner if not
- **Backup before every write**: always copy current hosts to `hosts.reclaim.bak` (in same directory) before modifying. Provide a "Restore last backup" button.
- **Sentinel pattern** for blocklists:
  ```
  # >>> Reclaim: Microsoft Telemetry
  0.0.0.0 vortex.data.microsoft.com
  0.0.0.0 settings-win.data.microsoft.com
  # <<< Reclaim: Microsoft Telemetry
  ```
  Parse / strip / replace these blocks; don't touch user-added lines outside them.
- **Network changes** flush DNS automatically: append `ipconfig /flushdns` to the script
- **DoH on Win11 22H2+** — older builds don't support it; check Windows build before showing toggle
- Use `tauri-plugin-http` (add to Cargo.toml) for fetching remote blocklists. Cache in localStorage.

### Verification

- Apply a blocklist → restart Edge → telemetry domains should resolve to `0.0.0.0`
- Remove → resolution comes back
- DNS provider switch → `Resolve-DnsName -DnsOnly google.com -Server <new-dns>` matches

---

## Phase 2 — App Manager via winget

**Why second**: winutil's killer feature. We can do it cleaner.

**Ship as `v0.3.0`.**

### Goals

1. Browse curated apps grouped by category (Browsers, Dev, Media, System, …)
2. Install via `winget` with --silent
3. List installed apps with upgrade-available indicator
4. Bulk install ("Dev essentials" preset)

### Files to create

- `src-tauri/src/winget.rs` — new module
  - `winget_available() -> bool` — `Get-Command winget`
  - `list_installed() -> Result<Vec<WingetPkg>, String>` — `winget list --output=json` (limited) or parse text
  - `list_upgradable() -> Result<Vec<WingetPkg>, String>` — `winget upgrade`
  - `install(pkg_id: String) -> Result<(), String>` — `winget install --id <id> --silent --accept-source-agreements --accept-package-agreements`
  - `uninstall(pkg_id: String) -> Result<(), String>`
  - `upgrade(pkg_id: String) -> Result<(), String>`

- `src/lib/apps/catalog.ts` — curated app list
  ```ts
  export type AppEntry = {
    id: string;          // winget id, e.g., "Mozilla.Firefox"
    name: string;
    description: string;
    group: "browsers" | "communication" | "dev" | "media" | "system" | "gaming" | "office";
    recommended?: boolean;
    homepage?: string;
  };
  export const APPS: AppEntry[] = [
    { id: "Mozilla.Firefox", name: "Firefox", description: "Open-source browser", group: "browsers", recommended: true },
    { id: "Brave.Brave", name: "Brave", description: "Privacy-focused Chromium", group: "browsers" },
    { id: "Microsoft.VisualStudioCode", name: "VS Code", group: "dev", recommended: true },
    { id: "Git.Git", name: "Git", group: "dev", recommended: true },
    { id: "7zip.7zip", name: "7-Zip", group: "system", recommended: true },
    { id: "VideoLAN.VLC", name: "VLC", group: "media", recommended: true },
    { id: "Notion.Notion", name: "Notion", group: "office" },
    { id: "Discord.Discord", name: "Discord", group: "communication" },
    { id: "Valve.Steam", name: "Steam", group: "gaming" },
    // … 60-80 total
  ];
  export const GROUP_LABELS: Record<string, string> = { ... };
  ```

- `src/routes/Apps.svelte` — app browser UI (mirror Bloatware.svelte structure):
  - Filter input + group sections + Card lists
  - Each row: name, description, "Install" button OR "Installed" badge with "Upgrade" if available
  - BulkActionBar for multi-install

- Bridge wrappers + log hooks

### Nav changes

```ts
// New group between "Clean up" and "Customize":
{
  label: "Install",
  items: [
    { href: "/apps", label: "Apps", icon: Download },
  ],
}
```

### Technical notes

- winget's JSON output is incomplete — `winget list` doesn't support `--output=json` reliably. Parse text output (columns: Name, Id, Version, Available, Source). Use `--accept-source-agreements`.
- Long-running install → emit progress events from Rust using Tauri's event system. Frontend listens, shows progress in toast or row spinner.
- Detect winget not installed → show banner with "Install from Microsoft Store" link
- Install operations need admin for system-wide; user-scope installs work without. Default to `--scope user` where possible.
- Don't run `winget` in elevated mode if not necessary — many packages prefer user-scope.

---

## Phase 3 — Tweak Breadth (+50-100 tweaks)

**Why**: SophiApp has ~300; we have ~60. Close the gap with quality, not just quantity.

**Ship as `v0.4.0`.**

### Tweaks to add (by category)

**Privacy** (~15):
- Disable IPv6 (optional, controversial — mark with warning)
- Disable hibernation file (already in Performance — verify no dup)
- Block telemetry hosts via Defender (firewall rules)
- Disable Inking & Typing personalization
- Disable Account Info access
- Disable Calendar app access to system
- Disable Contacts access
- Disable Diagnostic Data viewer
- Disable Connected Standby
- Disable Cloud-delivered protection (Defender — controversial, add warning)
- Disable SmartScreen for Edge
- Disable SmartScreen for Store apps
- Disable suggested news on lock screen
- Disable Customer Experience Improvement Program scheduled tasks (already in Performance — verify)
- Disable Compatibility Telemetry (the actual scheduled task)

**Explorer** (~10):
- Disable Quick Access in left pane
- Disable thumbnail caching on network folders
- Enable verbose driver / file copy details
- Disable check-disk on boot for specific drive
- Enable dark scrollbars
- Disable "- Shortcut" suffix on new shortcuts
- Compact mode in Explorer
- Show drive letters before names
- Disable Confirm File Delete dialog (off by default — Win11 changed it)
- Enable Show Status Bar

**Taskbar** (~8):
- Combine taskbar buttons (Never / When full / Always)
- Show small taskbar icons (Win10 throwback)
- Show labels on taskbar buttons
- Hide System Tray clock seconds (revert of clock-seconds)
- Enable end-of-life network indicator
- Restore Windows 10 file context menu styling
- Disable jump lists
- Hide "Search" box from taskbar entirely

**Performance** (~10):
- Disable Superfetch (already as SysMain in Services? cross-reference)
- Disable Windows Search indexing
- Disable Reserved Storage (frees ~7GB)
- Set Power Plan to Ultimate Performance (also Phase 4)
- Disable IPv6 transition tunneling (Teredo)
- Disable Connected Standby
- Increase NDU registry size
- Disable scheduled defrag for SSDs
- Disable NTFS last access timestamp updates
- Disable boot logo

**Search** (~5):
- Disable indexing in C:\
- Disable Recent items in Start
- Disable Windows.ai feature
- Disable suggested queries
- Disable safe search

**AI** (~5):
- Disable Image Creator in Paint
- Disable Generative Erase in Photos
- Disable AI in PowerToys (if installed)
- Disable Recall snapshot retention (separate from disabling Recall itself)
- Disable AI feedback in Office (registry-only)

**Updates** (~5):
- Disable preview builds via Insider channel
- Block specific KB number (registry HiddenUpdates list)
- Set active hours to extended range (e.g. 6-23)
- Pause updates 35 days
- Disable cumulative update auto-restart toast

**New: Notifications category** (~8):
- Disable all toast notifications
- Disable Action Center
- Disable notification sounds
- Disable specific app notifications (per-app from `Apps.Notifications` registry)
- Hide Defender notifications
- Hide Windows tips toasts
- Suppress "Setup your device" suggestions
- Disable focus assist (turn off DnD prompts)

### Implementation

Just extend `src/lib/tweaks/catalog.ts`. No new files. Add new `Tweak[]` exports per logical group:

```ts
export const NOTIFICATION_TWEAKS: Tweak[] = [...];
// And add "notifications" to TweakCategory union, create route Notifications.svelte
```

Add a Notifications route if you commit to that category.

---

## Phase 4 — System Maintenance

**Why**: power-user tools without command-line. Combines well with the Specs page.

**Ship as `v0.5.0`.**

### Goals

1. DISM / SFC / CleanMgr buttons with live console output
2. Power Plans manager (incl. Ultimate Performance unlock)
3. WinSxS shrink (`DISM /Online /Cleanup-Image /StartComponentCleanup /ResetBase`)
4. Memory diagnostic launch
5. Network reset (`netsh winsock reset` + IP reset)

### Files to create

- `src-tauri/src/maintenance.rs`
  - `run_dism_restore() -> ...` — long-running, streams progress events
  - `run_sfc() -> ...`
  - `run_cleanmgr(profile: u32) -> ...` — silent mode with sageset/sagerun
  - `shrink_winsxs() -> ...`
  - `list_power_plans() -> Result<Vec<PowerPlan>, String>` — `powercfg /list`
  - `set_power_plan(guid: String) -> Result<(), String>` — `powercfg /setactive`
  - `unlock_ultimate_performance() -> Result<(), String>` — `powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61`
  - `reset_network() -> Result<(), String>`

- `src/routes/Maintenance.svelte`
  - Card per operation with "Run" button + estimated duration + live output area
  - Use Tauri events for streaming PowerShell stdout to UI

- Bridge wrappers

### Nav changes

Add `Maintenance` under "System info" or new "Maintenance" group.

### Technical notes

- **Streaming output**: spawn the process, read stdout line by line, emit `maintenance:line` event. Frontend listens via `@tauri-apps/api/event` `listen()`.
- DISM and SFC can take 10-30 minutes. Show a clear "this will take a while" warning.
- Ultimate Performance plan unlock writes a new GUID; show in plans list after unlock.
- Network reset requires reboot — show toast warning.
- All maintenance ops require admin.

---

## Phase 5 — Profile UX (Custom Builder + Import/Export)

**Why**: lets users share configs ("here's my Reclaim profile").

**Ship as `v0.6.0`.**

### Goals

1. Custom profile builder: pick any subset of tweaks + bloatware, save to local list
2. Export profile to JSON file (Tauri dialog)
3. Import profile from JSON file
4. Share-ready format with schema version

### Files

- `src/lib/tweaks/profiles.ts` — extend
  ```ts
  export type ProfileV1 = {
    schemaVersion: 1;
    id: string;
    name: string;
    tagline: string;
    description: string;
    gradient: string;
    tweakIds: string[];
    bloatwarePatterns?: string[];
    custom?: true;  // user-created
    createdAt?: number;
  };
  ```
  - Add `customProfiles` reactive store backed by localStorage
  - `exportProfile(profile)` → JSON Blob → Tauri save dialog → write file
  - `importProfile(path)` → read file → parse → validate → add to custom list

- `src/routes/ProfileBuilder.svelte` — UI:
  - Multi-select tree of tweaks (grouped by category, with checkboxes)
  - Multi-select tree of bloatware
  - Name + description + tagline inputs
  - "Save" → adds to custom profiles
  - "Export" → JSON file
  - "Import" button at top of /profiles route

- `src/routes/Profiles.svelte` (new) — full profile management page
  - Built-in profiles (read-only)
  - Custom profiles (editable, deletable)
  - Import / Export / Create buttons

### Nav changes

Move /profiles into the System nav. Make Dashboard's profile cards just feature the built-ins.

### Technical notes

- Dialog plugin already loaded — `dialog.save()` + `dialog.open()` for file picker
- Schema versioning from day 1 so future imports stay compatible
- Validate imports strictly: ignore unknown tweak ids, warn user

---

## Phase 6 — Polish (i18n + Portable + Onboarding + Updater)

**Ship as `v1.0.0`.**

### Goals

1. **German + English localization** (DE first since dev is German, EN already the default)
2. **Portable mode**: detect missing install registry → store logs/profiles in app-relative `data/` folder
3. **First-run onboarding**: welcome dialog → "Create restore point?" → "Apply Reclaim Basics?"
4. **Auto-updater** via Tauri's updater plugin against GitHub releases
5. **Better animations**: route transitions, profile-apply progress, tweak-toggle ripple
6. **Crash-safe logs**: write to AppData log file in addition to localStorage

### Files

- `src/lib/i18n.ts` — minimal i18n store with `t("key")` and `locale.set("de" | "en")`
- `src/locales/en.json`, `src/locales/de.json` — string tables
- Refactor every `.svelte` to use `t()` instead of hardcoded English
- `src/routes/Onboarding.svelte` — first-launch wizard
- `tauri.conf.json` — add updater plugin config with public key + endpoint
- `src-tauri/src/lib.rs` — log to `%APPDATA%\Reclaim\activity.log` as backup

### Technical notes

- Don't pull `svelte-i18n` if a 50-line custom impl works. Keep dependencies lean.
- For portable mode: check if exe is in `%PROGRAMFILES%` → installed, else portable. Use `dirs::data_dir()` vs exe-relative path.
- Updater needs Ed25519 keypair — generate via `pnpm tauri signer generate`, publish `latest.json` to GH releases.
- Onboarding only shows on `localStorage["reclaim.onboarded"] !== "1"`.

---

## Cross-cutting future ideas (not phased)

These could slot into any phase or become a "Phase 7+":

- **Defender exception manager** — toggle SmartScreen, real-time protection, cloud protection per setting (privacy/perf tradeoff)
- **Browser tweaks** — Edge policies for hub sidebar, copilot, news feed (some already covered)
- **OneDrive removal** with backup of personal folders
- **Telemetry firewall** — auto-block list of MS telemetry IPs via Windows Firewall rules
- **Right-click menu editor** — add/remove ShellEx entries
- **Schtasks tree** — full scheduled task browser like Services route
- **Driver rollback** — list installed driver versions, roll back via pnputil
- **Edge → default app** override for PDF/PNG/HTML
- **Recall data wipe** if Recall was enabled previously
- **Wallpaper / Lock screen customizer**
- **Sound scheme picker**
- **Mass file unblock** (Zone.Identifier removal for downloaded files)

---

## Conventions for every phase

1. **Always run `pnpm exec svelte-check` + `cargo check` before declaring done.** Zero errors, zero warnings.
2. **Every Rust command → bridge.ts wrapper → typed.** No raw `invoke()` in routes.
3. **Every destructive operation logs to activity log.** Use `log.success/error/warn` from `$lib/log.svelte`.
4. **Every operation that requires admin → check `admin.elevated`, show banner if not.**
5. **Every external URL → through `tauri-plugin-opener.openUrl`.**
6. **Update `CLAUDE.md` "Current state" after each phase.**
7. **Bump version in `package.json`, `tauri.conf.json`, `Cargo.toml` (all three).**
8. **No German UI strings** until Phase 6 introduces i18n.

## Phase ordering rationale

- Phase 1 (Network) is the **highest-impact privacy feature** — telemetry hosts blocked at network is more thorough than registry alone.
- Phase 2 (winget) is the **biggest user-visible feature** — turns Reclaim into a full setup tool.
- Phase 3 (Breadth) is the **simplest in code** but the most tedious — best to do when you have a slow week.
- Phase 4 (Maintenance) is **polish for power users** — adds depth.
- Phase 5 (Profile UX) is when **community sharing** becomes possible — sets up viral growth.
- Phase 6 (Polish) is when we **call it 1.0** — i18n + portable + onboarding + updater.

If you're impatient: Phase 1 + 2 + a slice of Phase 3 already make Reclaim objectively the most complete GUI debloater. Phase 6 just makes it shippable as a product.
