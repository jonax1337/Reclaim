use serde::{Deserialize, Serialize};

use crate::tweaks::{ps_parse_error, run_ps};

const GROUP_PREFIX: &str = "Reclaim: ";

#[derive(Serialize, Clone)]
pub struct FirewallBlock {
    pub name: String,
    pub rule_count: u32,
    pub enabled_count: u32,
}

#[tauri::command]
pub async fn firewall_list_blocks() -> Result<Vec<FirewallBlock>, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$rules = Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Group -like 'Reclaim:*' }
$groups = $rules | Group-Object -Property Group
$result = foreach ($g in $groups) {
    $enabled = ($g.Group | Where-Object { $_.Enabled -eq $true -or $_.Enabled -eq 'True' }).Count
    [pscustomobject]@{
        name = $g.Name
        rule_count = $g.Count
        enabled_count = $enabled
    }
}
$result | ConvertTo-Json -Compress -Depth 3
"#;
    let r = run_ps(script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(vec![]);
    }
    let v: serde_json::Value = serde_json::from_str(out)
        .map_err(|e| ps_parse_error("Firewall blocks", &e.to_string(), out, &r.stderr))?;
    let arr: Vec<serde_json::Value> = match v {
        serde_json::Value::Array(a) => a,
        other => vec![other],
    };
    let mut out_vec = Vec::with_capacity(arr.len());
    for v in arr {
        let full_name = v.get("name").and_then(|x| x.as_str()).unwrap_or("");
        let display = full_name.strip_prefix(GROUP_PREFIX).unwrap_or(full_name);
        out_vec.push(FirewallBlock {
            name: display.to_string(),
            rule_count: v.get("rule_count").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            enabled_count: v
                .get("enabled_count")
                .and_then(|x| x.as_u64())
                .unwrap_or(0) as u32,
        });
    }
    Ok(out_vec)
}

#[derive(Deserialize)]
pub struct FirewallApply {
    pub name: String,
    /// Absolute paths to executables to block outbound.
    pub programs: Vec<String>,
    /// Remote addresses / CIDR ranges to block outbound.
    pub remote_addresses: Vec<String>,
}

fn valid_name(s: &str) -> bool {
    !s.is_empty()
        && s.len() < 120
        && !s.contains('\'')
        && !s.contains('"')
        && !s.contains('\n')
        && !s.contains('\r')
        && !s.contains('`')
        && !s.contains('$')
}

fn valid_program(s: &str) -> bool {
    !s.is_empty()
        && s.len() < 1024
        && !s.contains('\'')
        && !s.contains('"')
        && !s.contains('\n')
        && !s.contains('\r')
        && !s.contains('`')
        && !s.contains('$')
        && s.contains(':')
}

fn valid_address(s: &str) -> bool {
    if s.is_empty() || s.len() > 64 {
        return false;
    }
    s.chars()
        .all(|c| c.is_ascii_hexdigit() || c == '.' || c == ':' || c == '/' || c == '-')
}

#[tauri::command]
pub async fn firewall_apply_block(apply: FirewallApply) -> Result<u32, String> {
    if !valid_name(&apply.name) {
        return Err("Invalid block name".into());
    }
    if apply.programs.is_empty() && apply.remote_addresses.is_empty() {
        return Err("Nothing to block".into());
    }
    for p in &apply.programs {
        if !valid_program(p) {
            return Err(format!("Rejected program path: {p}"));
        }
    }
    for a in &apply.remote_addresses {
        if !valid_address(a) {
            return Err(format!("Rejected address: {a}"));
        }
    }

    let group = format!("{GROUP_PREFIX}{}", apply.name);
    let mut script = String::new();
    script.push_str("$ErrorActionPreference = 'Stop'\n");
    // Wipe previous rules in this group so apply is idempotent.
    script.push_str(&format!(
        "Get-NetFirewallRule -Group '{group}' -ErrorAction SilentlyContinue | \
         Remove-NetFirewallRule -ErrorAction SilentlyContinue\n",
        group = group.replace('\'', "''"),
    ));

    let mut created: u32 = 0;
    for (i, prog) in apply.programs.iter().enumerate() {
        let name = format!("{} (program {})", apply.name, i + 1);
        script.push_str(&format!(
            "New-NetFirewallRule -DisplayName '{name}' -Group '{group}' -Direction Outbound -Action Block -Program '{prog}' -Profile Any -Enabled True | Out-Null\n",
            name = name.replace('\'', "''"),
            group = group.replace('\'', "''"),
            prog = prog.replace('\'', "''"),
        ));
        created += 1;
    }
    if !apply.remote_addresses.is_empty() {
        let list = apply
            .remote_addresses
            .iter()
            .map(|a| format!("'{a}'"))
            .collect::<Vec<_>>()
            .join(",");
        let name = format!("{} (addresses)", apply.name);
        script.push_str(&format!(
            "New-NetFirewallRule -DisplayName '{name}' -Group '{group}' -Direction Outbound -Action Block -RemoteAddress @({list}) -Profile Any -Enabled True | Out-Null\n",
            name = name.replace('\'', "''"),
            group = group.replace('\'', "''"),
        ));
        created += 1;
    }
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(created)
}

#[tauri::command]
pub async fn firewall_remove_block(name: String) -> Result<(), String> {
    if !valid_name(&name) {
        return Err("Invalid block name".into());
    }
    let group = format!("{GROUP_PREFIX}{name}");
    let script = format!(
        "$ErrorActionPreference = 'Stop'; \
         Get-NetFirewallRule -Group '{group}' -ErrorAction SilentlyContinue | \
         Remove-NetFirewallRule -ErrorAction SilentlyContinue",
        group = group.replace('\'', "''"),
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}
