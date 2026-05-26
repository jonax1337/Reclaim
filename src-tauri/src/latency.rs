//! Latency monitor — parallel ICMP ping via Test-Connection.
//!
//! Returns one RTT (ms) per target, or null on timeout / failure. The frontend
//! calls this on a 1–2 second cadence and builds a sparkline from the rolling
//! samples.

use serde::{Deserialize, Serialize};

use crate::tweaks::{ps_parse_error, run_ps};

#[derive(Serialize, Deserialize, Clone)]
pub struct PingResult {
    pub host: String,
    /// Round-trip time in milliseconds. None = timeout, refused, or unresolvable.
    pub rtt_ms: Option<u32>,
    /// The IPv4/IPv6 address the ping reached, if any.
    pub address: Option<String>,
}

/// Strict host validation — DNS-name or IP-address characters only.
/// Rejects anything that could escape the single-quoted PowerShell argument.
fn safe_host(s: &str) -> bool {
    if s.is_empty() || s.len() > 253 {
        return false;
    }
    s.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':' | '_'))
}

#[tauri::command]
pub async fn latency_ping_hosts(hosts: Vec<String>) -> Result<Vec<PingResult>, String> {
    if hosts.is_empty() {
        return Ok(Vec::new());
    }
    if hosts.len() > 32 {
        return Err("Too many hosts in one batch (max 32)".into());
    }
    for h in &hosts {
        if !safe_host(h) {
            return Err(format!("Rejected host: {h}"));
        }
    }

    // Build the host array literal from the validated inputs. Each host is
    // wrapped in single quotes; the safe_host check above forbids any
    // character that could close that quote.
    let host_array = hosts
        .iter()
        .map(|h| format!("'{}'", h))
        .collect::<Vec<_>>()
        .join(",");

    // Sequential System.Net.NetworkInformation.Ping.Send() — same .NET API
    // across PS 5.1 / PS 7, no Task / WaitAll fragility. At a 1.5 s timeout
    // and 8 default targets the wall clock stays under 250 ms for healthy
    // links; worst case (all timeout) is bounded at hosts * timeout.
    let script = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
$targets = @({hosts})
$timeout = 1500
$out = @()
$pinger = New-Object System.Net.NetworkInformation.Ping
foreach ($t in $targets) {{
    $rtt = $null
    $addr = $null
    try {{
        $r = $pinger.Send($t, $timeout)
        if ($r -and $r.Status -eq [System.Net.NetworkInformation.IPStatus]::Success) {{
            $rtt = [uint32]$r.RoundtripTime
            if ($r.Address) {{ $addr = "$($r.Address)" }}
        }}
    }} catch {{}}
    $out += [pscustomobject]@{{ host = $t; rtt_ms = $rtt; address = $addr }}
}}
try {{ $pinger.Dispose() }} catch {{}}
ConvertTo-Json -InputObject @($out) -Depth 3 -Compress
"#,
        hosts = host_array
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
        .map_err(|e| ps_parse_error("Ping result list", &e.to_string(), out, &r.stderr))
}
