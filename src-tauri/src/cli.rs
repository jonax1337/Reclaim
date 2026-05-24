// CLI mode — runs the same tweak / bloatware / profile primitives as the GUI,
// but driven by argv instead of the Webview. Designed for sysadmin /
// gold-image / MDT / Intune scenarios where the Tauri window is dead weight.
//
// The catalog data (tweaks, profiles, bloatware) lives in TypeScript and is
// emitted to src-tauri/data/*.json by `pnpm catalog:export` before each
// release build. We `include_str!` those files so the CLI binary is the same
// reclaim.exe as the GUI binary — no second executable to ship.

#![cfg(windows)]

use serde::Deserialize;
use std::collections::HashMap;
use std::process::ExitCode;

/// All subcommand helpers return a u8 exit code (0 = success). The top-level
/// `run()` converts the result to `ExitCode` at the boundary. Using u8
/// internally lets us combine results (success-AND-success) without dancing
/// around `ExitCode`'s lack of `Into<u8>`.
type ExitU8 = u8;

use crate::tweaks::{
    reg_delete_value_sync, reg_read_sync, reg_write_sync, run_ps, RegLocator, RegValue,
};

// ────────────────────────────────────────────────────────────────────────────
// Catalog types (mirror the TS catalog 1:1, derived from src-tauri/data/*.json).

#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum TweakOp {
    Reg(RegOpData),
    Shell(ShellOpData),
}

#[derive(Deserialize, Debug, Clone)]
#[allow(dead_code)]
struct RegOpData {
    hive: String,
    path: String,
    name: String,
    #[serde(rename = "type")]
    kind: String,
    value: serde_json::Value,
    #[serde(default, rename = "defaultValue")]
    default_value: Option<serde_json::Value>,
    #[serde(default, rename = "deleteOnRevert")]
    delete_on_revert: bool,
}

#[derive(Deserialize, Debug, Clone)]
#[allow(dead_code)]
struct ShellOpData {
    script: String,
    #[serde(default)]
    elevated: bool,
}

#[derive(Deserialize, Debug, Clone)]
#[allow(dead_code)]
struct Tweak {
    id: String,
    category: String,
    title: String,
    description: String,
    apply: Vec<TweakOp>,
    #[serde(default)]
    revert: Option<Vec<TweakOp>>,
    #[serde(default)]
    check: Option<Vec<TweakOp>>,
    #[serde(default)]
    recommended: bool,
    #[serde(default)]
    warning: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[allow(dead_code)]
struct Profile {
    id: String,
    name: String,
    #[serde(default)]
    tagline: String,
    #[serde(default)]
    description: String,
    #[serde(rename = "tweakIds")]
    tweak_ids: Vec<String>,
    #[serde(default, rename = "bloatwarePatterns")]
    bloatware_patterns: Option<Vec<String>>,
}

#[derive(Deserialize, Debug, Clone)]
#[allow(dead_code)]
struct BloatwareEntry {
    pattern: String,
    title: String,
    #[serde(default)]
    description: String,
    group: String,
    #[serde(default)]
    recommended: bool,
}

#[derive(Deserialize, Debug, Clone)]
struct BloatwareFile {
    entries: Vec<BloatwareEntry>,
}

/// Versioned profile envelope, identical shape to the GUI's ProfileV1.
#[derive(Deserialize, Debug, Clone)]
#[allow(dead_code)]
struct ProfileEnvelope {
    #[serde(rename = "schemaVersion")]
    schema_version: u32,
    name: String,
    #[serde(default)]
    tagline: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    gradient: String,
    #[serde(rename = "tweakIds")]
    tweak_ids: Vec<String>,
    #[serde(default, rename = "bloatwarePatterns")]
    bloatware_patterns: Option<Vec<String>>,
}

struct Catalog {
    tweaks: Vec<Tweak>,
    profiles: Vec<Profile>,
    bloatware: Vec<BloatwareEntry>,
    tweaks_by_id: HashMap<String, usize>,
}

impl Catalog {
    fn load() -> Result<Self, String> {
        let tweaks: Vec<Tweak> = serde_json::from_str(include_str!("../data/tweaks.json"))
            .map_err(|e| format!("parse tweaks.json failed: {e}"))?;
        let profiles: Vec<Profile> = serde_json::from_str(include_str!("../data/profiles.json"))
            .map_err(|e| format!("parse profiles.json failed: {e}"))?;
        let bloat: BloatwareFile = serde_json::from_str(include_str!("../data/bloatware.json"))
            .map_err(|e| format!("parse bloatware.json failed: {e}"))?;
        let mut by_id = HashMap::with_capacity(tweaks.len());
        for (i, t) in tweaks.iter().enumerate() {
            by_id.insert(t.id.clone(), i);
        }
        Ok(Self {
            tweaks,
            profiles,
            bloatware: bloat.entries,
            tweaks_by_id: by_id,
        })
    }

