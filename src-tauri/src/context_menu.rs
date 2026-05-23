use serde::Serialize;

use crate::tweaks::run_ps;

#[derive(Serialize, Clone)]
pub struct ContextMenuEntry {
    pub clsid: String,
    pub name: String,
    pub friendly: Option<String>,
    pub disabled: bool,
    pub categories: Vec<String>,
}

const ENUM_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'

# Read the "Blocked" set — CLSIDs listed here are ignored by the shell.
$blocked = @{}
$blockKey = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked'
if (Test-Path -LiteralPath $blockKey) {
    foreach ($p in (Get-Item -LiteralPath $blockKey).Property) {
        $blocked[$p.ToLower()] = $true
    }
}

$paths = @(
    @{ Category = 'Files';                  Path = 'Registry::HKEY_CLASSES_ROOT\*\ShellEx\ContextMenuHandlers' },
    @{ Category = 'Folders';                Path = 'Registry::HKEY_CLASSES_ROOT\Directory\ShellEx\ContextMenuHandlers' },
    @{ Category = 'Folder background';      Path = 'Registry::HKEY_CLASSES_ROOT\Directory\Background\ShellEx\ContextMenuHandlers' },
    @{ Category = 'Drives';                 Path = 'Registry::HKEY_CLASSES_ROOT\Drive\shellex\ContextMenuHandlers' },
    @{ Category = 'All filesystem objects'; Path = 'Registry::HKEY_CLASSES_ROOT\AllFilesystemObjects\ShellEx\ContextMenuHandlers' }
)

$entries = @{}
foreach ($entry in $paths) {
    $cat = $entry.Category
    $p = $entry.Path
    if (-not (Test-Path -LiteralPath $p)) { continue }
    foreach ($k in Get-ChildItem -LiteralPath $p) {
        $name = $k.PSChildName
        $val = (Get-Item -LiteralPath $k.PSPath).GetValue('')
        if (-not $val) { $val = $name }
        $clsid = "$val".Trim()
        $key = $clsid.ToLower()
        if (-not $entries.ContainsKey($key)) {
            $friendly = $null
            if ($clsid -match '^\{[0-9A-Fa-f-]+\}$') {
                $cp = "Registry::HKEY_CLASSES_ROOT\CLSID\$clsid"
                if (Test-Path -LiteralPath $cp) {
                    $friendly = (Get-Item -LiteralPath $cp).GetValue('')
                }
            }
            $entries[$key] = [pscustomobject]@{
                clsid = $clsid
                name = $name
                friendly = $friendly
                disabled = $blocked.ContainsKey($key)
                categories = @($cat)
            }
        } else {
            $entries[$key].categories = @($entries[$key].categories + $cat | Select-Object -Unique)
        }
    }
}
$entries.Values | ConvertTo-Json -Depth 4 -Compress
"#;

#[tauri::command]
pub async fn context_menu_list() -> Result<Vec<ContextMenuEntry>, String> {
    let r = run_ps(ENUM_SCRIPT);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(vec![]);
    }
    let v: serde_json::Value =
        serde_json::from_str(out).map_err(|e| format!("JSON parse failed: {e}"))?;
    let arr = match v {
        serde_json::Value::Array(a) => a,
        other => vec![other],
    };
    let mut out_vec = Vec::with_capacity(arr.len());
    for entry in arr {
        let clsid = entry
            .get("clsid")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if clsid.is_empty() {
            continue;
        }
        let name = entry
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let friendly = entry
            .get("friendly")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        let disabled = entry
            .get("disabled")
            .and_then(|x| x.as_bool())
            .unwrap_or(false);
        let categories: Vec<String> = entry
            .get("categories")
            .and_then(|x| x.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|s| s.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        out_vec.push(ContextMenuEntry {
            clsid,
            name,
            friendly,
            disabled,
            categories,
        });
    }
    Ok(out_vec)
}

fn valid_clsid(s: &str) -> bool {
    let bytes = s.as_bytes();
    bytes.len() == 38
        && bytes[0] == b'{'
        && bytes[37] == b'}'
        && bytes[9] == b'-'
        && bytes[14] == b'-'
        && bytes[19] == b'-'
        && bytes[24] == b'-'
        && s[1..37].chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

#[tauri::command]
pub async fn context_menu_toggle(clsid: String, disabled: bool) -> Result<(), String> {
    if !valid_clsid(&clsid) {
        return Err(format!("Rejected CLSID: {clsid}"));
    }
    let action = if disabled {
        format!(
            "$bk = 'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Shell Extensions\\Blocked'; \
             if (-not (Test-Path -LiteralPath $bk)) {{ New-Item -Path $bk -Force | Out-Null }}; \
             New-ItemProperty -LiteralPath $bk -Name '{clsid}' -Value '' -PropertyType String -Force | Out-Null"
        )
    } else {
        format!(
            "$bk = 'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Shell Extensions\\Blocked'; \
             if (Test-Path -LiteralPath $bk) {{ Remove-ItemProperty -LiteralPath $bk -Name '{clsid}' -ErrorAction SilentlyContinue }}"
        )
    };
    let r = run_ps(&action);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}
