# Reclaim — Design System (scaffold)

> Living spec. Goal: every route composes a small set of primitives + recipes from this
> document, and no longer hand-rolls `<header class="mb-6"><h1 class="text-3xl …">…`,
> `<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 stagger">…`, hand-painted
> "icon tile" boxes, ad-hoc amber banners, or its own stat card shape.
>
> **Status**: scaffold only. Tokens, primitives and recipes below describe the *current*
> visual language so we have a target to converge on. The "Inventory" section flags what
> is already a real component vs. what still lives inline in routes and needs to be
> extracted.

---

## 0. Why we need this

Quick audit of the current tree:

- `rounded-(xl|2xl|lg|md|full)` appears **154 times** across 42 files.
- `px-*`, `py-*`, `gap-*` appear **227+ times** across just 15 route files.
- `<h1 class="text-3xl font-semibold tracking-tight">` is hand-typed on **every route**
  (Privacy, Activation, Settings, …) — there is no `<PageHeader />` primitive.
- The "stat tile" pattern (`<Card class="card-inset"><CardContent>` + tiny uppercase
  label + big tabular number + sparkline/progress) is hand-rolled on Dashboard,
  ProfileCard and a few other places with subtle differences (line height, label
  letter-spacing, icon size).
- The "icon tile" pattern (`grid place-items-center size-9/10 rounded-lg
  bg-foreground/[0.06] text-foreground/80 ring-1 ring-inset ring-foreground/5`) is
  hand-rolled on Dashboard categories *and* ProfileCard.
- The "uppercase section divider" (`text-xs font-semibold uppercase text-muted-foreground
  tracking-[0.12em]` with optional `text-[11px]` right-aligned hint) appears on
  Dashboard twice and elsewhere with slightly different tracking (`0.12em` vs `0.16em`
  vs `0.18em`).
- Amber/admin banner styling exists as a real component (`AdminBanner.svelte`) but is
  **also** re-implemented inline in `TweakSection.svelte` with slightly different
  padding and radius.

This document defines the canonical version of each, so the next pass can replace
inline soup with one component or one recipe.

---

## 1. Foundation — tokens

Source of truth: `src/app.css` (`@theme inline` + `:root` / `[data-theme="dark"]`).
Tailwind v4 picks them up via `var(--…)`. **Do not introduce new raw `oklch(…)` /
`#hex` literals in components** — always reference a token.

### 1.1 Color tokens

| Token | Tailwind class | Use |
|---|---|---|
| `--background` | `bg-background` | Window body (light: 99% lum near-white, dark: 13% lum) |
| `--foreground` | `text-foreground` | Default body text |
| `--card` | `bg-card`, `bg-card/95` | Card surface — almost always with `/95` + `backdrop-blur-md` to sit over Mica |
| `--card-foreground` | `text-card-foreground` | Text inside cards |
| `--popover` | `bg-popover` | Dropdown menus, dialogs, select content |
| `--primary` | `bg-primary`, `text-primary`, `border-primary` | Brand purple (oklch 0.56 / 0.21 / 285). Selection highlight, recommended badge tint, active state bar |
| `--primary-foreground` | `text-primary-foreground` | Text on primary surfaces |
| `--secondary` | `bg-secondary` | Quiet button background |
| `--muted` | `bg-muted` | Progress-bar track, subtle bg |
| `--muted-foreground` | `text-muted-foreground` | All secondary copy, hint text, "/ {total}" markers |
| `--accent` | `bg-accent` | Hover backgrounds (`hover:bg-accent/40`, `hover:bg-accent/60`) |
| `--destructive` | `bg-destructive`, `text-destructive` | Delete, uninstall, "revert all", warning toasts |
| `--success` | `text-success`, `bg-success/15` | Licensed, "Recommended" badge |
| `--warning` | (currently expressed as `bg-amber-500/10` + amber-700/400) | **Inconsistent** — see §1.2 |
| `--border` | `border` (default), `border-foreground/10` (cards/hero override) | Hairlines |
| `--ring` | `focus-visible:ring-ring/50` | Focus rings (3px) |

### 1.2 The amber problem (warning color)

