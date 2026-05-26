# Reclaim — Design System

> Every route composes from a small set of primitives in `src/lib/ui/`. No more
> hand-rolled `<header class="mb-6"><h1 class="text-3xl …">…`, manual `card-inset
> overflow-hidden gap-0 py-0` wrappers, or one-off amber banners.
>
> **Status**: implemented. The original scaffold from earlier in the project has
> been built out. Migration plan §7 is fully shipped — see [§5 below](#5--migration-status).

---

## 1. Foundation — tokens

Source of truth: `src/app.css` (`@theme inline` + `:root` / `[data-theme="dark"]`).
**Do not introduce new raw `oklch(…)` / `#hex` literals in components** — always
reference a token.

### 1.1 Color tokens

| Token | Tailwind class | Use |
|---|---|---|
| `--background` | `bg-background` | Window body |
| `--foreground` | `text-foreground` | Default body text |
| `--card` | `bg-card`, `bg-card/95` | Card surface (almost always `/95` + `backdrop-blur-md` to sit over Mica) |
| `--card-foreground` | `text-card-foreground` | Text inside cards |
| `--popover` | `bg-popover` | Dropdown menus, dialogs, select content |
| `--primary` | `bg-primary`, `text-primary` | Brand purple, selection highlight, recommended badge, active state bar |
| `--primary-foreground` | `text-primary-foreground` | Text on primary surfaces |
| `--secondary` | `bg-secondary` | Quiet button background |
| `--muted` | `bg-muted` | Progress-bar track, subtle bg |
| `--muted-foreground` | `text-muted-foreground` | All secondary copy, hint text |
| `--accent` | `bg-accent` | Hover backgrounds (`hover:bg-accent/40`, `/60`) |
| `--destructive` | `bg-destructive`, `text-destructive` | Delete, uninstall, "revert all" |
| `--success` | `text-success`, `bg-success/15` | Licensed, "Recommended" badge, "No bloatware" |
| `--border` | `border` (default) | Default hairline |
| `--ring` | `focus-visible:ring-ring/50` | Focus rings (3px) |

### 1.1b Surface ladder

For chrome surfaces (panel backgrounds, hover variants, selectable-tile rest state, etc.).
These replaced the ~80 raw `bg-foreground/[0.0X]` usages that were scattered through the
codebase. **All seven are derived from `--foreground` via `color-mix`** — they
automatically invert in dark mode.

| Token | Alpha | Tailwind | Use |
|---|---|---|---|
| `--surface-1` | 2% | `bg-surface-1` | SelectableTile rest, lowest-emphasis surface |
| `--surface-2` | 3% | `bg-surface-2` | Subtle info banner bg, code preview |
| `--surface-3` | 4% | `bg-surface-3` | Hover variant of surface-1, sidebar bg |
| `--surface-4` | 6% | `bg-surface-4` | IconTile chip, footnote box, gradient swatch |
| `--surface-chrome` | 2.5% | `bg-surface-chrome` | Titlebar, panel header, footer chrome |
| `--hairline` | 8% | `border-hairline`, `divide-hairline` | Default border for surface boxes |
| `--hairline-strong` | 10% | `border-hairline-strong` | Card border, hero border |

**Warning color**: handled via direct Tailwind `amber-*` (light: `text-amber-{600,700,900}`,
dark: `text-amber-{200,300,400}`, surface: `bg-amber-500/{10,15,25}`, border: `border-amber-500/40`).
This is the project's convention and is consistent across `AdminBanner`, `InfoBanner` warning tone,
`StatusPill` warning tone, `StatusAvatar` warning tone, `Badge` warning variant, and TweakRow's
warning text. Same goes for `red-*` (used in DiskSetup error banner via `InfoBanner tone="error"`).

### 1.2 Radii

| Class | Used for |
|---|---|
| `rounded-md` | Buttons, inputs, Badge |
| `rounded-lg` | Inner panels, IconTile, small Cards |
| `rounded-xl` | Cards (baked into `<Card>`), InfoBanner `size="md"` |
| `rounded-2xl` | Hero (`<HeroBanner>`), BulkActionBar pill, StatusAvatar, InfoBanner `size="lg"` |
| `rounded-full` | StatusPill, MetricBar fill, status dots |

### 1.3 Typography

Geist Variable (sans) + Geist Mono Variable (mono). Body 14px with
`font-feature-settings: "cv11", "ss01"`.

| Role | Class recipe | Primitive |
|---|---|---|
| Page title | `text-3xl font-semibold tracking-tight` | `<PageHeader>` |
| Section heading | `text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70` | `<SectionHeading>` |
| Card title | `text-base font-semibold tracking-tight` | `<CardTitle>` |
| Row title | `text-sm font-medium` | (use directly) |
| Body / row description | `text-xs text-muted-foreground leading-relaxed` | (use directly) |
| Tiny caps label | `text-xs text-muted-foreground uppercase tracking-wider` | (use directly — in StatTile labels) |
| Hyper-tiny caps | `text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70` | sidebar group label, sublist divider, dropdown group label — specialized chrome, not abstracted |
| Tabular numbers | always add `tabular-nums` | — |

### 1.4 Spacing scale

| Value | Purpose |
|---|---|
| `gap-1.5` | Icon-to-label inside Badge / chip |
| `gap-2` | Header right-side button cluster, badge row |
| `gap-3` | Card-internal three-block layout (icon · text · arrow) |
| `gap-4` | Stat-tile rows (Dashboard) |
| `gap-3` | Category/profile card grids |
| `gap-6` | Outer page section spacing, default Card content spacing |
| `mb-6` | Page header bottom, between sections |
| `mb-8` | After top stat row, before subsection heading |
| `mb-3` | After section heading, before grid |
| `mb-2` | After SectionHeading default |

If you write `mb-7` or `gap-5`, you've drifted. Pick a value above.

### 1.5 Elevation / surfaces

| Surface | Recipe / primitive |
|---|---|
| Page body | Mica via `tauri.conf.json`; body has translucent fallback |
| Sidebar | `bg-foreground/[0.04] backdrop-blur-xl sidebar-bg` |
| Hero banner | `<HeroBanner tone>` — wraps the hero shell + glow |
| Card | `<Card>` — `rounded-xl border bg-card/95 backdrop-blur-md py-6 gap-6 shadow-sm` |
| Card with subtle inner highlight | add `card-inset` class — `<Card class="card-inset">` |
| List card | `<ListCard>` — `<Card>` with `overflow-hidden gap-0 py-0 card-inset` baked in |
| Hover-lift | `hover:-translate-y-0.5 hover:shadow-md transition-all duration-200` (used by CategoryCard, ProfileCard) |
| Floating | `<BulkActionBar>`, Dialog — fixed position with stronger shadow |

### 1.6 Iconography

- `@lucide/svelte` everywhere. Custom SVG only for `OneDriveIcon`.
- Sizes: `size-2.5` in Badge, `size-3` in StatusPill, `size-3.5` in row hints,
  `size-4` standard inline / IconTile / Button slot, `size-5` hero icon,
  `size-6` loading spinner, `size-8` StatusAvatar icon.

### 1.7 Motion

| Utility | When |
|---|---|
| `animate-route` | Mounted on route root for fade-in (180ms) — Layout-managed |
| `animate-enter` | Single element fade+rise (220ms) |
| `stagger` | Container; children fade+rise with 30ms staggered delay |
| `transition-all duration-200` | Hover lifts |
| `fly={{ y: 24, duration: 240, easing: cubicOut }}` | BulkActionBar |

All honor `prefers-reduced-motion` via `app.css @layer utilities`.

---

## 2. Primitives — `src/lib/ui/`

### Foundational

| Primitive | API highlights |
|---|---|
| `Button` | `variant: default \| destructive \| outline \| secondary \| ghost \| link`, `size: default \| sm \| lg \| icon`, `href` for link variant |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` | Composition slots. Override `py-0 gap-0` for list cards (or use `<ListCard>`) |
| `Badge` | `variant: default \| secondary \| outline \| success \| warning \| destructive` |
| `Switch`, `Checkbox` | `bind:checked` + `onCheckedChange`. Mark parent with `data-no-select` if inside a click-to-select row |
| `Dialog` | Confirmations, previews, raw editors |
| `Select.*` | Bits-UI wrapper |
| `Titlebar` | Custom drag-region + traffic lights |
| `Toaster` + `toast` | `success / error / warning / action / show` |
| `BulkActionBar` | Floating selection-actions bar |

### Layout primitives

| Primitive | API highlights | Used at |
|---|---|---|
| `PageHeader` | `title` (string), `description` (string) OR children snippet, `actions` snippet, `above` snippet (for back-link) | every route header (~30 sites) |
| `SectionHeading` | `title`, `hint` for right-side text, `actions` snippet for right button, `inline` snippet for `(suffix)`, `level: h2 \| h3 \| h4`, `class` for margin overrides | 33 sites |
| `HeroBanner` | `tone: default \| success \| warning \| none`, `withDots` (Dashboard's dot pattern) | Dashboard, Activation, OneDrive (2×) |
| `EmptyState` | `loading` → spinner, `icon` → custom icon, `iconClass`, `class` for `py-16` overrides — defaults to Card-wrapped centered message | ~30 sites across 18 files |
| `ListCard` | `<Card>` with `overflow-hidden gap-0 py-0 card-inset` baked in | 28 list shells |
| `ListRow` | `align: start \| center`, `density: sm \| md` (py-3 / py-4), `interactive` (cursor-pointer) | 10 simple rows; complex rows (TweakRow, Apps/Bloatware selectable rows, Defender/Firewall/WindowsUpdate state-driven rows) intentionally not migrated |
| `AdminBanner` | `title`, `description` (md), `hint` (sm), `size: sm \| md`, `requireAutoCheck`, `declinedToast` | Top-of-route admin banner + TweakSection's inline "X tweaks hidden" small variant |

### Visual primitives

| Primitive | API highlights | Used at |
|---|---|---|
| `MetricBar` | `value` (0-100), `size: sm \| md`, `tone: primary \| success \| warning` | Dashboard StatTile, ProfileCard, Profiles list (2×), Specs RAM |
| `IconTile` | `size: sm (8) \| md (9) \| lg (10)`, `radius: md \| lg`, `interactive` (group-hover effect) | Dashboard categories (via CategoryCard), ProfileCard, Profiles rows (2×) |
| `StatTile` | `label`, `icon` (Component), `value`, `total` (shown as `/N`), `loading` (Loader2 spinner), `hint`, `footer` snippet | Dashboard (3×) |
| `CategoryCard` | `href`, `icon`, `label`, `description`, `count`, `countSuffix` (default "entries") | Dashboard (14× per iteration) |
| `StatusPill` | `tone: neutral \| muted \| success \| warning`, `icon` (Component) or children, `onclick` (renders `<button>`) vs span, `style` (for `-webkit-app-region`) | Layout titlebar (3×: Terminal, Admin, Elevate), Developer feature pills (2×) |
| `StatusAvatar` | `tone: neutral \| muted \| success \| warning \| primary`, `icon` (Component) or children — size-16 rounded-2xl hero icon | Activation hero, OneDrive (2× — uninstall confirmation + hero) |
| `InfoBanner` | `tone: info \| warning \| success \| error`, `size: xs \| sm \| md \| lg`, `icon` override, `iconClass` override | Activation 3×, OneDrive dialog, ContextMenu help text, InstallMedia 3× (error/warning xs variants), DiskSetupStep error |
| `SelectableTile` | `selected`, `onclick`, `tone: default \| danger`, `size: sm \| md` — the click-to-toggle option card used everywhere in Task Sequence steps | 7 task sequence step files (Bypass, Privacy, OobeSkip, DiskSetup, AppsInstall, RegTweaks, DebloatAppx) |
| `DataField` | `label`, `value` or children, `mono` (font-mono tabular-nums), `class` — the "tiny caps label + value" pair | Specs CPU (4×), Specs GPU (4×), AI status grid (4×) — more sites to migrate as encountered |
| `CheckboxLabel` | `bind:checked`, `disabled`, `icon` (optional inline), `label`, children for description | OneDrive backup + uninstall (6×), AI Recall wipe options (2×) |
| `SearchInput` | `bind:value`, `placeholder`, `class` (for container width) | 6 sites (Apps, Bloatware, ContextMenu, ScheduledTasks, Services, Startup) |
| `SegmentedControl<T>` | Generic over string union. `options: {value, label, icon}[]`, `value`, `onChange` | Settings theme picker |

---

## 3. Page recipes

### 3.1 Tweak-category page (Privacy, Search, AI, Explorer, …)

```svelte
<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { PRIVACY_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Privacy"
  description="Telemetry, advertising ID, activity history, location tracking."
/>

<TweakSection tweaks={PRIVACY_TWEAKS} />
```

That's it. 13 lines for an entire route.

### 3.2 Action / detail page (Activation, Defender, Hosts, Network, Maintenance, …)

```svelte
<PageHeader title="…" description="…">
  {#snippet actions()}<Button>Refresh</Button>{/snippet}
</PageHeader>

<AdminBanner … />                  {/* if admin-only */}

<HeroBanner tone="success">…</HeroBanner>   {/* if binary state */}

<SectionHeading title="…" />
<ListCard>
  {#each items as item}
    <ListRow>…</ListRow>
  {/each}
</ListCard>

{#if loading}<EmptyState loading>…</EmptyState>{/if}
```

### 3.3 Dashboard

The v1.1 dashboard is intentionally permanent: KPI tiles + activity feed + per-category coverage. Profile cards and category shortcuts were removed because they duplicated the dedicated Profiles tab and the sidebar respectively.

```svelte
<HeroBanner withDots>
  …eyebrow, title, "Apply all recommended" + "Create restore point" actions…
</HeroBanner>

<AdminBanner … />

<!-- KPIs: 4 tiles -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger">
  <StatTile label="Active tweaks" icon={Shield} value={n} total={N} {loading}>
    {#snippet footer()}<MetricBar value={progress} class="mt-3" />{/snippet}
  </StatTile>
  <StatTile label="Recommended pending" icon={Sparkles} … />
  <StatTile label="Bloatware patterns" icon={Package} … />
  <StatTile label="Profiles available" icon={Wand} … />
</div>

<!-- Last 6 user-visible log entries; filters out NOISE_ACTIONS -->
<SectionHeading title="Recent activity">
  {#snippet actions()}<a use:link href="/logs">Open log →</a>{/snippet}
</SectionHeading>
<Card class="card-inset mb-8">
  <CardContent>
    <ul class="divide-y divide-hairline">
      {#each recentEntries as e}<li>…icon, target, action label, relative time…</li>{/each}
    </ul>
  </CardContent>
</Card>

<!-- Permanent per-category snapshot: applied/total + mini progress bar -->
<SectionHeading title="Catalog coverage" hint="applied tweaks per category" />
<Card class="card-inset">
  <CardContent>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
      {#each categoryStats as c}
        <div>
          <div class="flex items-baseline justify-between">
            <span class="text-xs font-medium">{c.label}</span>
            <span class="text-[10px] tabular-nums">{c.applied}/{c.total}</span>
          </div>
          <div class="mt-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div class="h-full bg-primary" style:width={`${c.pct}%`}></div>
          </div>
        </div>
      {/each}
    </div>
  </CardContent>
</Card>
```

Dashboard is ~330 LOC in v1.1 (was ~180 after the initial v1.0 redesign). Most of the new weight is the activity-feed render + the 12-category stats grid.

### 3.4 Settings / form page

```svelte
<PageHeader title="Settings" description="…" />

<div class="flex flex-col gap-6">
  <Card>
    <CardHeader>
      <CardTitle>Appearance</CardTitle>
      <CardDescription>…</CardDescription>
    </CardHeader>
    <CardContent>
      <SegmentedControl options={…} value={theme.mode} onChange={(v) => theme.set(v)} />
    </CardContent>
  </Card>
  …
</div>
```

---

## 4. Anti-patterns

1. **Wrapping `<Card>` with another padding div.** Card has `py-6 gap-6` baked in. Use
   `<CardContent>` (px-6) or override `py-0 gap-0` for list cards (or just use `<ListCard>`).
2. **Hand-rolled `<button class="rounded-md bg-primary …">`.** Use `<Button>`.
3. **`<h1 class="text-3xl font-semibold tracking-tight">` in a route.** Use `<PageHeader>`.
4. **Raw `<h2 class="text-xs font-semibold uppercase tracking-[0.12em] …">`.** Use `<SectionHeading>`.
5. **New raw `emerald-`, `sky-`, `rose-` colors.** Use `text-success`, `text-destructive`,
   etc. (Amber is the exception — it's the convention for warning UI.)
6. **Hand-rolled `grid place-items-center size-10 rounded-lg bg-foreground/[0.06] …`.**
   Use `<IconTile>`. For the size-16 hero variant, use `<StatusAvatar>`.
7. **Hand-rolled `<div class="h-1 rounded-full bg-muted overflow-hidden">…<div bg-primary />`.** Use `<MetricBar>`.
8. **Inline `<div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 …">`.** Use `<InfoBanner tone="warning">`.
9. **Inline pill `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider …">`.** Use `<StatusPill>`.
10. **Inline `<div class="relative"><Search /><input class="w-full h-9 pl-9 …">`.** Use `<SearchInput>`.
11. **Hand-rolled empty/loading state.** Use `<EmptyState>` (defaults to Card+centered; pass `loading` for spinner; pass `icon` for icon-driven empty).
12. **Fresh `mb-7`, `gap-5`, `py-3.5`.** Pick from the scale (§1.4).
13. **Mixing radii inside one widget.** Pick one elevation level per surface.
14. **New `@keyframes` without a `@media (prefers-reduced-motion: reduce)` override.**
15. **Raw `bg-foreground/[0.0X]` or `border-foreground/X` for surface chrome.** Use the
    surface ladder: `bg-surface-1/2/3/4`, `bg-surface-chrome`, `border-hairline`,
    `border-hairline-strong` (§1.1b).
16. **Hand-rolled selectable button card** (`<button class="flex items-start gap-3 px-3 py-2.5 rounded-md border …">` with primary/hairline conditional). Use `<SelectableTile>`.
17. **Hand-rolled `<label class="flex items-start gap-3 p-3 rounded-lg border …"><Checkbox />…`.** Use `<CheckboxLabel>`.
18. **Hand-rolled `<div><div class="text-[10px] uppercase">Label</div><div>{value}</div></div>`.** Use `<DataField>`.

---

## 5. Migration status

All 13 steps of the original migration plan are shipped, plus 4 follow-up primitives
extracted from patterns discovered during migration.

| Primitive | Sites migrated |
|---|---|
| ✅ `PageHeader` | ~30 routes |
| ✅ `SectionHeading` | 33 places in 15 files |
| ✅ `MetricBar` | 5 |
| ✅ `IconTile` | 4 (+ used internally by CategoryCard) |
| ✅ `StatTile` | 3 (Dashboard) |
| ✅ `CategoryCard` | 14 (Dashboard) |
| ✅ `HeroBanner` | 4 |
| ✅ `EmptyState` | ~30 across 18 files |
| ✅ `AdminBanner` size="sm" variant | 1 (TweakSection inline replaced) |
| ✅ `ListCard` | 28 pairs across 19 files |
| ✅ `ListRow` | 10 simple sites (complex state-driven rows intentionally left as components) |
| ✅ `SegmentedControl<T>` | 1 (Settings theme picker, type-safe via Svelte 5 generics) |
| ✅ Warning color: Badge variant cleaned, `text-emerald-500` → `text-success`, Activation amber Badge → `variant="warning"` | 3 |
| ✅ Lint sweep | done |
| ✅ `SearchInput` | 6 sites |
| ✅ `StatusPill` | 5 sites (Layout titlebar 3×, Developer 2×) |
| ✅ `StatusAvatar` | 3 sites |
| ✅ `InfoBanner` | 5 sites |
| ✅ Unused `Card` import cleanup | 10 files |

Total: **~290 migration sites** across **~35 files**. Zero `pnpm check` errors/warnings
throughout.

### Phase 6 — Surface tokens + Task-Sequence primitives

| Primitive / token | Sites migrated |
|---|---|
| ✅ Surface ladder tokens (`--surface-1..4`, `--surface-chrome`, `--hairline`, `--hairline-strong`) | **101 replacements** across 32 files — all raw `bg-foreground/[0.0X]` and `border-foreground/X` swapped for semantic tokens |
| ✅ `SelectableTile` | 7 task sequence step files |
| ✅ `DataField` | 11 sites (Specs CPU + GPU grids, AI Recall status grid) — more to migrate over time |
| ✅ `CheckboxLabel` | 8 sites (OneDrive 6×, AI 2×) |
| ✅ `InfoBanner` extended (xs size + success/error tones) | 4 InstallMedia status-row sites + DiskSetupStep error banner |
| ✅ Remaining ListCard strays (Activation, StepCard) | 2 |
| ✅ Unused `Search` icon imports cleanup | 5 files |

### Phase 10 — Second deep audit (4 more agents) — 4 new primitives

User explicitly asked: "Geh nochmal alles durch, man kann sich nicht sicher genug sein." Spawned 4 more Explore agents on areas not yet deep-audited: forms/inputs, InstallMedia, button/clickable patterns, and Logs/ScheduledTasks/Drivers-WU.

| New primitive | API | Migrated sites |
|---|---|---|
| ✅ `FilterChip` | `selected`, `count`, `onclick` — the `h-8 px-3 rounded-md` toggle pill | Logs (5 chips), WindowsUpdate (5 chips) |
| ✅ `TextLink` | `onclick`, `size: xs\|sm` — replaces `<button class="text-primary hover:underline">` | Bloatware (group select-all), ProfileBuilder (2× tweak/bloat select-all), InstallMedia ("Use last built ISO") |
| ✅ `FormField` | `label`, `hint`, `class` (gap-1.5 baked in) — replaces `<label class="flex flex-col gap-1.5"><span class="text-xs font-medium text-muted-foreground">…</span>…</label>` | ProfileBuilder (3 form fields), Network DNS dialog (2), Defender exclusion dialog (1), InstallMedia (5+ Selects/Inputs) |
| ✅ `TextInput` | `bind:value`, `placeholder`, `mono`, `readonly`, `disabled` — wraps the canonical `h-9 rounded-md border bg-card px-3 text-sm focus-visible:ring` | All sites above |

| Other fixes | Detail |
|---|---|
| ✅ ScheduledTasks task rows | Hand-rolled `<div class="flex items-start gap-3 py-3 px-5 border-b ...">` → `<ListRow class={note ? "bg-amber-500/[0.04]" : ""}>` |
| ✅ Drivers WU driver-class divider | Inline `<div class="px-5 py-2 ... text-[10px] font-semibold uppercase ...">` → `<SectionHeading level="h3" hint={...} class="mb-0">` inside the container |
| ✅ Hosts row-action `pt-1` → `pt-0.5` | Last `pt-1` outlier (all others were `pt-0.5`) |
| ✅ InstallMedia USB drive tile | Hand-rolled selectable button → `<SelectableTile>` (already a primitive!) |
| ✅ InstallMedia USB-empty info | Hand-rolled box → `<InfoBanner size="xs" icon={Usb}>` |
| ✅ InstallMedia `labelClass` const removed | All its uses migrated to `<FormField>` |
| ✅ Activation/OneDrive `HeroBanner`/`StatusAvatar` imports | Cleaned (now used internally by StatusHero) |

### Phase 9 — StatusHero (Activation + OneDrive hero card pattern)

User asked: "Hast du für diese Banner wie bei OneDrive und Activation auch ein UI Ding erstellt?"

Spot-on — those two heroes had IDENTICAL structure (HeroBanner + `px-7 py-6 flex flex-wrap items-start gap-5` + StatusAvatar + Title row with Badges + Description + optional `<dl>` details), just hand-copied. Created `<StatusHero>` to absorb it.

API:
- `tone` (HeroBanner tone) + `avatarTone` (defaults to a sensible mapping; override for cases like OneDrive's `neutral` brand-white avatar over the `default` hero)
- `title` (string)
- `avatar` snippet (icon or img content for the StatusAvatar)
- `badges` snippet (Badge components next to title)
- `description` (string) OR children (rich content with inline `<code>` etc.)
- `details` snippet (dt/dd pairs — caller controls dt styling since responsive label style differs per route)

Migrations: 2 sites (Activation hero, OneDrive hero status card). Each route dropped ~50 lines of identical wrapper markup.

### Phase 8 — Multi-agent UX/UI QA sweep

Spawned 4 parallel Explore agents to audit Card consistency, Section/spacing, List-row layouts,
and Typography micro-patterns. Findings → fixes:

| Issue | Fix |
|---|---|
| Developer.svelte:182/188 `<Card class="p-6">` for "browser preview" / "not elevated" states | → `<EmptyState>` (the canonical empty-state primitive) |
| Developer.svelte:238 row description used `mt-0.5` (all others use `mt-1`) | Unified to `mt-1 leading-relaxed` |
| ContextMenu.svelte:211 right-action wrapper used `pt-1` (all others use `pt-0.5`) | Unified to `pt-0.5` |
| ProfileBuilder.svelte:184 inner div used `py-5` (all others use `py-4`) | Unified to `py-4` |
| Defender exclusions intro paragraph above ListCard | Migrated to `<SectionHeading description>` |
| Firewall `<p>` intro with inline `<code>` above ListCard | Migrated to `<SectionHeading>{rich children}</SectionHeading>` — extended SectionHeading to accept children slot for rich-content descriptions when string isn't enough |
| Drivers 2× intro paragraphs above driver-packages + WU-catalog sections | Migrated to SectionHeading children slot |
| Firewall had NO section heading (flat structure) | Added `<SectionHeading title="Telemetry blocks">` with the inline description |

### Phase 7 — Row icon unification + Developer's gold standard

User feedback: Developer's row cards are 100× cooler than Firewall/DNS — the icon container
(`size-9 rounded-md bg-surface-3 border border-hairline text-muted-foreground`) is more
refined than the older `bg-accent/60` pattern. Plus Developer's section headings were
hand-rolled `<h2 class="text-sm font-semibold tracking-tight">` instead of using
`<SectionHeading>`.

| Primitive | Sites migrated |
|---|---|
| ✅ `RowIcon` (caller provides only `icon`+`tone`+optional `iconClass`, rest predefined) | **17 sites** across Apps (image), Bloatware (image), ContextMenu (neutral), Developer (neutral 2×), Firewall (neutral state-color), Hosts (neutral 2-state), Maintenance (4: 3 primary + Power neutral), Network (preset primary + adapter neutral), Services (neutral state-color), Startup (image), WindowsUpdate (neutral 2-state), ProfileBuilder (2 muted sm) |
| ✅ `SelectableListRow` (label-wrapped selectable row with RowAccent baked in) | 3 sites (Apps, Bloatware, WindowsUpdate selectable rows) |
| ✅ `SectionHeading` extended with `description` prop | Developer 5 sections (Linux on Windows / Virtualization / Windows Sandbox / WSL distros / Dev Drive) — descriptions preserved while migrating away from hand-rolled `<h2>+<p>` |
| ✅ State-driven row bg + RowAccent cleanup | Firewall (2× rows), Defender (2× toggle rows), TweakRow (on-state bg dropped, selection still highlighted) — Developer-style clean rows where state is communicated via Switch position / StatusPill, not row tint |
| ✅ DataField in Drivers GPU cards (4×) + InfoBanner xs success in "Installer downloaded" | 5 sites |
| ✅ InstallMedia ADK status as dynamic-tone InfoBanner | 1 (3-state info/success/warning with conditional icon + MetricBar inside) |
| ✅ Activation "Methods at a glance" list → 5× `<ListRow>` | 5 sites |
| ✅ Maintenance Cleanmgr + Memory diag inline rows → `<ListRow>` | 2 sites |
| ✅ Specs disk usage progress bar → `<MetricBar tone="destructive\|warning\|primary">` | 1 site (MetricBar extended with `destructive` tone) |
| ✅ Settings about-card Info note → `<InfoBanner size="xs">` | 1 site |
| ✅ Unused `cn` import cleanup post-migration | 4 files (Defender, Firewall, Maintenance, Services) |

---

## 6. What was intentionally *not* extracted

These have low-ROI or higher complexity than payoff:

- **TweakRow** — state-driven hover (`selected ? "bg-primary/[0.08]" : localOn ?
  "bg-primary/[0.03]" : "hover:bg-accent/40"`) is too custom to absorb into ListRow.
- **Apps / Bloatware / WindowsUpdate selectable rows** — each has `relative` + 2px
  primary accent bar + custom selected-state bg. The accent bar pattern could be a
  `<RowAccent active>` component (6 sites: TweakRow, Apps, Bloatware, Defender ×2,
  Firewall, WindowsUpdate, BackgroundServiceCard) but would need each row to be
  restructured.
- **Defender / Firewall state-driven rows** — same shape as TweakRow but driven by
  service state instead of user toggle.
- **`text-[10px]` "tiny caps"** in Layout sidebar group label, Activation panel header,
  Drivers sublist divider, Select dropdown label — same styling family as
  `SectionHeading` but smaller scale and in-chrome context. Specialized, only 4 sites.
- **ProfileBuilder gradient swatch** — interactive selectable size-9 button with
  `ring-2 ring-primary` selected state. Not a fit for `IconTile`.
- **Logs filter chip row** — `h-8 px-3 rounded-md text-xs font-medium border` with
  active/inactive states. Different shape than `StatusPill` (which is small
  rounded-full uppercase). One-off in Logs; could be a `FilterChipGroup<T>` later.
- **Activation activation-script Card** — bespoke layout with copy button, code
  preview, info banner. Already uses the new primitives where they fit.

---

## 7. Open questions

- Should the 6 "selectable row with primary accent bar" patterns share a
  `<SelectableListRow>` or `<RowAccent>` primitive? Saves ~10 lines per usage but
  risks coupling.
- `<TinyCaps>` primitive for the four `text-[10px]` chrome labels? Probably not —
  contexts differ too much.
- Should we tokenize `--warning-surface`, `--warning-border`, `--warning-fg` instead
  of using raw `amber-*` everywhere? Current consensus: no — Tailwind utilities are
  more concise and the amber palette is universally understood for warning UI.
- `<SectionGrid>` that bundles `SectionHeading` + the grid shell? `<Section title=""
  hint="" cols="1 sm:2 lg:4" gap="3">…</Section>`. Common enough on Dashboard, but
  only 2 grids there.
- Reduced motion: should hover lifts (`hover:-translate-y-0.5`) be suppressed under
  `prefers-reduced-motion`? Currently only `transition-*` is killed; transforms still
  apply on hover.

---

## 8. Sources

- `src/app.css` — tokens, `card-inset`, `hero-glow*`, animation utilities.
- `src/lib/ui/` — 23 primitive components.
- shadcn/ui — pattern inspiration for the original tier (Button, Card, Badge, etc.).
- ChrisTitusTech/winutil, Win11Debloat — visual ancestors of the broad page layout.
