use serde::{Deserialize, Serialize};

use crate::tweaks::{ps_parse_error, run_ps, PsResult};

const SENTINEL_PREFIX_OPEN: &str = "# >>> Reclaim: ";
const SENTINEL_PREFIX_CLOSE: &str = "# <<< Reclaim: ";
const BACKUP_NAME: &str = "hosts.reclaim.bak";

#[derive(Serialize, Clone)]
pub struct HostsBlock {
    pub name: String,
    pub entry_count: u32,
}

#[derive(Serialize, Clone)]
pub struct AdapterDns {
    pub alias: String,
    pub description: String,
    pub ipv4: Vec<String>,
    pub ipv6: Vec<String>,
    pub is_up: bool,
}

#[cfg(windows)]
fn hosts_path() -> std::path::PathBuf {
    let sys_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    std::path::PathBuf::from(sys_root)
        .join("System32")
        .join("drivers")
        .join("etc")
        .join("hosts")
}

#[cfg(not(windows))]
fn hosts_path() -> std::path::PathBuf {
    std::path::PathBuf::from("/etc/hosts")
}

fn backup_path() -> std::path::PathBuf {
    hosts_path().with_file_name(BACKUP_NAME)
}

fn read_hosts_sync() -> Result<String, String> {
    std::fs::read_to_string(hosts_path()).map_err(|e| format!("Read hosts failed: {e}"))
}

#[tauri::command]
pub async fn read_hosts() -> Result<String, String> {
    read_hosts_sync()
}

fn write_hosts_sync(content: String) -> Result<(), String> {
    let path = hosts_path();
    // Backup current contents before any write so the user always has a way back.
    if path.exists() {
        let bak = backup_path();
        std::fs::copy(&path, &bak).map_err(|e| format!("Backup hosts failed: {e}"))?;
    }
    // Normalize line endings to CRLF — Windows tools expect that in hosts.
    let normalized = if content.contains("\r\n") {
        content
    } else {
        content.replace('\n', "\r\n")
    };
    // Atomic write: stage to a sibling .tmp then rename. fs::rename is atomic
    // on Windows when src/dst share a volume (uses MoveFileEx with
    // MOVEFILE_REPLACE_EXISTING). Prevents a half-written hosts file if the
    // process is killed mid-write or Windows/AV holds the file briefly.
    let tmp = path.with_extension("reclaim.partial");
    {
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&tmp)
            .map_err(|e| format!("Open temp hosts failed: {e}"))?;
        f.write_all(normalized.as_bytes())
            .map_err(|e| format!("Write hosts staging failed: {e}"))?;
        f.sync_all().ok();
    }
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Commit hosts write failed: {e}")
    })
}

#[tauri::command]
pub async fn write_hosts(content: String) -> Result<(), String> {
    write_hosts_sync(content)
}

#[tauri::command]
pub async fn has_hosts_backup() -> bool {
    backup_path().exists()
}

#[tauri::command]
pub async fn restore_hosts_backup() -> Result<(), String> {
    let bak = backup_path();
    if !bak.exists() {
        return Err("No backup file present.".into());
    }
    std::fs::copy(&bak, hosts_path()).map_err(|e| format!("Restore failed: {e}"))?;
    Ok(())
}

fn strip_block(text: &str, name: &str) -> String {
    let open = format!("{SENTINEL_PREFIX_OPEN}{name}");
    let close = format!("{SENTINEL_PREFIX_CLOSE}{name}");
    let mut out = String::with_capacity(text.len());
    let mut skipping = false;
    for line in text.lines() {
        let trimmed = line.trim_end_matches('\r').trim_start();
        if !skipping && trimmed == open {
            skipping = true;
            continue;
        }
        if skipping && trimmed == close {
            skipping = false;
            continue;
        }
        if skipping {
            continue;
        }
        out.push_str(line);
        out.push('\n');
    }
    // Trim trailing blank-line runs that pile up after repeated edits.
    while out.ends_with("\n\n") {
        out.pop();
    }
    out
}

fn build_block(name: &str, entries: &[String]) -> String {
    let mut s = String::new();
    s.push_str(SENTINEL_PREFIX_OPEN);
    s.push_str(name);
    s.push('\n');
    for e in entries {
        let host = e.trim();
        if host.is_empty() || host.starts_with('#') {
            continue;
        }
        // Accept either bare host or full "0.0.0.0 host"; normalize to 0.0.0.0.
        let host_only = host.split_whitespace().last().unwrap_or(host);
        s.push_str("0.0.0.0 ");
        s.push_str(host_only);
        s.push('\n');
    }
    s.push_str(SENTINEL_PREFIX_CLOSE);
    s.push_str(name);
    s.push('\n');
    s
}

