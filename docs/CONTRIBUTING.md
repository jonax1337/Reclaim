# Contributing to Reclaim

> Read `CLAUDE.md` and `docs/ARCHITECTURE.md` first.

## The 5-minute checklist before opening a PR

1. `pnpm exec svelte-check` → 0 errors, 0 warnings
2. `cargo check` (from `src-tauri/`) → clean
3. `pnpm build` → no warnings beyond bundle size
4. New tweak / route / command? → bridge wrapper exists, log calls in place, admin check if needed
5. Tested in `pnpm tauri:dev` with both `admin.elevated == true` and `false`

## Adding a tweak

1. Find the right `*_TWEAKS` array in `src/lib/tweaks/catalog.ts`
2. Add a `Tweak` entry — see `CLAUDE.md` "How to add a tweak"
3. Test toggle ON, then toggle OFF — verify revert restores Windows default
4. If `requiresRestart: "explorer"`, trigger via the toast and verify the change is visible
5. If recommended → mark `recommended: true`
6. If destructive / has caveat → set `warning: "..."` text

## Adding bloatware

1. Find or create the right group in `src/lib/tweaks/bloatware.ts`
2. Add a `BloatwareEntry` with the AppX pattern
3. Verify the pattern matches via `Get-AppxPackage <pattern>` in PowerShell
4. If removal can break something common, set `warning`

## Adding a route

1. Create `src/routes/<Name>.svelte`
2. Register in `src/App.svelte` `routes` map
3. Add to `src/lib/components/Layout.svelte` `navGroups`
4. If admin-only: set `adminOnly: true` on nav entry
5. Mirror existing route structure: header (h1 + p.subtitle) → main content
6. Use `<Card class="card-inset">` for stat cards, `<Card class="overflow-hidden gap-0 py-0 card-inset">` for row lists

## Adding a Rust command

1. Pick the right module or create a new one
2. `#[tauri::command] pub fn name(...) -> Result<T, String>`
3. Register in `src-tauri/src/lib.rs` `invoke_handler!` macro
4. Add typed wrapper in `src/lib/tweaks/bridge.ts`
5. Use `crate::tweaks::run_ps(script)` for PowerShell — don't `spawn` directly

## Adding a profile

1. In `src/lib/tweaks/profiles.ts`, append a `Profile`
2. Reference existing tweak ids — missing ids are silently dropped, but check by running `pnpm exec svelte-check`
3. Pick a gradient that's visually distinct from existing profiles

## Tailwind / UI

- Use existing utility classes; if you need a custom pattern, add to `src/app.css` under `@layer utilities`
- Stagger animation for grid entries: wrap container with `class="stagger"`
- Card lift on hover: `hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`
- Active accent: `bg-primary/[0.08]` + left bar `absolute left-0 top-2 bottom-2 w-[2px] bg-primary`
- Don't use `rounded-full` for anything except the elevate badge

## Commits

Conventional Commits:
- `feat:` new feature
- `fix:` bug fix
- `refactor:` no behavior change
- `docs:` docs only
- `chore:` build/tooling

Scope is optional but useful: `feat(tweaks):`, `fix(layout):`, `feat(rust):`.

## Versioning

After each phase ships:

1. Bump version in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
2. Update `CLAUDE.md` "Current state" section
3. Add a section to `CHANGELOG.md` (create if missing)
4. Tag the commit: `git tag v0.X.0`

## When in doubt

- Read `docs/ROADMAP.md` for context on where a feature fits
- Match existing patterns rather than introducing new ones
- Ask: "would this feel like part of the same app a year from now?"
