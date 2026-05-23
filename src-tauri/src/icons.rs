use std::collections::HashMap;

use crate::tweaks::run_ps;

/// Extracts the embedded icon from each supplied executable path and returns
/// a `path → base64-PNG` map. Same mechanism Task Manager uses:
/// `System.Drawing.Icon.ExtractAssociatedIcon` via SHGetFileInfo.
///
/// Paths that can't be resolved (UWP package monikers, missing files, etc.)
/// are silently dropped from the result — the caller falls back to a generic
/// placeholder when a path is absent from the map.
#[tauri::command]
pub async fn get_file_icons(paths: Vec<String>) -> Result<HashMap<String, String>, String> {
    // Frontend pre-cleans command lines into exe paths — don't re-parse here,
    // or paths with embedded spaces ('C:\Program Files (x86)\Steam\steam.exe')
    // get truncated at the first whitespace.
    let normalized: Vec<String> = paths
        .into_iter()
        .filter(|p| !p.trim().is_empty())
        .collect();
    if normalized.is_empty() {
        return Ok(HashMap::new());
    }

    // Build a literal PowerShell string array. We single-quote each path and
    // double up any embedded apostrophes, so user-derived paths can't escape
    // the literal.
    let mut paths_literal = String::from("@(");
    for (i, p) in normalized.iter().enumerate() {
        if i > 0 {
            paths_literal.push(',');
        }
        paths_literal.push('\'');
        paths_literal.push_str(&p.replace('\'', "''"));
        paths_literal.push('\'');
    }
    paths_literal.push(')');

    let script = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing

# Resolve a command line or path string to an actual file on disk.
# Handles three shapes Windows uses:
#   "C:\Program Files (x86)\App\app.exe" -arg     (quoted)
#   F:\Riot Games\Riot Client\foo.exe --arg       (unquoted with spaces — progressive trim)
#   %LOCALAPPDATA%\App\bin.exe /silent            (env vars + args)
function ResolveCommand($cmd) {{
    if (-not $cmd) {{ return $null }}
    $cmd = $cmd.Trim()
    if ($cmd.StartsWith('"')) {{
        $end = $cmd.IndexOf('"', 1)
        if ($end -gt 1) {{
            $p = [Environment]::ExpandEnvironmentVariables($cmd.Substring(1, $end - 1))
            if (Test-Path -LiteralPath $p -PathType Leaf) {{ return $p }}
        }}
        return $null
    }}
    # Try the whole thing first — covers paths with no args.
    $expanded = [Environment]::ExpandEnvironmentVariables($cmd)
    if (Test-Path -LiteralPath $expanded -PathType Leaf) {{ return $expanded }}
    # Progressive right-trim by whitespace until we hit a real file.
    $parts = $cmd -split '\s+'
    for ($i = $parts.Length - 1; $i -gt 0; $i--) {{
        $candidate = ($parts[0..($i-1)] -join ' ')
        $expanded = [Environment]::ExpandEnvironmentVariables($candidate)
        if (Test-Path -LiteralPath $expanded -PathType Leaf) {{ return $expanded }}
    }}
    return $null
}}

$paths = {paths_literal}
$out = @{{}}
$wshell = $null
foreach ($p in $paths) {{
    $key = $p
    $resolved = ResolveCommand $p
    if (-not $resolved) {{ continue }}

    # For shortcuts, the .lnk's associated icon is the generic shortcut
    # overlay — resolve to the target so we get the real app icon.
    if ($resolved.ToLower().EndsWith('.lnk')) {{
        try {{
            if ($null -eq $wshell) {{ $wshell = New-Object -ComObject WScript.Shell }}
            $sc = $wshell.CreateShortcut($resolved)
            $tgt = $sc.TargetPath
            if ($tgt -and (Test-Path -LiteralPath $tgt)) {{
                $resolved = $tgt
            }} elseif ($sc.IconLocation) {{
                $iconPath = ($sc.IconLocation -split ',')[0]
                $iconPath = [Environment]::ExpandEnvironmentVariables($iconPath)
                if ($iconPath -and (Test-Path -LiteralPath $iconPath)) {{
                    $resolved = $iconPath
                }}
            }}
        }} catch {{}}
    }}

    # Squirrel updaters (Discord, GitHub Desktop, Slack, …) install Update.exe
    # at the root and the real app binary in 'app-X.Y.Z\<name>.exe'. The Update
    # stub has only a generic exe icon, so jump to the latest app folder.
    if ($resolved.ToLower().EndsWith('\update.exe')) {{
        try {{
            $dir = Split-Path -Parent $resolved
            $appDir = Get-ChildItem -LiteralPath $dir -Directory -Filter 'app-*' -ErrorAction SilentlyContinue |
                      Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($appDir) {{
                $parentName = Split-Path -Leaf $dir
                $candidate = Join-Path $appDir.FullName ($parentName + '.exe')
                if (Test-Path -LiteralPath $candidate) {{
                    $resolved = $candidate
                }} else {{
                    $hit = Get-ChildItem -LiteralPath $appDir.FullName -Filter '*.exe' -ErrorAction SilentlyContinue |
                           Where-Object {{ $_.Name -notmatch '(?i)(update|crash|squirrel|setup)' }} |
                           Select-Object -First 1
                    if ($hit) {{ $resolved = $hit.FullName }}
                }}
            }}
        }} catch {{}}
    }}

    try {{
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($resolved)
        if ($null -eq $icon) {{ continue }}
        $bmp = $icon.ToBitmap()
        $ms = New-Object IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $out[$key] = [Convert]::ToBase64String($ms.ToArray())
        $bmp.Dispose()
        $icon.Dispose()
        $ms.Dispose()
    }} catch {{}}
}}
$out | ConvertTo-Json -Compress
"#
    );

    let r = run_ps(&script);
    if !r.success && r.stdout.is_empty() {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() || out == "{}" || out == "null" {
        return Ok(HashMap::new());
    }
    let v: serde_json::Value =
        serde_json::from_str(out).map_err(|e| format!("JSON parse failed: {e}"))?;
    let obj = match v {
        serde_json::Value::Object(o) => o,
        _ => return Ok(HashMap::new()),
    };
    let mut map = HashMap::with_capacity(obj.len());
    for (k, val) in obj {
        if let Some(s) = val.as_str() {
            map.insert(k, s.to_string());
        }
    }
    Ok(map)
}

