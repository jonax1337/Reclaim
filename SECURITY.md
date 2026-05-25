# Security Policy

Reclaim runs with administrator privileges on user machines and edits HKLM, Windows Defender settings, the Windows Firewall, the HOSTS file, scheduled tasks, and other system surfaces. Security issues are taken seriously.

## Supported versions

Only the latest released version (the most recent `v*` tag on GitHub Releases) receives security fixes. There is no LTS branch.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub Security Advisories:

→ **<https://github.com/jonax1337/reclaim/security/advisories/new>**

(Repository → **Security** tab → **Advisories** → **Report a vulnerability**.)

Include as much of the following as you can:

- Reclaim version (`Settings → About`)
- Windows version and build (`winver`)
- Whether Reclaim was running elevated
- Reproduction steps — ideally a minimal example
- What an attacker could achieve (privilege escalation, persistence, data exfiltration, code execution, …)
- Suggested fix or mitigation, if you have one

You will get an acknowledgement within **7 days**. After triage, expect status updates roughly every 7 days until the issue is resolved or explicitly closed.

## Scope

In scope:

- Privilege escalation via Reclaim (e.g. unprivileged process triggering an elevated action)
- Command injection in any PowerShell / `cmd` / `diskpart` payload built from user input or remote data
- Path traversal in file-write commands (`write_app_file`, `read_text_file`, hosts backup, OneDrive backup, USB flash sidecars, …)
- Sentinel-merge corruption in HOSTS / Windows Firewall block groups
- Updater bypass — accepting an update payload not signed by the embedded Ed25519 pubkey
- Persistence / scheduled-task abuse (`\Reclaim\Persist-Current`) — installing or modifying tasks without elevation
- CLI argument handling that lets a low-priv shell trigger elevated operations
- Driver / unattend / autounattend.xml generators emitting content controlled by an attacker rather than the user

Out of scope:

- The MAS activation launcher (`/activation`) — Reclaim only spawns an elevated PowerShell window that runs the literal upstream one-liner. The script itself is not part of Reclaim. Issues with MAS belong upstream.
- Generic Windows behavior that Reclaim merely surfaces (e.g. "the registry tweak X has a side effect Y") — that's a bug, not a security issue; use the bug template.
- Vulnerabilities in transitive dependencies that are not actually reachable from Reclaim's code paths.
- Social-engineering attacks that require the user to deliberately import a malicious `.reclaim` profile (we treat profiles as trusted user input, like a script).

## Disclosure

After a fix ships in a tagged release, the advisory will be made public, optionally with a CVE if appropriate. Reporters are credited unless they prefer to remain anonymous.

## Bounties

There is no bug bounty program. Reclaim is a free, unsigned, single-maintainer open-source project. Thank-yous come in the form of release-note credits.