#[tauri::command]
pub async fn apply_blocklist(name: String, entries: Vec<String>) -> Result<u32, String> {
    if name.contains('\n') || name.contains('\r') {
        return Err("Blocklist name must not contain newlines.".into());
    }
    let current = read_hosts_sync()?;
    let stripped = strip_block(&current, &name);
    let mut buf = stripped;
    if !buf.ends_with('\n') {
        buf.push('\n');
    }
    if !buf.is_empty() && !buf.ends_with("\n\n") {
        buf.push('\n');
    }
    let block = build_block(&name, &entries);
    let count = entries
        .iter()
        .filter(|e| {
            let t = e.trim();
            !t.is_empty() && !t.starts_with('#')
        })
        .count() as u32;
    buf.push_str(&block);
    write_hosts_sync(buf)?;
    flush_dns_internal();
    Ok(count)
}

#[tauri::command]
pub async fn remove_blocklist(name: String) -> Result<(), String> {
    let current = read_hosts_sync()?;
    let stripped = strip_block(&current, &name);
    write_hosts_sync(stripped)?;
    flush_dns_internal();
    Ok(())
}

#[tauri::command]
pub async fn list_active_blocklists() -> Result<Vec<HostsBlock>, String> {
    let text = read_hosts_sync()?;
    let mut out: Vec<HostsBlock> = Vec::new();
    let mut current: Option<(String, u32)> = None;
    for line in text.lines() {
        let trimmed = line.trim_end_matches('\r').trim_start();
        if let Some(name) = trimmed.strip_prefix(SENTINEL_PREFIX_OPEN) {
            current = Some((name.trim().to_string(), 0));
            continue;
        }
        if let Some(name) = trimmed.strip_prefix(SENTINEL_PREFIX_CLOSE) {
            if let Some((open_name, count)) = current.take() {
                if open_name.trim() == name.trim() {
                    out.push(HostsBlock {
                        name: open_name,
                        entry_count: count,
                    });
                }
            }
            continue;
        }
        if let Some((_, ref mut count)) = current {
            let t = trimmed.trim_start_matches('#').trim();
            if !t.is_empty() {
                *count += 1;
            }
        }
    }
    Ok(out)
}

fn flush_dns_internal() {
    let _ = run_ps("ipconfig /flushdns | Out-Null");
}

#[tauri::command]
pub async fn flush_dns() -> PsResult {
    run_ps("ipconfig /flushdns")
}

#[tauri::command]
pub async fn fetch_blocklist(url: String) -> Result<Vec<String>, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must be http(s).".into());
    }
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("Runtime build failed: {e}"))?;
    let url2 = url.clone();
    let body = rt.block_on(async move {
        let resp = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|e| format!("HTTP client build: {e}"))?
            .get(&url2)
            .header("User-Agent", "Reclaim/0.7 (https://github.com/jonax1337/reclaim)")
            .send()
            .await
            .map_err(|e| format!("HTTP error: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status()));
        }
        resp.text().await.map_err(|e| format!("Body read: {e}"))
    })?;

    let mut hosts: Vec<String> = Vec::new();
    for raw in body.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        // hosts-format: "<ip> <host>" or bare host. Strip inline comments.
        let no_comment = line.split('#').next().unwrap_or("").trim();
        if no_comment.is_empty() {
            continue;
        }
        let parts: Vec<&str> = no_comment.split_whitespace().collect();
        let host_token = if parts.len() >= 2 { parts[1] } else { parts[0] };
        let host = host_token.trim().trim_end_matches('.');
        // Filter out obvious junk: localhost lines, IPv6 specials, empty.
        if host.is_empty()
            || host.eq_ignore_ascii_case("localhost")
            || host.eq_ignore_ascii_case("localhost.localdomain")
            || host.starts_with('[')
            || host == "0.0.0.0"
            || host == "::"
            || host == "127.0.0.1"
            || !host.contains('.')
        {
            continue;
        }
        hosts.push(host.to_string());
    }
    hosts.sort();
    hosts.dedup();
    Ok(hosts)
}

#[derive(Deserialize)]
pub struct DnsApply {
    pub adapter: String,
    pub ipv4: Vec<String>,
    pub ipv6: Vec<String>,
}