`--warning` exists in `app.css` (oklch ~0.74/0.16/75) but **components don't use it**.
Both `AdminBanner.svelte` and the inline admin warning in `TweakSection.svelte`
reach for raw Tailwind `amber-500/40`, `amber-600`, `amber-900` etc. The Badge
component's `warning` variant uses a mix of `bg-warning/20` + `text-amber-700`.

**Action item** (later, not this PR): pick one. Either
1. Drop `--warning` and standardise on Tailwind `amber-*` everywhere, or
2. Define `--warning-foreground`, `--warning-surface`, `--warning-border` and use them
   in the `warning` Badge variant, AdminBanner and any inline amber banner.

### 1.3 Radii

| Token | Tailwind | Used for |
|---|---|---|
| `--radius-sm` (≈6px) | `rounded-sm` | rarely used today |
| `--radius-md` (≈8px) | `rounded-md` | Buttons, inputs, Badge |
| `--radius-lg` (≈10px, base `--radius`) | `rounded-lg` | Inner panels, icon tiles, small cards |
| `--radius-xl` (≈14px) | `rounded-xl` | Cards (`Card.svelte` hardcodes `rounded-xl`) |
| — | `rounded-2xl` (16px) | Hero section, BulkActionBar pill |
| — | `rounded-full` | Progress-bar fill, status dots, sidebar pills |

Avoid `rounded`, `rounded-md/2xl` mixed inside the same widget. Pick one per surface
level (page-level = 2xl, card = xl, controls = md).

### 1.4 Typography

`--font-sans` is Geist Variable; `--font-mono` is Geist Mono Variable. Body is 14px
with `font-feature-settings: "cv11", "ss01"`. `optimizeLegibility` is on.

The `@layer base` already sets `h1` (1.875rem / 2.25rem, font-semibold, tracking
−0.02em), `h2` (1.25rem / 1.75rem) and `h3` (1rem / 1.5rem). **But** every route
overrides `<h1>` with `text-3xl font-semibold tracking-tight`, which is *almost* the
same but not identical. We should either:

- delete the route-level override and trust the global `h1`, or
- bake the override into a `<PageHeader />` primitive (recommended — see §3.1).

Canonical scale we want to converge on:

| Role | Class recipe |
|---|---|
| Page title | `text-[1.875rem] leading-tight font-semibold tracking-tight` (matches global `h1`) |
| Section heading (above a grid of cards) | `text-xs font-semibold uppercase text-muted-foreground tracking-[0.12em]` |
| Card title (large) | `text-base font-semibold tracking-tight` (matches `<CardTitle />`) |
| Row title (TweakRow, list item) | `text-sm font-medium` |
| Body copy | inherit (14px) |
| Subtext / hint | `text-xs text-muted-foreground` (use `leading-relaxed` if multi-line) |
| Tiny caps label ("ACTIVE TWEAKS") | `text-xs text-muted-foreground uppercase tracking-wider` |
| Hyper-tiny caps ("3 entries") | `text-[10px] text-muted-foreground/70 uppercase tracking-wider` |
| Eyebrow above hero title | `text-[10px] font-semibold uppercase tracking-[0.18em] text-primary` |
| Tabular numbers (counts, percentages, versions) | always add `tabular-nums` |

The three tracking values (`0.12em` / `0.16em` / `0.18em`) are currently used
intentionally to express hierarchy (section heading → eyebrow → category-card
"entries"). Keep them — but pick one per role and stick to it.

### 1.5 Spacing

| Token | Purpose |
|---|---|
| `gap-1.5` | Icon-to-label inside Badge / chip |
| `gap-2` | Header right-side button cluster, badge row |
| `gap-3` | Card-internal three-block layout (icon · text · arrow) |
| `gap-4` | **Grid gap for stat-tile rows** (Dashboard stats) |
| `gap-3` | **Grid gap for category cards / profile cards** |
| `gap-6` | Outer page section spacing, default Card content spacing |
| `mb-6` | **Page header bottom margin** — always |
| `mb-8` | After the top stat row, before "Profiles" heading |
| `mb-3` | After a section heading, before the grid it labels |

If you find yourself writing `mb-7` or `gap-5`, stop. Pick one of the values above.

### 1.6 Elevation / surfaces

