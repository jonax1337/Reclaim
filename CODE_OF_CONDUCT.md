# Code of Conduct

Reclaim is a small single-maintainer open-source project. The rules are short on purpose.

## Be decent

When interacting in issues, pull requests, discussions, security advisories, or any other project space:

- Assume the person on the other end is acting in good faith until proven otherwise.
- Disagree about code, not about people. Critique the patch, not the contributor.
- No harassment, slurs, personal attacks, doxxing, sexualized language, or sustained off-topic hostility.
- No politics, no nationalism, no religion. This is a Windows debloater, not a forum.
- English only in issues and PRs (the app is English-only by design and so is its bug tracker).

## What gets your contribution rejected

- Patches that add telemetry, ads, tracking, paid features, "premium" gates, or anything that phones home outside of the auto-updater.
- Patches that bundle, redistribute, or modify the MAS activation script. Reclaim only launches the upstream one-liner; that line stays as-is.
- Patches that break reversibility — every tweak must have either explicit `revert` or full `defaultValue` coverage (see `CLAUDE.md`).
- Patches that introduce non-English UI strings.
- AI-generated PRs with no human review, no testing, and a description copy-pasted from a chatbot. If you used an LLM, fine — but you read the diff, you ran `pnpm tauri:dev`, and you can defend the change.

## Enforcement

The maintainer (<jonas.laux@hotmail.com>) is the sole arbiter. Consequences are graduated and entirely at the maintainer's discretion:

1. A reply asking you to stop or rephrase.
2. Comment / PR / issue locked or deleted.
3. Block from the repository.

There is no appeals process. If you disagree with how the project is moderated, fork it — that's the point of the license.

## Scope

This applies to all project spaces (GitHub issues, PRs, discussions, security advisories, release comments) and to public statements where you represent the project (e.g. "I'm a Reclaim contributor and …"). It does not extend to unrelated venues.

## Reporting

For Code-of-Conduct violations: email <jonas.laux@hotmail.com> with a link to the offending content. Do **not** use this address for security issues — those go through [GitHub Security Advisories](https://github.com/jonax1337/reclaim/security/advisories/new) (see `SECURITY.md`).