/// Extract the real AppX/UWP icon for each supplied package pattern
/// (`Microsoft.BingNews`, `*Spotify*`, …). Returns a `pattern → base64 PNG`
/// map, with patterns whose package isn't installed silently dropped.
///
/// Walks `AppxManifest.xml`, picks the highest-resolution `Square44x44Logo`
/// variant (`.targetsize-256.png` etc.) and reads it directly from the
/// package's `InstallLocation`. These are the same files Windows itself uses
/// for the Start Menu / Settings list.
#[tauri::command]
pub async fn get_appx_icons(patterns: Vec<String>) -> Result<HashMap<String, String>, String> {
    if patterns.is_empty() {
        return Ok(HashMap::new());
    }

    // Build a literal PowerShell array — patterns are catalog data, but we
    // still escape apostrophes defensively.
    let mut arr = String::from("@(");
    for (i, p) in patterns.iter().enumerate() {
        if i > 0 {
            arr.push(',');
        }
        arr.push('\'');
        arr.push_str(&p.replace('\'', "''"));
        arr.push('\'');
    }
    arr.push(')');

    let script = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
$patterns = {arr}
$out = @{{}}

# Resolution variants Microsoft uses inside each Assets folder, best-first.
$variants = @(
    '.targetsize-256.png','.targetsize-256_altform-unplated.png','.targetsize-256_altform-lightunplated.png',
    '.targetsize-96.png','.targetsize-96_altform-unplated.png',
    '.scale-400.png','.scale-200.png','.scale-150.png','.scale-125.png','.scale-100.png',
    '.png'
)

function Find-LogoFile($dir, $base) {{
    foreach ($v in $variants) {{
        $candidate = Join-Path $dir ($base + $v)
        if (Test-Path -LiteralPath $candidate) {{ return $candidate }}
    }}
    # Last-resort fuzzy match.
    $hit = Get-ChildItem -LiteralPath $dir -Filter ($base + '*') -ErrorAction SilentlyContinue |
           Where-Object {{ $_.Extension -in '.png','.jpg','.jpeg','.gif' }} |
           Sort-Object Length -Descending | Select-Object -First 1
    if ($hit) {{ return $hit.FullName }} else {{ return $null }}
}}

foreach ($pat in $patterns) {{
    $pkg = Get-AppxPackage -Name $pat | Select-Object -First 1
    if (-not $pkg) {{
        # Also try provisioned (preinstalled but not yet installed for current user).
        $prov = Get-AppxProvisionedPackage -Online | Where-Object {{ $_.DisplayName -like $pat }} | Select-Object -First 1
        if ($prov) {{
            $pkg = [PSCustomObject]@{{ InstallLocation = $prov.InstallLocation }}
        }}
    }}
    if (-not $pkg -or -not $pkg.InstallLocation) {{ continue }}

    $manifest = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
    if (-not (Test-Path -LiteralPath $manifest)) {{ continue }}

    try {{
        [xml]$xml = Get-Content -LiteralPath $manifest -Raw
    }} catch {{ continue }}

    # Pick a logo path — try Square44x44, then Square150x150, then Logo.
    $apps = $xml.Package.Applications.Application
    if ($apps -is [System.Array]) {{ $app = $apps[0] }} else {{ $app = $apps }}
    $visual = $app.VisualElements
    if (-not $visual) {{ continue }}

    $logoRel = $null
    foreach ($attr in 'Square44x44Logo','Square71x71Logo','Square150x150Logo','Square310x310Logo','Logo') {{
        $v = $visual.$attr
        if ($v) {{ $logoRel = $v; break }}
    }}
    # Fallback: VisualElements/DefaultTile/Square* if any.
    if (-not $logoRel -and $visual.DefaultTile) {{
        foreach ($attr in 'Square150x150Logo','Square310x310Logo') {{
            $v = $visual.DefaultTile.$attr
            if ($v) {{ $logoRel = $v; break }}
        }}
    }}
    if (-not $logoRel) {{ continue }}

    $logoPath = Join-Path $pkg.InstallLocation $logoRel
    $dir = Split-Path -Parent $logoPath
    $name = Split-Path -Leaf $logoPath
    $base = [IO.Path]::GetFileNameWithoutExtension($name)

    $found = Find-LogoFile -dir $dir -base $base
    if (-not $found) {{ continue }}

    try {{
        $bytes = [IO.File]::ReadAllBytes($found)
        $out[$pat] = [Convert]::ToBase64String($bytes)
    }} catch {{}}
}}

$out | ConvertTo-Json -Compress
"#
    );

    let r = run_ps(&script);
    if !r.success && r.stdout.is_empty() {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() || out == "{}" || out == "null" {
        return Ok(HashMap::new());
    }
    let v: serde_json::Value =
        serde_json::from_str(out).map_err(|e| format!("JSON parse failed: {e}"))?;
    let obj = match v {
        serde_json::Value::Object(o) => o,
        _ => return Ok(HashMap::new()),
    };
    let mut map = HashMap::with_capacity(obj.len());
    for (k, val) in obj {
        if let Some(s) = val.as_str() {
            map.insert(k, s.to_string());
        }
    }
    Ok(map)
}