    fn tweak(&self, id: &str) -> Option<&Tweak> {
        self.tweaks_by_id.get(id).map(|&i| &self.tweaks[i])
    }

    fn profile(&self, id: &str) -> Option<&Profile> {
        self.profiles.iter().find(|p| p.id == id)
    }

    fn recommended_tweak_ids(&self) -> Vec<String> {
        self.tweaks
            .iter()
            .filter(|t| t.recommended)
            .map(|t| t.id.clone())
            .collect()
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Argument parsing.

#[derive(Debug, Default)]
struct Args {
    command: Command,
    silent: bool,
    json: bool,
    yes: bool,
    include_bloatware: bool,
    category: Option<String>,
}

#[derive(Debug, Default)]
enum Command {
    #[default]
    None,
    Help,
    Version,
    ListProfiles,
    ListTweaks,
    ListBloatware,
    ApplyProfile(String),
    ApplyTweak(Vec<String>),
    RevertTweak(Vec<String>),
    CheckTweak(Vec<String>),
    RemoveBloat(Vec<String>),
    ImportProfile { path: String, apply: bool },
    ExportState,
}

fn parse_args(argv: &[String]) -> Result<Args, String> {
    let mut a = Args::default();
    let mut i = 0;
    let mut import_apply = false;
    let mut import_path: Option<String> = None;

    while i < argv.len() {
        let arg = &argv[i];
        let next = |i: &mut usize, flag: &str| -> Result<String, String> {
            *i += 1;
            argv.get(*i)
                .cloned()
                .ok_or_else(|| format!("{flag} requires a value"))
        };
        match arg.as_str() {
            "-h" | "--help" => a.command = Command::Help,
            "-V" | "--version" => a.command = Command::Version,
            "--silent" | "-q" | "--quiet" => a.silent = true,
            "--json" => a.json = true,
            "--yes" | "-y" => a.yes = true,
            "--include-bloatware" => a.include_bloatware = true,
            "--apply" => import_apply = true,
            "--category" => a.category = Some(next(&mut i, "--category")?),
            "--list-profiles" => a.command = Command::ListProfiles,
            "--list-tweaks" => a.command = Command::ListTweaks,
            "--list-bloatware" => a.command = Command::ListBloatware,
            "--export-state" => a.command = Command::ExportState,
            "--apply-profile" => {
                a.command = Command::ApplyProfile(next(&mut i, "--apply-profile")?);
            }
            "--apply-tweak" => {
                let ids = split_ids(&next(&mut i, "--apply-tweak")?);
                a.command = Command::ApplyTweak(ids);
            }
            "--revert-tweak" => {
                let ids = split_ids(&next(&mut i, "--revert-tweak")?);
                a.command = Command::RevertTweak(ids);
            }
            "--check-tweak" => {
                let ids = split_ids(&next(&mut i, "--check-tweak")?);
                a.command = Command::CheckTweak(ids);
            }
            "--remove-bloat" => {
                let patterns = split_ids(&next(&mut i, "--remove-bloat")?);
                a.command = Command::RemoveBloat(patterns);
            }
            "--import-profile" => {
                import_path = Some(next(&mut i, "--import-profile")?);
            }
            // Tolerated no-op flags used by other layers (main.rs / lib.rs handle them).
            // `--autostart` is appended by the autostart plugin when Windows boots Reclaim
            // from the Run key — it tells lib.rs to hide the main window on launch.
            "--no-elevate" | "--cli" | "--autostart" => {}
            other => return Err(format!("unknown argument: {other}")),
        }
        i += 1;
    }

    if let Some(path) = import_path {
        // `--import-profile foo.reclaim` without `--apply` just validates +
        // prints the parsed envelope; with `--apply` it executes.
        a.command = Command::ImportProfile {
            path,
            apply: import_apply,
        };
    }

    Ok(a)
}

fn split_ids(s: &str) -> Vec<String> {
    s.split(',')
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
        .collect()
}

/// True if argv looks like a CLI invocation that should bypass the GUI.
pub fn argv_is_cli(argv: &[String]) -> bool {
    // First element is the exe path on Windows. Anything starting with `--`
    // beyond that counts, except for GUI-internal flags that get passed through.
    argv.iter().skip(1).any(|a| {
        let s = a.as_str();
        !matches!(s, "--no-elevate" | "--autostart")
            && (s.starts_with("--") || matches!(s, "-h" | "-V" | "-q" | "-y"))
    })
}

// ────────────────────────────────────────────────────────────────────────────
// Output helpers.

macro_rules! out {
    ($args:expr, $($t:tt)*) => {
        if !$args.silent { println!($($t)*); }
    };
}

macro_rules! err {
    ($($t:tt)*) => { eprintln!($($t)*) };
}

fn print_help() {
    let exe = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
        .unwrap_or_else(|| "reclaim.exe".into());
    println!(
        "Reclaim {VERSION} — Windows debloat & privacy CLI

USAGE:
  {exe} [FLAGS]                            Launch GUI (default).
  {exe} <COMMAND> [OPTIONS]                Run headless.

COMMANDS:
  --list-profiles                          Print every built-in profile.
  --list-tweaks [--category <c>]           Print every tweak (optionally one category).
  --list-bloatware                         Print every known AppX pattern.
  --apply-profile <id> [--include-bloatware]
                                           Apply every tweak in a profile. Pass --include-bloatware
                                           to also remove the profile's AppX patterns.
  --apply-tweak <id1>[,id2,...]            Apply one or more tweaks by id.
  --revert-tweak <id1>[,id2,...]           Revert one or more tweaks by id.
  --check-tweak <id1>[,id2,...]            Print on/off state for the given tweaks (use --json
                                           for machine-readable output).
  --remove-bloat <p1>[,p2,...]             Remove AppX packages matching the given patterns
                                           (PowerShell wildcards: '*Spotify*' etc.).
  --import-profile <file.reclaim> [--apply]
                                           Load a custom profile envelope. Without --apply, just
                                           validates and prints the parsed contents. With --apply,
                                           runs the tweaks + bloatware patterns inside.
  --export-state [--json]                  Dump every tweak's current on/off state.

GLOBAL FLAGS:
  --silent, -q          Suppress informational output (errors still go to stderr).
  --json                Emit machine-readable JSON where supported.
  --yes, -y             Skip confirmation prompts. Currently no command prompts; reserved.
  -h, --help            This help.
  -V, --version         Print version.

EXAMPLES:
  {exe} --apply-profile basics --silent
  {exe} --apply-tweak telemetry-off,advertising-id-off
  {exe} --remove-bloat \"*Spotify*,Microsoft.BingNews\"
  {exe} --import-profile gold-image.reclaim --apply --silent
  {exe} --export-state --json > current-state.json

Most write operations need Administrator. Tweaks targeting HKLM or shell ops
fail with a clear message when run unelevated.",
        VERSION = env!("CARGO_PKG_VERSION"),
        exe = exe,
    );
}

const VERSION: &str = env!("CARGO_PKG_VERSION");

// ────────────────────────────────────────────────────────────────────────────
// Executors.

fn tweak_requires_admin(t: &Tweak) -> bool {
    for op in &t.apply {
        match op {
            TweakOp::Reg(r) if r.hive == "HKLM" => return true,
            TweakOp::Shell(_) => return true,
            _ => {}
        }
    }
    false
}

fn op_to_reg_value(op: &RegOpData) -> RegValue {
    RegValue {
        hive: op.hive.clone(),
        path: op.path.clone(),
        name: op.name.clone(),
        kind: op.kind.clone(),
        value: op.value.clone(),
    }
}

fn op_to_locator(op: &RegOpData) -> RegLocator {
    RegLocator {
        hive: op.hive.clone(),
        path: op.path.clone(),
        name: op.name.clone(),
    }
}

fn apply_op(op: &TweakOp) -> Result<(), String> {
    match op {
        TweakOp::Reg(r) => reg_write_sync(&op_to_reg_value(r)),
        TweakOp::Shell(s) => {
            let res = run_ps(&s.script);
            if res.success {
                Ok(())
            } else {
                Err(if !res.stderr.trim().is_empty() {
                    res.stderr.trim().to_string()
                } else {
                    format!("PowerShell exit {}", res.code)
                })
            }
        }
    }
}

fn apply_tweak_inner(t: &Tweak) -> Result<(), String> {
    for op in &t.apply {
        apply_op(op)?;
    }
    Ok(())
}

fn revert_tweak_inner(t: &Tweak) -> Result<(), String> {
    if let Some(revert) = &t.revert {
        for op in revert {
            apply_op(op)?;
        }
        return Ok(());
    }
    // No explicit revert — fall back to defaultValue or delete-on-revert,
    // matching executor.ts.
    for op in &t.apply {
        if let TweakOp::Reg(r) = op {
            let loc = op_to_locator(r);
            let attempt = if let Some(dv) = &r.default_value {
                let mut rv = op_to_reg_value(r);
                rv.value = dv.clone();
                reg_write_sync(&rv)
            } else {
                reg_delete_value_sync(&loc)
            };
            // Best-effort, like the GUI executor.
            let _ = attempt;
        }
    }
    Ok(())
}

fn check_tweak_state(t: &Tweak) -> &'static str {
    let checks: Vec<&RegOpData> = if let Some(c) = &t.check {
        c.iter()
            .filter_map(|o| if let TweakOp::Reg(r) = o { Some(r) } else { None })
            .collect()
    } else {
        t.apply
            .iter()
            .filter_map(|o| if let TweakOp::Reg(r) = o { Some(r) } else { None })
            .collect()
    };
    if checks.is_empty() {
        return "unknown";
    }
    for c in checks {
        let loc = op_to_locator(c);
        let v = reg_read_sync(&loc);
        match v {
            None => return "off",
            Some(actual) => {
                if actual != c.value {
                    return "off";
                }
            }
        }
    }
    "on"
}

/// Remove every AppX package + provisioning matching the given wildcard
/// pattern. Static PowerShell script per call; the pattern is single-quote
/// escaped for safety.
fn remove_bloat_pattern(pattern: &str) -> Result<String, String> {
    let escaped = pattern.replace('\'', "''");
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$name = '{p}'
$removed = @()
Get-AppxPackage -AllUsers -Name $name -ErrorAction SilentlyContinue | ForEach-Object {{
    try {{ Remove-AppxPackage -AllUsers -Package $_.PackageFullName -ErrorAction Stop; $removed += $_.PackageFullName }} catch {{}}
}}
Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue |
    Where-Object {{ $_.DisplayName -like $name }} | ForEach-Object {{
        try {{ Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName | Out-Null; $removed += $_.PackageName }} catch {{}}
    }}
if ($removed.Count -eq 0) {{ Write-Output 'no-match' }} else {{ $removed -join "`n" }}
"#,
        p = escaped
    );
    let res = run_ps(&script);
    if res.success {
        Ok(res.stdout.trim().to_string())
    } else {
        Err(res.stderr.trim().to_string())
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Activity log mirror — same JSON-lines format the GUI writes.

fn log_event(level: &str, action: &str, target: &str, message: &str, details: Option<&str>) {
    use std::io::Write;
    let dir = dirs::data_dir().map(|d| d.join("Reclaim"));
    let Some(dir) = dir else {
        return;
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("activity.log");
    let ts: i64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let entry = serde_json::json!({
        "ts": ts,
        "level": level,
        "action": action,
        "target": target,
        "message": message,
        "details": details,
    });
    let Ok(line) = serde_json::to_string(&entry) else {
        return;
    };
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(f, "{line}");
    }
}

fn current_elevated() -> bool {
    crate::sysinfo::check_elevated()
}

// ────────────────────────────────────────────────────────────────────────────
// Subcommand dispatch.

fn cmd_list_profiles(args: &Args, cat: &Catalog) -> ExitU8 {
    if args.json {
        let arr: Vec<_> = cat
            .profiles
            .iter()
            .map(|p| {
                serde_json::json!({
                    "id": p.id,
                    "name": p.name,
                    "tagline": p.tagline,
                    "tweakCount": p.tweak_ids.len(),
                    "bloatwareCount": p.bloatware_patterns.as_ref().map(|v| v.len()).unwrap_or(0),
                })
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&arr).unwrap_or_else(|_| "[]".into())
        );
        return 0;
    }
    out!(args, "{:<14} {:<24} TWEAKS  BLOAT  TAGLINE", "ID", "NAME");
    for p in &cat.profiles {
        let bloat = p.bloatware_patterns.as_ref().map(|v| v.len()).unwrap_or(0);
        let tweaks = if p.id == "basics" {
            cat.recommended_tweak_ids().len()
        } else {
            p.tweak_ids.len()
        };
        out!(
            args,
            "{:<14} {:<24} {:<7} {:<6} {}",
            p.id,
            p.name,
            tweaks,
            bloat,
            p.tagline
        );
    }
    0
}

fn cmd_list_tweaks(args: &Args, cat: &Catalog) -> ExitU8 {
    let filter = args.category.as_deref();
    let iter = cat
        .tweaks
        .iter()
        .filter(|t| filter.map(|c| t.category == c).unwrap_or(true));
    if args.json {
        let arr: Vec<_> = iter
            .map(|t| {
                serde_json::json!({
                    "id": t.id,
                    "category": t.category,
                    "title": t.title,
                    "recommended": t.recommended,
                    "requiresAdmin": tweak_requires_admin(t),
                    "description": t.description,
                })
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&arr).unwrap_or_else(|_| "[]".into())
        );
        return 0;
    }
    let mut count = 0;
    out!(args, "{:<40} {:<14} ADMIN  REC  TITLE", "ID", "CATEGORY");
    for t in iter {
        let admin = if tweak_requires_admin(t) { "yes" } else { "no" };
        let rec = if t.recommended { "yes" } else { "no" };
        out!(
            args,
            "{:<40} {:<14} {:<6} {:<4} {}",
            t.id,
            t.category,
            admin,
            rec,
            t.title
        );
        count += 1;
    }
    out!(args, "\n{} tweaks", count);
    0
}

fn cmd_list_bloatware(args: &Args, cat: &Catalog) -> ExitU8 {
    if args.json {
        let arr: Vec<_> = cat
            .bloatware
            .iter()
            .map(|b| {
                serde_json::json!({
                    "pattern": b.pattern,
                    "title": b.title,
                    "group": b.group,
                    "recommended": b.recommended,
                })
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&arr).unwrap_or_else(|_| "[]".into())
        );
        return 0;
    }
    out!(args, "{:<42} {:<14} REC  TITLE", "PATTERN", "GROUP");
    for b in &cat.bloatware {
        let rec = if b.recommended { "yes" } else { "no" };
        out!(args, "{:<42} {:<14} {:<4} {}", b.pattern, b.group, rec, b.title);
    }
    out!(args, "\n{} patterns", cat.bloatware.len());
    0
}

fn apply_tweak_ids(args: &Args, cat: &Catalog, ids: &[String]) -> ExitU8 {
    let mut ok = 0usize;
    let mut failed = 0usize;
    let mut skipped = 0usize;
    let elevated = current_elevated();

    for id in ids {
        let Some(t) = cat.tweak(id) else {
            err!("[skip] unknown tweak id: {id}");
            skipped += 1;
            continue;
        };
        if tweak_requires_admin(t) && !elevated {
            err!("[skip] '{}' requires Administrator", t.id);
            skipped += 1;
            continue;
        }
        match apply_tweak_inner(t) {
            Ok(_) => {
                ok += 1;
                out!(args, "[ok]   {} — {}", t.id, t.title);
                log_event("success", "tweak.apply", &t.title, &format!("Enabled '{}'", t.title), None);
            }
            Err(e) => {
                failed += 1;
                err!("[fail] {} — {}: {}", t.id, t.title, e);
                log_event(
                    "error",
                    "tweak.apply",
                    &t.title,
                    &format!("Failed to enable '{}'", t.title),
                    Some(&e),
                );
            }
        }
    }
    summary(args, "apply", ok, failed, skipped);
    if failed > 0 {
        1
    } else {
        0
    }
}

fn revert_tweak_ids(args: &Args, cat: &Catalog, ids: &[String]) -> ExitU8 {
    let mut ok = 0usize;
    let mut failed = 0usize;
    let mut skipped = 0usize;
    let elevated = current_elevated();

    for id in ids {
        let Some(t) = cat.tweak(id) else {
            err!("[skip] unknown tweak id: {id}");
            skipped += 1;
            continue;
        };
        if tweak_requires_admin(t) && !elevated {
            err!("[skip] '{}' requires Administrator", t.id);
            skipped += 1;
            continue;
        }
        match revert_tweak_inner(t) {
            Ok(_) => {
                ok += 1;
                out!(args, "[ok]   {} — {}", t.id, t.title);
                log_event(
                    "success",
                    "tweak.revert",
                    &t.title,
                    &format!("Reverted '{}'", t.title),
                    None,
                );
            }
            Err(e) => {
                failed += 1;
                err!("[fail] {} — {}: {}", t.id, t.title, e);
                log_event(
                    "error",
                    "tweak.revert",
                    &t.title,
                    &format!("Failed to revert '{}'", t.title),
                    Some(&e),
                );
            }
        }
    }
    summary(args, "revert", ok, failed, skipped);
    if failed > 0 {
        1
    } else {
        0
    }
}

fn check_tweak_ids(args: &Args, cat: &Catalog, ids: &[String]) -> ExitU8 {
    if args.json {
        let arr: Vec<_> = ids
            .iter()
            .map(|id| match cat.tweak(id) {
                Some(t) => serde_json::json!({ "id": id, "state": check_tweak_state(t) }),
                None => serde_json::json!({ "id": id, "state": "unknown-id" }),
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&arr).unwrap_or_else(|_| "[]".into())
        );
        return 0;
    }
    for id in ids {
        match cat.tweak(id) {
            Some(t) => out!(args, "{:<6} {} — {}", check_tweak_state(t), t.id, t.title),
            None => err!("{:<6} {} — unknown tweak id", "??", id),
        }
    }
    0
}

fn cmd_apply_profile(args: &Args, cat: &Catalog, id: &str) -> ExitU8 {
    let Some(p) = cat.profile(id) else {
        err!("unknown profile id: {id}");
        err!("(run --list-profiles to see available ids)");
        return 2;
    };
    out!(args, "Applying profile '{}' — {}", p.name, p.tagline);
    // The 'basics' profile resolves to every recommended tweak. The GUI
    // computes this from ALL_TWEAKS at runtime; we mirror the same logic so
    // newly-added recommended tweaks are picked up automatically.
    let ids: Vec<String> = if p.id == "basics" {
        cat.recommended_tweak_ids()
    } else {
        p.tweak_ids.clone()
    };
    let tweak_ok = apply_tweak_ids(args, cat, &ids) == 0;
    let mut bloat_ok = true;
    if args.include_bloatware {
        if let Some(patterns) = &p.bloatware_patterns {
            bloat_ok = remove_bloat_patterns(args, patterns) == 0;
        }
    }
    if tweak_ok && bloat_ok {
        0
    } else {
        1
    }
}

fn remove_bloat_patterns(args: &Args, patterns: &[String]) -> ExitU8 {
    if !current_elevated() {
        err!("[fail] --remove-bloat requires Administrator");
        return 1;
    }
    let mut ok = 0usize;
    let mut failed = 0usize;
    let mut nomatch = 0usize;
    for p in patterns {
        match remove_bloat_pattern(p) {
            Ok(s) => {
                if s == "no-match" {
                    nomatch += 1;
                    out!(args, "[skip] {p} — no installed package matches");
                } else {
                    ok += 1;
                    out!(args, "[ok]   {p}");
                    log_event(
                        "success",
                        "bloatware.remove",
                        p,
                        &format!("Removed packages matching '{p}'"),
                        Some(&s),
                    );
                }
            }
            Err(e) => {
                failed += 1;
                err!("[fail] {p}: {e}");
                log_event(
                    "error",
                    "bloatware.remove",
                    p,
                    &format!("Failed to remove '{p}'"),
                    Some(&e),
                );
            }
        }
    }
    summary(args, "remove-bloat", ok, failed, nomatch);
    if failed > 0 {
        1
    } else {
        0
    }
}

fn cmd_import_profile(args: &Args, cat: &Catalog, path: &str, apply: bool) -> ExitU8 {
    let raw = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            err!("read {path} failed: {e}");
            return 2;
        }
    };
    let env: ProfileEnvelope = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            err!("parse {path} failed: {e}");
            return 2;
        }
    };
    if env.schema_version != 1 {
        err!("unsupported schemaVersion: {}", env.schema_version);
        return 2;
    }
    let known: std::collections::HashSet<&str> =
        cat.tweaks.iter().map(|t| t.id.as_str()).collect();
    let (known_ids, unknown): (Vec<String>, Vec<String>) = env
        .tweak_ids
        .iter()
        .cloned()
        .partition(|id| known.contains(id.as_str()));

    out!(
        args,
        "Imported profile '{}' — {}",
        env.name,
        env.tagline
    );
    out!(
        args,
        "  {} known tweak(s), {} unknown (will be skipped), {} bloatware pattern(s)",
        known_ids.len(),
        unknown.len(),
        env.bloatware_patterns.as_ref().map(|v| v.len()).unwrap_or(0),
    );
    if !unknown.is_empty() {
        for u in &unknown {
            err!("  [unknown tweak] {u}");
        }
    }

    if !apply {
        out!(args, "(dry run — pass --apply to execute)");
        return 0;
    }

    let tweak_ok = apply_tweak_ids(args, cat, &known_ids) == 0;
    let mut bloat_ok = true;
    if args.include_bloatware {
        if let Some(patterns) = &env.bloatware_patterns {
            bloat_ok = remove_bloat_patterns(args, patterns) == 0;
        }
    }
    if tweak_ok && bloat_ok {
        0
    } else {
        1
    }
}

