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

    // Test-Connection -AsJob would parallelize naturally but the post-processing
    // is fiddly. Pwsh 7 has -Parallel for ForEach-Object; Pwsh 5 doesn't.
    // We run ping in parallel via Start-Job + Wait-Job — works on both.
    let script = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
$hosts = @({hosts})
$jobs = @()
foreach ($h in $hosts) {{
    $jobs += Start-Job -ScriptBlock {{
        param($target)
        $r = $null
        try {{
            # -Quiet returns just a bool; we want timing — so use the normal form
            # and grab the first reply. ResponseTime is in ms (0 on Win11 when
            # request is sub-millisecond).
            $r = Test-Connection -ComputerName $target -Count 1 -ErrorAction Stop |
                 Select-Object -First 1
        }} catch {{ $r = $null }}
        if ($null -eq $r) {{
            [pscustomobject]@{{ host = $target; rtt_ms = $null; address = $null }}
        }} else {{
            $rt = $null
            if ($null -ne $r.ResponseTime) {{ $rt = [uint32]$r.ResponseTime }}
            elseif ($null -ne $r.Latency) {{ $rt = [uint32]$r.Latency }}
            $addr = $null
            if ($r.PSObject.Properties.Match('IPV4Address').Count -gt 0 -and $r.IPV4Address) {{
                $addr = "$($r.IPV4Address)"
            }} elseif ($r.PSObject.Properties.Match('Address').Count -gt 0 -and $r.Address) {{
                $addr = "$($r.Address)"
            }}
            [pscustomobject]@{{ host = $target; rtt_ms = $rt; address = $addr }}
        }}
    }} -ArgumentList $h
}}
$results = $jobs | Wait-Job -Timeout 4 | Receive-Job
$jobs | Remove-Job -Force | Out-Null
if (-not $results) {{ '[]'; return }}
@($results) | ConvertTo-Json -Depth 3 -AsArray -Compress
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
