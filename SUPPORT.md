# Getting help

Reclaim is a free, unsigned, single-maintainer hobby project. There is no support contract, no SLA, no paid tier, no Discord, no community manager. That said — here's how to actually get an answer.

## Before you open anything

1. **Read `README.md`.** Most "how do I…" questions are answered there.
2. **Check the [CHANGELOG](CHANGELOG.md).** If the behavior changed recently, the diff for that version is usually a faster read than the source.
3. **Search [existing issues](https://github.com/jonax1337/reclaim/issues?q=is%3Aissue)** — both open and closed. Closed ones often contain the actual fix or workaround.
4. **Try the latest release.** Builds older than the current `v*` tag don't get fixes.

## Where to ask

### Something is broken → [Bug report](https://github.com/jonax1337/reclaim/issues/new?template=bug_report.md)

Use the issue template. Always include:

- Reclaim version (`Settings → About`)
- Windows version + build (`winver`)
- Whether Reclaim was running elevated
- Exact reproduction steps
- What you expected vs what happened
- The relevant slice of the Activity Log (`/logs` route, or `%APPDATA%\Reclaim\activity.log` for installed builds)

Screenshots help. Walls of text without a repro do not.

### You want a feature or a new tweak → [Feature request](https://github.com/jonax1337/reclaim/issues/new?template=feature_request.md)

State the actual problem, not your preferred solution. "I want Reclaim to do X via mechanism Y" is harder to triage than "after every Windows Update, setting Z gets reset, and I'd like Reclaim to re-apply it." The second framing might get solved by an existing feature; the first won't.

Skim the [CHANGELOG](CHANGELOG.md) first — many ideas have already shipped under a different name.

### You found a security issue → **Do not open a public issue**

→ [Security advisory](https://github.com/jonax1337/reclaim/security/advisories/new), full details in [`SECURITY.md`](SECURITY.md).

### You want to contribute code → [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)

Read `CLAUDE.md` first. Open a draft PR early if the change is non-trivial — better to align on approach than to rewrite a 1000-line patch.

### Generic Windows questions

Reclaim surfaces and toggles Windows settings; it doesn't reinvent them. Questions like "why does Windows do X" or "how do I fix Windows feature Y" belong on [superuser.com](https://superuser.com/) or the relevant Microsoft Learn page, not in this tracker.

## What won't get an answer

- Private DMs / emails asking for free Windows support.
- "It doesn't work" with no version, no log, no repro.
- Requests to ship Reclaim through stores that require code-signing certificates the project doesn't have (see `CLAUDE.md` — v1.0.0 ships unsigned via GitHub Releases on purpose).
- Requests to bundle, host, or modify the MAS activation script. Reclaim launches the upstream one-liner; that's the entire integration.
- Requests for non-English UI translations. The app is English-only by design.

## Response time

Best-effort. Security issues are acknowledged within 7 days (see `SECURITY.md`). Bug reports and feature requests have no SLA — the maintainer reads everything but only triages in batches.

If something is genuinely urgent and security-relevant, use the security advisory flow and say "urgent" in the title. Otherwise, please be patient.