#[tauri::command]
pub async fn get_dns_servers() -> Result<Vec<AdapterDns>, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$ifaces = Get-NetAdapter | Where-Object { $_.HardwareInterface -or $_.Virtual -eq $false } | Select-Object Name, InterfaceDescription, Status
$dns = Get-DnsClientServerAddress | Where-Object { $_.AddressFamily -in 2,23 }
$result = @()
foreach ($i in $ifaces) {
    $v4 = ($dns | Where-Object { $_.InterfaceAlias -eq $i.Name -and $_.AddressFamily -eq 2 } | Select-Object -First 1).ServerAddresses
    $v6 = ($dns | Where-Object { $_.InterfaceAlias -eq $i.Name -and $_.AddressFamily -eq 23 } | Select-Object -First 1).ServerAddresses
    $result += [PSCustomObject]@{
        alias       = $i.Name
        description = $i.InterfaceDescription
        ipv4        = @($v4)
        ipv6        = @($v6)
        is_up       = ($i.Status -eq 'Up')
    }
}
$result | ConvertTo-Json -Compress -Depth 4
"#;
    let r = run_ps(script);
    if !r.success {
        return Err(r.stderr);
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Ok(vec![]);
    }
    let parsed: serde_json::Value = serde_json::from_str(out)
        .map_err(|e| ps_parse_error("DNS adapters", &e.to_string(), out, &r.stderr))?;
    let arr = match parsed {
        serde_json::Value::Array(a) => a,
        other => vec![other],
    };
    let mut adapters = Vec::with_capacity(arr.len());
    for v in arr {
        let str_arr = |key: &str| -> Vec<String> {
            v.get(key)
                .and_then(|x| x.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|s| s.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default()
        };
        adapters.push(AdapterDns {
            alias: v.get("alias").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            description: v
                .get("description")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            ipv4: str_arr("ipv4"),
            ipv6: str_arr("ipv6"),
            is_up: v.get("is_up").and_then(|x| x.as_bool()).unwrap_or(false),
        });
    }
    Ok(adapters)
}

fn validate_ip(ip: &str) -> bool {
    !ip.is_empty()
        && ip
            .chars()
            .all(|c| c.is_ascii_hexdigit() || c == '.' || c == ':' || c == '%')
}

fn ps_quote(s: &str) -> String {
    s.replace('\'', "''")
}

#[tauri::command]
pub async fn set_dns_servers(apply: DnsApply) -> Result<(), String> {
    if apply.adapter.trim().is_empty() {
        return Err("Adapter name required.".into());
    }
    for ip in apply.ipv4.iter().chain(apply.ipv6.iter()) {
        if !validate_ip(ip) {
            return Err(format!("Rejected DNS address: {ip}"));
        }
    }
    let alias = ps_quote(&apply.adapter);
    let v4_list = apply
        .ipv4
        .iter()
        .map(|s| format!("'{}'", ps_quote(s)))
        .collect::<Vec<_>>()
        .join(",");
    let v6_list = apply
        .ipv6
        .iter()
        .map(|s| format!("'{}'", ps_quote(s)))
        .collect::<Vec<_>>()
        .join(",");
    let v4_call = if apply.ipv4.is_empty() {
        format!("Set-DnsClientServerAddress -InterfaceAlias '{alias}' -AddressFamily IPv4 -ResetServerAddresses")
    } else {
        format!("Set-DnsClientServerAddress -InterfaceAlias '{alias}' -AddressFamily IPv4 -ServerAddresses @({v4_list})")
    };
    let v6_call = if apply.ipv6.is_empty() {
        format!("Set-DnsClientServerAddress -InterfaceAlias '{alias}' -AddressFamily IPv6 -ResetServerAddresses")
    } else {
        format!("Set-DnsClientServerAddress -InterfaceAlias '{alias}' -AddressFamily IPv6 -ServerAddresses @({v6_list})")
    };
    let script = format!(
        "$ErrorActionPreference = 'Stop'\n{v4_call}\n{v6_call}\nipconfig /flushdns | Out-Null"
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.trim().is_empty() {
            r.stdout
        } else {
            r.stderr
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn reset_dns_servers(adapter: String) -> Result<(), String> {
    if adapter.trim().is_empty() {
        return Err("Adapter name required.".into());
    }
    let alias = ps_quote(&adapter);
    let script = format!(
        "$ErrorActionPreference = 'Stop'\n\
         Set-DnsClientServerAddress -InterfaceAlias '{alias}' -ResetServerAddresses\n\
         ipconfig /flushdns | Out-Null"
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.trim().is_empty() {
            r.stdout
        } else {
            r.stderr
        });
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct DohApply {
    pub server_ip: String,
    pub template: String,
    pub allow_fallback: bool,
}

#[tauri::command]
pub async fn set_doh_template(apply: DohApply) -> Result<(), String> {
    if !validate_ip(&apply.server_ip) {
        return Err("Invalid server IP.".into());
    }
    if !apply.template.starts_with("https://") {
        return Err("DoH template must be https://…".into());
    }
    let ip = ps_quote(&apply.server_ip);
    let tpl = ps_quote(&apply.template);
    let fallback = if apply.allow_fallback { "$true" } else { "$false" };
    let script = format!(
        "$ErrorActionPreference = 'Stop'\n\
         try {{ Remove-DnsClientDohServerAddress -ServerAddress '{ip}' -Confirm:$false -ErrorAction SilentlyContinue }} catch {{}}\n\
         Add-DnsClientDohServerAddress -ServerAddress '{ip}' -DohTemplate '{tpl}' -AllowFallbackToUdp:{fallback} -AutoUpgrade $true"
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.trim().is_empty() {
            r.stdout
        } else {
            r.stderr
        });
    }
    Ok(())
}
