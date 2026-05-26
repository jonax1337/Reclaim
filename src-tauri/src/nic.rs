//! Network adapter tuning. Wraps Get-NetAdapter / Get-NetAdapterAdvancedProperty
//! / Set-NetAdapterAdvancedProperty. All inputs are strictly validated before
//! interpolation into PowerShell payloads.

use serde::{Deserialize, Serialize};

use crate::tweaks::{ps_parse_error, run_ps};

#[derive(Serialize, Deserialize, Clone)]
pub struct NicAdapter {
    pub name: String,
    pub interface_description: String,
    pub status: String,
    pub link_speed: String,
    pub mac_address: String,
    pub media_type: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct NicProperty {
    pub registry_keyword: String,
    pub display_name: String,
    pub registry_value: String,
    pub display_value: Option<String>,
    pub default_value: Option<String>,
    pub valid_values: Vec<String>,
    pub valid_display_values: Vec<String>,
}

/// Adapter / property name validation. Both come from `Get-NetAdapter*` output
/// and are echoed back to PowerShell for `Set-NetAdapterAdvancedProperty`.
/// Allow letters, digits, spaces, parens, brackets, dot, dash, underscore,
/// star, hash, plus, and colon. No quotes, semicolons, backticks, $, etc.
fn safe_identifier(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 200
        && s.chars().all(|c| {
            c.is_alphanumeric()
                || matches!(
                    c,
                    ' ' | '(' | ')' | '[' | ']' | '.' | '-' | '_' | '*' | '#' | '+' | ':' | '/' | ','
                )
        })
}

fn safe_value(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 200
        && s.chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

const LIST_ADAPTERS_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
# Get-NetAdapter without -Physical returns everything the Network Connections
# panel shows. We do no further filtering: virtual / tunnel / loopback adapters
# are kept so the user always sees their NIC even if a Killer / Realtek driver
# reports weird metadata. The advanced-property listing per adapter handles the
# "this NIC has no tunable properties" case naturally.
$adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue)
$out = @()
foreach ($a in $adapters) {
    $out += [pscustomobject]@{
        name                  = "$($a.Name)"
        interface_description = "$($a.InterfaceDescription)"
        status                = "$($a.Status)"
        link_speed            = "$($a.LinkSpeed)"
        mac_address           = "$($a.MacAddress)"
        media_type            = "$($a.MediaType)"
    }
}
ConvertTo-Json -InputObject @($out) -Depth 3 -Compress
"#;

#[tauri::command]
pub async fn nic_list_adapters() -> Result<Vec<NicAdapter>, String> {
    let r = run_ps(LIST_ADAPTERS_SCRIPT);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(out)
        .map_err(|e| ps_parse_error("NIC adapter list", &e.to_string(), out, &r.stderr))
}

#[tauri::command]
pub async fn nic_list_properties(adapter_name: String) -> Result<Vec<NicProperty>, String> {
    if !safe_identifier(&adapter_name) {
        return Err(format!("Rejected adapter name: {adapter_name}"));
    }
    // The script lists every advanced property for the named adapter.
    // ValidRegistryValues / ValidDisplayValues are co-indexed arrays —
    // we emit them as parallel string arrays so the frontend can build a Select.
    let script = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
$props = Get-NetAdapterAdvancedProperty -Name '{name}' -ErrorAction SilentlyContinue
if (-not $props) {{ '[]'; return }}
$out = @()
foreach ($p in $props) {{
    $valid = @()
    if ($p.ValidRegistryValues) {{ foreach ($v in $p.ValidRegistryValues) {{ $valid += "$v" }} }}
    $validDisp = @()
    if ($p.ValidDisplayValues) {{ foreach ($v in $p.ValidDisplayValues) {{ $validDisp += "$v" }} }}
    $out += [pscustomobject]@{{
        registry_keyword     = "$($p.RegistryKeyword)"
        display_name         = "$($p.DisplayName)"
        registry_value       = "$($p.RegistryValue)"
        display_value        = if ($p.DisplayValue) {{ "$($p.DisplayValue)" }} else {{ $null }}
        default_value        = if ($p.DefaultRegistryValue) {{ "$($p.DefaultRegistryValue)" }} else {{ $null }}
        valid_values         = $valid
        valid_display_values = $validDisp
    }}
}}
ConvertTo-Json -InputObject @($out) -Depth 4 -Compress
"#,
        name = adapter_name
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(out)
        .map_err(|e| ps_parse_error("NIC property list", &e.to_string(), out, &r.stderr))
}

#[tauri::command]
pub async fn nic_set_property(
    adapter_name: String,
    registry_keyword: String,
    registry_value: String,
) -> Result<(), String> {
    if !safe_identifier(&adapter_name) {
        return Err(format!("Rejected adapter name: {adapter_name}"));
    }
    if !safe_identifier(&registry_keyword) {
        return Err(format!("Rejected registry keyword: {registry_keyword}"));
    }
    if !safe_value(&registry_value) {
        return Err(format!("Rejected registry value: {registry_value}"));
    }
    // Set-NetAdapterAdvancedProperty wants a typed -RegistryValue: numeric
    // properties (RegistryDataType REG_DWORD / REG_SZ-of-int) only accept
    // integers, not quoted strings. We hand PowerShell a try/fallback so the
    // numeric path runs first; if the driver actually wants a string, the
    // catch retries with the quoted form.
    let script = format!(
        r#"
$name = '{name}'
$kw   = '{kw}'
$val  = '{val}'
$num  = 0
$isNum = [int64]::TryParse($val, [ref]$num)
try {{
    if ($isNum) {{
        Set-NetAdapterAdvancedProperty -Name $name -RegistryKeyword $kw -RegistryValue $num -NoRestart -ErrorAction Stop
    }} else {{
        Set-NetAdapterAdvancedProperty -Name $name -RegistryKeyword $kw -RegistryValue $val -NoRestart -ErrorAction Stop
    }}
}} catch {{
    # Numeric path rejected (RegistryDataType REG_SZ on a hex-encoded value, etc.)
    # Retry with the string form before bubbling the error.
    if ($isNum) {{
        Set-NetAdapterAdvancedProperty -Name $name -RegistryKeyword $kw -RegistryValue $val -NoRestart -ErrorAction Stop
    }} else {{
        throw
    }}
}}
"#,
        name = adapter_name,
        kw = registry_keyword,
        val = registry_value
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

#[tauri::command]
pub async fn nic_reset_property(
    adapter_name: String,
    registry_keyword: String,
) -> Result<(), String> {
    if !safe_identifier(&adapter_name) {
        return Err(format!("Rejected adapter name: {adapter_name}"));
    }
    if !safe_identifier(&registry_keyword) {
        return Err(format!("Rejected registry keyword: {registry_keyword}"));
    }
    let script = format!(
        "Reset-NetAdapterAdvancedProperty -Name '{name}' -RegistryKeyword '{kw}' -NoRestart -ErrorAction Stop",
        name = adapter_name,
        kw = registry_keyword
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

/// Restarts the NIC. Some property changes (Jumbo Packet, Speed/Duplex) only
/// take effect after a disable/enable cycle. The frontend offers this as an
/// explicit button so the user knows the link will blink.
#[tauri::command]
pub async fn nic_restart(adapter_name: String) -> Result<(), String> {
    if !safe_identifier(&adapter_name) {
        return Err(format!("Rejected adapter name: {adapter_name}"));
    }
    let script = format!(
        "Restart-NetAdapter -Name '{name}' -Confirm:$false -ErrorAction Stop",
        name = adapter_name
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}