| Surface | Recipe |
|---|---|
| Page body | Mica via `tauri.conf.json`; body has `oklch(0.99 0 0 / 94%)` / dark `oklch(0.14 0.006 285 / 82%)`. Don't override. |
| Sidebar | `bg-foreground/[0.04] backdrop-blur-xl sidebar-bg` |
| Hero (Dashboard top, Activation hero) | `rounded-2xl border border-foreground/10 bg-card/70 backdrop-blur-xl shadow-sm hero-glow` (or `hero-glow-success` / `hero-glow-warning`) |
| Card | `bg-card/95 backdrop-blur-md text-card-foreground rounded-xl border border-foreground/8 py-6 gap-6 shadow-sm` — baked into `<Card />` |
| Card with subtle inner highlight | add `card-inset` class (defined in `app.css @layer utilities`) — light: top inner highlight + soft shadow; dark: brighter top edge + drop shadow |
| Hover-lift | `hover:-translate-y-0.5 hover:shadow-md transition-all duration-200` — used on ProfileCard, category cards, AdminBanner |
| BulkActionBar (floating pill) | `fixed bottom-5 … rounded-2xl border-foreground/10 bg-card/85 backdrop-blur-xl pl-4 pr-2 py-2 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.35)]` |
| Toast / dialog | `<Dialog />` and `<Toaster />` from `lib/ui/`. Don't roll your own modal. |

`card-inset` is the visual "lift" that distinguishes a flat Card from one that should
feel tappable / interactive. Use it on stat tiles, category cards, profile cards,
list-of-rows cards. **Don't** use it on form Cards inside Settings or Maintenance —
those want the plain shadow.

### 1.7 Iconography

- Library: `@lucide/svelte` only. No mixing with other icon sets except `OneDriveIcon`
  (custom SVG for brand fidelity).
- Default size inside a Button is `size-4` (Button.svelte handles this via
  `[&_svg:not([class*='size-'])]:size-4`).
- Inline within text / row: `size-3.5` (refresh spinner, arrow-right hint) or `size-4`.
- Inside a 9px / 10px **icon tile** (see §3.5): `size-4`.
- Inside a Badge: `size-2.5`.
- Hero icon (when used): `size-5`.

### 1.8 Motion

| Utility | When |
|---|---|
| `animate-route` | Mounted on the route-level root for fade-in (180ms ease-out) — already wired in Layout |
| `animate-enter` | Single element fade+rise (220ms) |
| `stagger` | Apply on a container; children fade+rise with 30ms staggered delay up to 9 |
| `transition-all duration-200` | Hover lifts on cards |
| `transition-colors` | Subtle hover background changes |
| `fly={{ y: 24, duration: 240, easing: cubicOut }}` | BulkActionBar mount/unmount |

All animations honour `prefers-reduced-motion` (defined in `app.css @layer
utilities`). Don't add a new `@keyframes` without adding it to the reduced-motion
override.

---

## 2. Primitives — what already exists in `lib/ui/`

| Primitive | File | Variants | Notes |
|---|---|---|---|
| `Button` | `Button.svelte` | `default` / `destructive` / `outline` / `secondary` / `ghost` / `link` × size `default` / `sm` / `lg` / `icon` | Use for **every** button-shaped thing. No `<button class="rounded-md bg-primary …">` in routes. |
| `Card` | `Card.svelte` | — (one shape) | Wraps `bg-card/95 backdrop-blur-md`, `rounded-xl`, `border`, `py-6`, `gap-6`. Override `py-0 gap-0` for list-of-rows. |
| `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` | `lib/ui/Card*.svelte` | — | Composition slots. Header/Content have `px-6`; Content adds nothing else. |
| `Badge` | `Badge.svelte` | `default` / `secondary` / `outline` / `success` / `warning` / `destructive` | Always pairs with a `size-2.5` Lucide icon inside |
| `Switch` | `Switch.svelte` | — | Bound to `checked` + `onCheckedChange`. Mark its parent with `data-no-select` if it lives in a click-to-select row |
| `Checkbox` | `Checkbox.svelte` | — | Same `data-no-select` rule |
| `Dialog` | `Dialog.svelte` | — | Use for confirmations, previews, raw-hosts editor |
| `Select.*` | `lib/ui/select/` | — | Bits-UI wrapper |
| `Titlebar` | `Titlebar.svelte` | — | Custom drag-region + traffic-light buttons |
| `Toaster` + `toast` | `Toaster.svelte`, `toast.svelte.ts` | `success` / `error` / `warning` / `action` / `show` | Don't `alert()` and don't write inline banners for transient feedback |
| `BulkActionBar` | `BulkActionBar.svelte` | — | Floating selection actions — pass children as `<Button size="sm" …>` |