fn cmd_export_state(args: &Args, cat: &Catalog) -> ExitU8 {
    let mut out_vec = Vec::with_capacity(cat.tweaks.len());
    for t in &cat.tweaks {
        out_vec.push(serde_json::json!({
            "id": t.id,
            "category": t.category,
            "title": t.title,
            "state": check_tweak_state(t),
        }));
    }
    if args.json || args.silent {
        println!(
            "{}",
            serde_json::to_string_pretty(&out_vec).unwrap_or_else(|_| "[]".into())
        );
    } else {
        for v in &out_vec {
            println!(
                "{:<6} {} — {}",
                v["state"].as_str().unwrap_or("?"),
                v["id"].as_str().unwrap_or(""),
                v["title"].as_str().unwrap_or(""),
            );
        }
    }
    0
}

fn summary(args: &Args, op: &str, ok: usize, failed: usize, skipped: usize) {
    if args.silent {
        return;
    }
    println!(
        "\n{op}: {ok} ok, {failed} failed, {skipped} skipped",
        op = op,
        ok = ok,
        failed = failed,
        skipped = skipped
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Console attachment so a GUI-subsystem binary can still write to the parent
// terminal when invoked from cmd / PowerShell.

fn attach_parent_console() {
    use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
    unsafe {
        let _ = AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point.

pub fn run() -> ExitCode {
    attach_parent_console();

    let argv: Vec<String> = std::env::args().collect();
    let args = match parse_args(&argv[1..]) {
        Ok(a) => a,
        Err(e) => {
            err!("error: {e}");
            err!("run with --help for usage.");
            return ExitCode::from(2);
        }
    };

    if matches!(args.command, Command::Help) {
        print_help();
        return ExitCode::SUCCESS;
    }
    if matches!(args.command, Command::Version) {
        println!("reclaim {}", VERSION);
        return ExitCode::SUCCESS;
    }

    let cat = match Catalog::load() {
        Ok(c) => c,
        Err(e) => {
            err!("catalog load failed: {e}");
            return ExitCode::from(2);
        }
    };

    let code: ExitU8 = match &args.command {
        Command::Help => unreachable!(),
        Command::Version => unreachable!(),
        Command::None => {
            print_help();
            0
        }
        Command::ListProfiles => cmd_list_profiles(&args, &cat),
        Command::ListTweaks => cmd_list_tweaks(&args, &cat),
        Command::ListBloatware => cmd_list_bloatware(&args, &cat),
        Command::ApplyProfile(id) => cmd_apply_profile(&args, &cat, id),
        Command::ApplyTweak(ids) => apply_tweak_ids(&args, &cat, ids),
        Command::RevertTweak(ids) => revert_tweak_ids(&args, &cat, ids),
        Command::CheckTweak(ids) => check_tweak_ids(&args, &cat, ids),
        Command::RemoveBloat(patterns) => remove_bloat_patterns(&args, patterns),
        Command::ImportProfile { path, apply } => cmd_import_profile(&args, &cat, path, *apply),
        Command::ExportState => cmd_export_state(&args, &cat),
    };
    ExitCode::from(code)
}