// Shared PS function: identical resolution logic used by every command that
// turns a registry command-line into an exe path on disk. Reused via string
// concatenation so the PS function definition stays in one place.
const RESOLVE_FN: &str = r#"
function ResolveCommand($cmd) {
    if (-not $cmd) { return $null }
    $cmd = $cmd.Trim()
    if ($cmd.StartsWith('"')) {
        $end = $cmd.IndexOf('"', 1)
        if ($end -gt 1) {
            $p = [Environment]::ExpandEnvironmentVariables($cmd.Substring(1, $end - 1))
            if (Test-Path -LiteralPath $p -PathType Leaf) { return $p }
        }
        return $null
    }
    $expanded = [Environment]::ExpandEnvironmentVariables($cmd)
    if (Test-Path -LiteralPath $expanded -PathType Leaf) { return $expanded }
    $parts = $cmd -split '\s+'
    for ($i = $parts.Length - 1; $i -gt 0; $i--) {
        $candidate = ($parts[0..($i-1)] -join ' ')
        $expanded = [Environment]::ExpandEnvironmentVariables($candidate)
        if (Test-Path -LiteralPath $expanded -PathType Leaf) { return $expanded }
    }
    return $null
}
"#;

/// Batch-resolve command lines to actual file paths. Returns a `command →
/// path` map; commands that don't resolve to a real file are omitted.
#[tauri::command]
pub async fn resolve_commands(commands: Vec<String>) -> Result<HashMap<String, String>, String> {
    if commands.is_empty() {
        return Ok(HashMap::new());
    }
    let mut arr = String::from("@(");
    for (i, c) in commands.iter().enumerate() {
        if i > 0 {
            arr.push(',');
        }
        arr.push('\'');
        arr.push_str(&c.replace('\'', "''"));
        arr.push('\'');
    }
    arr.push(')');
    let script = format!(
        "$ErrorActionPreference = 'SilentlyContinue'\n{RESOLVE_FN}\n\
         $cmds = {arr}\n\
         $out = @{{}}\n\
         foreach ($c in $cmds) {{ $r = ResolveCommand $c; if ($r) {{ $out[$c] = $r }} }}\n\
         $out | ConvertTo-Json -Compress"
    );
    let r = run_ps(&script);
    if !r.success && r.stdout.is_empty() {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() || out == "{}" || out == "null" {
        return Ok(HashMap::new());
    }
    let v: serde_json::Value =
        serde_json::from_str(out).map_err(|e| format!("JSON parse failed: {e}"))?;
    let obj = match v {
        serde_json::Value::Object(o) => o,
        _ => return Ok(HashMap::new()),
    };
    let mut map = HashMap::with_capacity(obj.len());
    for (k, val) in obj {
        if let Some(s) = val.as_str() {
            map.insert(k, s.to_string());
        }
    }
    Ok(map)
}

/// Open the Windows Properties dialog for a file (same as right-click →
/// Properties in Explorer). Accepts either a raw path or a command line —
/// resolved internally via the same logic as the icon fetcher.
#[tauri::command]
pub async fn open_properties(command: String) -> Result<(), String> {
    if command.is_empty() || command.contains('\n') {
        return Err("Rejected command".into());
    }
    let script = format!(
        "$ErrorActionPreference = 'Stop'\n{RESOLVE_FN}\n\
         $p = ResolveCommand '{cmd}'\n\
         if (-not $p) {{ throw \"Could not resolve command to a file\" }}\n\
         $parent = Split-Path -Parent $p\n\
         $leaf = Split-Path -Leaf $p\n\
         $shell = New-Object -ComObject Shell.Application\n\
         $folder = $shell.Namespace($parent)\n\
         if ($null -eq $folder) {{ throw \"Could not open folder $parent\" }}\n\
         $item = $folder.ParseName($leaf)\n\
         if ($null -eq $item) {{ throw \"Could not resolve $leaf\" }}\n\
         $item.InvokeVerb('Properties')",
        cmd = command.replace('\'', "''")
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