---

## 3. Recipes & missing primitives

This is the section to act on next. Each subsection describes a pattern that is
currently inline-Tailwind on 2+ routes, and proposes the primitive to extract.

### 3.1 `<PageHeader />` — *missing, extract*

**Current state:** every route opens with hand-typed markup:

```svelte
<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Privacy</h1>
  <p class="text-sm text-muted-foreground mt-1">Telemetry, advertising ID, …</p>
</header>
```

or with a refresh button:

```svelte
<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 …>Windows activation</h1>
    <p …>Current license status …</p>
  </div>
  <Button variant="outline" onclick={reload} disabled={loading}>…</Button>
</header>
```

**Target API** (no code change yet — for reference):

```svelte
<PageHeader title="Privacy" description="Telemetry, advertising ID, activity history.">
  {#snippet actions()}
    <Button variant="outline" onclick={reload} disabled={loading}>
      <RefreshCw class={loading ? "animate-spin" : ""} />
      Refresh
    </Button>
  {/snippet}
</PageHeader>
```

### 3.2 `<SectionHeading />` — *missing, extract*

**Current state:** Dashboard repeats this twice (above Profiles, above Categories):

```svelte
<div class="flex items-center justify-between mb-3">
  <h2 class="text-xs font-semibold uppercase text-muted-foreground tracking-[0.12em]">
    Profiles
  </h2>
  <span class="text-[11px] text-muted-foreground">one-click setups</span>
</div>
```

**Target API:**

```svelte
<SectionHeading title="Profiles" hint="one-click setups" />
```

### 3.3 `<HeroBanner />` — *missing, extract (used 2× today, will grow)*

**Current state:** Dashboard rolls a 56-line block; Activation has a smaller variant.

```svelte
<section class="relative overflow-hidden rounded-2xl border border-foreground/10 bg-card/70 backdrop-blur-xl shadow-sm mb-6 hero-glow">
  <div class="absolute inset-0 -z-10 opacity-[0.04] [background-image:radial-gradient(circle_at_1px_1px,_currentColor_1px,_transparent_0)] [background-size:16px_16px]"></div>
  …eyebrow + h1 + accent bar + description + meta + actions slot…
</section>
```

**Target API:**

```svelte
<HeroBanner
  eyebrow="Take back control"
  title="Reclaim Your Windows"
  titleMuted="Reclaim"
  description="Strip out bloatware, kill telemetry …"
  tone="default" {/* | "success" | "warning" */}
>
  {#snippet meta()}…info pills…{/snippet}
  {#snippet actions()}…buttons…{/snippet}
</HeroBanner>
```

`tone` switches `hero-glow` / `hero-glow-success` / `hero-glow-warning` and (optionally)
the eyebrow accent color.

### 3.4 `<StatTile />` — *missing, extract (used 3× on Dashboard)*

**Current state:** three near-identical Card+CardContent blocks on Dashboard, each
with a tiny caps label, an icon, a big number, and optionally a progress bar.

**Target API:**

```svelte
<StatTile label="Active tweaks" icon={Shield}>
  <StatValue value={appliedCount} total={ALL_TWEAKS.length} loading={loading} />
  <MetricBar value={progress} max={100} />
</StatTile>
```

### 3.5 `<IconTile />` — *missing, extract*

**Current state:** identical 9–10px rounded square with the same ring/bg recipe is
inline on Dashboard categories and ProfileCard (with a `size-9` vs `size-10`
variance):

```svelte
<div class="grid place-items-center size-10 rounded-lg bg-foreground/[0.06] text-foreground/80 ring-1 ring-inset ring-foreground/5">
  <Icon class="size-4" />
</div>
```

Hover variant on Dashboard adds `group-hover:text-primary group-hover:bg-primary/10`.

