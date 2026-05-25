<!--
Thanks for opening a PR! A few quick checks before you hit submit — see
.github/CONTRIBUTING.md for the full guidelines.
-->

## Summary

<!-- 1–3 bullets: what changed and why. Link the issue if there is one. -->

-

## Type of change

- [ ] Bug fix
- [ ] New tweak (catalog only)
- [ ] New feature / route / Rust command
- [ ] Refactor / cleanup (no behavior change)
- [ ] Docs / CI / chore

## Pre-submit checklist

- [ ] `pnpm exec svelte-check` — 0 errors, 0 warnings
- [ ] `cargo check` (from `src-tauri/`) — clean
- [ ] Tested in `pnpm tauri:dev` with **both** `admin.elevated == true` and `false`
- [ ] No raw `invoke()` in routes — every call goes through `bridge.ts`
- [ ] No new German strings — UI is English-only
- [ ] No `console.log` / `dbg!` / commented-out code left behind

### If you added a tweak

- [ ] Toggling ON then OFF restores the Windows default (verified, not assumed)
- [ ] Either `revert` is supplied, or every `RegOp` has `defaultValue`
- [ ] If `kind: "shell"` → explicit `revert` is present
- [ ] If destructive / has caveat → `warning` text is set
- [ ] Ran `pnpm catalog:export` (required for CLI / install-media to see the new tweak)

### If you added a Rust command

- [ ] Registered in `src-tauri/src/lib.rs` `invoke_handler!`
- [ ] Typed wrapper added to `src/lib/tweaks/bridge.ts`
- [ ] All user input validated server-side before interpolation into PowerShell / shell
- [ ] Long-running? → wired through `tasks` + `TerminalPanel`, no silent spinner

### If you added a route

- [ ] Added to `routes` map in `App.svelte` and `navGroups` in `Layout.svelte`
- [ ] `adminOnly: true` set if any operation needs HKLM / shell
- [ ] Slow on mount? → entry added to `startup-preload.svelte.ts`

## Screenshots / recordings

<!-- For UI changes. Drag-drop here. Both light and dark theme if visual. -->

## Notes for reviewers

<!-- Anything non-obvious about the approach, things you considered and rejected, follow-up work intentionally left out, etc. -->