**Target API:**

```svelte
<IconTile icon={Package} size="md" interactive />  {/* sm = 9, md = 10 */}
```

### 3.6 `<CategoryCard />` — *missing, extract (used 14× on Dashboard alone)*

```svelte
<CategoryCard
  href="/bloatware"
  icon={Package}
  label="Bloatware"
  description="Remove pre-installed apps"
  count={BLOATWARE.length}
  countSuffix="entries"
/>
```

This is just `<IconTile>` + label + description + count, all packaged. The hover
recipe (`hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30
transition-all duration-200`) belongs inside the component.

### 3.7 `<EmptyState />` — *missing, extract*

We have at least three flavors of "all hidden / no data" message:

- `TweakSection`: `<Card class="card-inset"><div class="px-6 py-16 text-center text-sm text-muted-foreground">All tweaks in this category …</div></Card>`
- Apps / Bloatware / Services: various inline messages

**Target API:**

```svelte
<EmptyState icon={ShieldAlert} title="…" description="…">
  {#snippet action()}<Button>…</Button>{/snippet}
</EmptyState>
```

### 3.8 `<AdminBanner />` — *exists, but duplicated inline*

`AdminBanner.svelte` is the canonical amber banner for "this whole page needs admin".
But `TweakSection.svelte` reimplements a **smaller** amber banner inline for "X
admin-only tweaks hidden". The two banners drift apart on padding (`p-4` vs `px-4
py-3`), radius (`rounded-xl` vs `rounded-lg`), icon size (`size-5` vs `size-4`) and
title weight.

**Fix later:** add a `size="sm"` variant to `AdminBanner`, swap the inline copy in
`TweakSection` for it.

### 3.9 `<ListCard />` — *missing, extract*

The "list of rows inside one Card" pattern is documented in `CLAUDE.md` as
`<Card class="overflow-hidden gap-0 py-0 card-inset">` and is used in TweakSection,
ContextMenu, Bloatware list, Services, ScheduledTasks. Same wrapper every time.

**Target API:**

```svelte
<ListCard>
  {#each items as item (item.id)}
    <ListRow …>…</ListRow>
  {/each}
</ListCard>
```

`<ListRow />` would absorb the shared "click-to-select row with `data-no-select` on
interactive children, left accent bar when on/selected, border-b last:border-b-0"
recipe currently inside `TweakRow.svelte`.

### 3.10 `<MetricBar />` — *missing, extract (used 2× today, will grow)*

```svelte
<div class="h-1 rounded-full bg-muted overflow-hidden">
  <div class="h-full rounded-full bg-primary transition-all duration-500"
       style="width: {progress}%"></div>
</div>
```

Identical on Dashboard StatTile and ProfileCard. Trivial component, but worth
extracting so we control the height variants (`h-1` / `h-1.5` / `h-2`) and tone
(`bg-primary` / `bg-success` / `bg-warning`).

### 3.11 `<MetaPills />` — *missing, extract*

Hero "OS · build · username" meta line:

```svelte
<div class="mt-3 text-xs text-muted-foreground flex flex-wrap gap-x-2">
  <span class="font-medium text-foreground">{info.productName}</span>
  {#if info.displayVersion}<span>· {info.displayVersion}</span>{/if}
  …
</div>
```

Could be a small `<MetaPills items={[{strong: "Windows 11 Pro"}, "23H2", "Build 22631"]} />`.

---

## 4. Page recipes — how routes should look once primitives land

### 4.1 Tweak-category page (Privacy, Search, AI, Explorer, Taskbar, Performance, Memory, Gaming, Notifications, Updates)

```svelte
<PageHeader title="Privacy" description="Telemetry, advertising ID, activity history, location tracking." />
<TweakSection tweaks={PRIVACY_TWEAKS} />
```

That's it. **Today this is roughly correct already** — Privacy.svelte is only 13
lines. The fix is replacing the hand-rolled `<header>` with `<PageHeader />`.

### 4.2 Action / detail page (Activation, Defender, Hosts, Network, Maintenance, Drivers, WindowsUpdate, ScheduledTasks)

```svelte
<PageHeader title="…" description="…">
  {#snippet actions()}<Button …>Refresh</Button>{/snippet}
</PageHeader>

<AdminBanner … />          {/* if admin-only */}

<HeroBanner tone="success" … />   {/* if the page has a binary state — Activation, OneDrive */}

<SectionHeading title="…" />
<div class="grid grid-cols-… gap-4 stagger">…</div>

<ListCard>…</ListCard>
```

### 4.3 Dashboard

```svelte
<HeroBanner …>
  {#snippet actions()}<Button>Apply all recommended</Button><Button variant="outline">Snapshot</Button>{/snippet}
</HeroBanner>

<AdminBanner … />

<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 stagger">
  <StatTile …/> × 3
</div>

<SectionHeading title="Profiles" hint="one-click setups" />
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8 stagger">
  {#each PROFILES as p}<ProfileCard … />{/each}
</div>

<SectionHeading title="Categories" hint="click to open" />
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
  {#each categories as c}<CategoryCard … />{/each}
</div>
```

Going from current Dashboard (≈400 lines) to the recipe above shrinks it to roughly
80 lines of data + composition.

### 4.4 Settings / form-style page

```svelte
<PageHeader title="Settings" description="Appearance, system actions and info." />

<div class="flex flex-col gap-6">
  <Card>
    <CardHeader>
      <CardTitle>Appearance</CardTitle>
      <CardDescription>…</CardDescription>
    </CardHeader>
    <CardContent>…</CardContent>
  </Card>

  <BackgroundServiceCard />

  …
</div>
```

The theme picker grid (3-button row, currently hand-rolled in Settings.svelte) should
become a `<SegmentedControl />` primitive (proposed). Same shape will be needed when
we add more "pick one of N" settings.

---

## 5. Component status table

| Primitive / recipe | Status | Files to touch when extracting |
|---|---|---|
| `Button`, `Card*`, `Badge`, `Switch`, `Checkbox`, `Dialog`, `Select`, `Titlebar`, `Toaster`, `BulkActionBar` | ✅ exist | — |
| `PageHeader` | ❌ extract | every route header (~30 files) |
| `SectionHeading` | ❌ extract | Dashboard, IsoBuilder, Maintenance (group divider), Drivers, WindowsUpdate, Defender |
| `HeroBanner` | ❌ extract | Dashboard, Activation, possibly OneDrive |
| `StatTile` | ❌ extract | Dashboard, ProfileBuilder (final summary) |
| `IconTile` | ❌ extract | Dashboard categories, ProfileCard, ProfileIcon (variant) |
| `CategoryCard` | ❌ extract | Dashboard |
| `EmptyState` | ❌ extract | TweakSection, Apps, Bloatware, Services, ScheduledTasks, Firewall |
| `AdminBanner` (sm variant) | 🟡 extend | TweakSection's inline amber banner |
| `ListCard` + `ListRow` | ❌ extract | TweakSection / TweakRow, ContextMenu, Services, ScheduledTasks, Startup, Bloatware row |
| `MetricBar` | ❌ extract | Dashboard StatTile, ProfileCard progress |
| `MetaPills` | ❌ extract | Hero, Specs, Activation |
| `SegmentedControl` | ❌ extract | Settings theme picker, anywhere else we need "pick one of N" |

---

## 6. Anti-patterns (please stop)

1. **Wrapping `<Card>` in another `<div class="px-5 py-5">`.** Card already has
   `py-6 gap-6` baked in. Use `CardContent` (px-6) or override `py-0 gap-0` for
   list cards. *(See [Card padding memory](../memory.md) for the past incident
   shape — it bites every time.)*
2. **Hand-rolled `<button class="rounded-md bg-primary …">`.** Use `<Button />`.
3. **`<h1 class="text-3xl font-semibold tracking-tight">`** — that's `text-[1.875rem]
   leading-tight` plus the base styles. The class chain belongs in `PageHeader`,
   not in every route file.
4. **New raw amber / red / green colors.** Use `--success`, `--destructive`, the
   warning convention (once it's unified), or — for now — the `Badge` warning
   variant which already encodes the amber pair.
5. **Inline `<div class="grid place-items-center size-10 rounded-lg bg-foreground/[0.06] …">`.** That's `IconTile`. Always.
6. **Fresh `mb-7`, `gap-5`, `py-3.5`** — pick a value from the spacing scale
   (§1.5).
7. **Mixing `rounded-lg` and `rounded-xl` and `rounded-2xl` inside the same widget.**
   Pick one elevation level (§1.3).
8. **`<span class="text-xs text-muted-foreground uppercase tracking-wider">…</span>`
   at the top of a section.** That's `<SectionHeading />` once we extract it.
9. **New `@keyframes` without a `@media (prefers-reduced-motion: reduce)` override.**
   The current animations all honor reduced motion; new ones must too.
10. **Calling `getCurrentWindow().destroy()` from a route.** Window lifecycle belongs
    in Layout. (Not strictly design-system, but the same "don't duplicate the wiring"
    spirit.)

---

## 7. Migration plan (sequential, low-risk)

Each step is a contained PR. None of them ship visual changes — they replace inline
soup with a primitive that produces the same DOM.

1. **`PageHeader`** — extract, migrate Privacy / Search / AI / Explorer / Taskbar
   first (they're the smallest). Then Settings, Activation, Specs, Logs, etc. Should
   touch ~30 files and remove ~120 lines.
2. **`SectionHeading`** — extract, migrate Dashboard (2×) + any other "uppercase
   divider" calls.
3. **`IconTile`** — extract, migrate Dashboard categories + ProfileCard.
4. **`MetricBar`** — extract, migrate Dashboard StatTile + ProfileCard.
5. **`StatTile`** — extract using `IconTile` + `MetricBar`, migrate Dashboard.
6. **`CategoryCard`** — extract using `IconTile`, migrate Dashboard.
7. **`HeroBanner`** — extract, migrate Dashboard + Activation (and grade the
   `tone` variants against current `hero-glow-success` / `hero-glow-warning`).
8. **`EmptyState`** — extract, migrate TweakSection / Apps / Bloatware / Services
   / ScheduledTasks / Firewall.
9. **`AdminBanner` size variant** — extend, migrate the inline copy in TweakSection.
10. **`ListCard` + `ListRow`** — extract, migrate TweakSection / TweakRow first
    (largest payoff), then any other list-of-rows usage.
11. **`SegmentedControl`** — extract, migrate Settings theme picker (and any future
    "pick one of N").
12. **Warning color unification** — pick one of the two paths in §1.2 and apply.
13. **Lint pass** — search for `text-3xl font-semibold tracking-tight`,
    `bg-foreground/\[0.06\]`, `tracking-\[0.12em\]`, `card-inset relative`, etc.
    Any remaining inline use of these is a missed migration.

Each step keeps the visual output identical, so screenshots before/after should diff
to zero.

---

## 8. Open questions

- Do we want a `<Section />` wrapper that bundles `<SectionHeading />` + the grid
  shell? (Would let us write `<Section title="Profiles" hint="…" cols="1 sm:2
  lg:4" gap="3">…</Section>`.) Probably yes after we see how often we repeat the
  shell.
- `card-inset` is binary. Do we need an "elevation scale" (flat / inset /
  raised / floating)? Today: flat (form cards), inset (interactive cards), raised
  (hover-lifted), floating (BulkActionBar, Dialog). Worth naming explicitly.
- Should the Dashboard categories grid be vertically denser? Currently `py-4` on each
  card via `class="py-4"` override; everywhere else uses `py-6`. Either bake a
  `density="compact"` prop into `CategoryCard` or align with the default.
- Reduced-motion: do we want to also disable the `hover:-translate-y-0.5` lift, or
  is that fine because it's interaction-triggered? Currently the `prefers-reduced-motion`
  rule only kills animations + transitions, but `transform` on hover is technically a
  transition. Worth a once-over.

---

## 9. Sources / references

- `src/app.css` — all tokens, utility classes (`hero-glow*`, `card-inset`,
  `animate-route`, `animate-enter`, `stagger`).
- `src/lib/ui/` — existing primitives.
- `CLAUDE.md` — section "Card list pattern" + "BulkActionBar pattern".
- ChrisTitusTech/winutil, Win11Debloat — visual ancestors of the broad page layout.
- shadcn/ui — pattern inspiration for the primitives (we already mirror it).
