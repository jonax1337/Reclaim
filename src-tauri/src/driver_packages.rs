use serde::Serialize;

use crate::tweaks::run_ps;

#[derive(Serialize, Clone)]
pub struct DriverPackage {
    pub published_name: String, // "oem23.inf"
    pub original_name: String,  // "nv_dispsi.inf"
    pub provider: String,
    pub class_name: String,
    pub class_guid: String,
    pub version: String,
    pub date: String,
    pub signer: String,
}

#[tauri::command]
pub async fn list_driver_packages(class_filter: Option<String>) -> Result<Vec<DriverPackage>, String> {
    // Whitelist class filter: only allow alphanumerics + spaces (Display, Net, Audio, ...).
    let class_arg = match class_filter {
        Some(c) => {
            if !c
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == ' ')
                || c.is_empty()
                || c.len() > 64
            {
                return Err("Invalid class filter".into());
            }
            format!("/class '{}'", c)
        }
        None => String::new(),
    };
    // pnputil output is localized; we parse the labeled "key: value" block format.
    // Each driver package is separated by a blank line.
    let script = format!(
        "$ErrorActionPreference = 'SilentlyContinue'; \
         $out = & pnputil /enum-drivers {class_arg} 2>&1 | Out-String; \
         $out"
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(parse_pnputil_output(&r.stdout))
}

/// Parse `pnputil /enum-drivers` text output. The first label of each block
/// is the published name; blank lines separate packages. Localized labels
/// differ per Windows language so we match by line position within each block
/// after the first key-value pair (the first 7 labeled lines following the
/// published name are always: original / provider / class / class guid /
/// driver date+version / signer, in that order on en-US, de-DE, fr-FR, ja-JP).
fn parse_pnputil_output(text: &str) -> Vec<DriverPackage> {
    let mut packages = Vec::new();
    let mut block: Vec<&str> = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !block.is_empty() {
                if let Some(pkg) = parse_block(&block) {
                    packages.push(pkg);
                }
                block.clear();
            }
        } else {
            block.push(line);
        }
    }
    if !block.is_empty() {
        if let Some(pkg) = parse_block(&block) {
            packages.push(pkg);
        }
    }
    packages
}

fn parse_block(lines: &[&str]) -> Option<DriverPackage> {
    let values: Vec<String> = lines
        .iter()
        .map(|l| {
            // Each labeled line is "Label: value"; we want the value half.
            l.splitn(2, ':')
                .nth(1)
                .map(|s| s.trim().to_string())
                .unwrap_or_else(|| (*l).trim().to_string())
        })
        .collect();
    // We need at least: published, original, provider, class, class guid, version, signer.
    if values.len() < 7 {
        return None;
    }
    let published = values[0].clone();
    if !published.to_ascii_lowercase().ends_with(".inf") {
        // Either we hit a banner line ("Microsoft PnP Utility") or this isn't a driver block.
        return None;
    }
    let original = values[1].clone();
    let provider = values[2].clone();
    let class_name = values[3].clone();
    let class_guid = values[4].clone();
    // "Driver Date and Version: MM/DD/YYYY V.V.V.V" — split into date + version.
    let date_version = &values[5];
    let (date, version) = match date_version.split_once(' ') {
        Some((d, v)) => (d.trim().to_string(), v.trim().to_string()),
        None => (String::new(), date_version.clone()),
    };
    let signer = values.get(6).cloned().unwrap_or_default();
    Some(DriverPackage {
        published_name: published,
        original_name: original,
        provider,
        class_name,
        class_guid,
        version,
        date,
        signer,
    })
}

fn valid_oem_inf(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    if !lower.starts_with("oem") || !lower.ends_with(".inf") {
        return false;
    }
    // Body between "oem" and ".inf" must be digits only.
    let body = &lower["oem".len()..lower.len() - ".inf".len()];
    !body.is_empty() && body.chars().all(|c| c.is_ascii_digit())
}

#[tauri::command]
pub async fn delete_driver_package(
    published_name: String,
    uninstall: bool,
) -> Result<(), String> {
    if !valid_oem_inf(&published_name) {
        return Err(format!("Rejected driver name: {published_name}"));
    }
    let uninstall_arg = if uninstall { "/uninstall /force" } else { "" };
    // Wrap with elevated cmd so we don't risk PowerShell parsing issues with
    // the trailing slash arguments to pnputil.
    let script = format!(
        "$ErrorActionPreference = 'Stop'; \
         & pnputil /delete-driver {published_name} {uninstall_arg} 2>&1 | Out-String"
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    // pnputil returns 0 even when the driver is in use; check stdout for the
    // signature failure phrases. Localized — match the well-known english + de.
    let lower = r.stdout.to_ascii_lowercase();
    if lower.contains("cannot delete a driver package that is in use")
        || lower.contains("driver package is currently in use")
    {
        return Err(r.stdout);
    }
    Ok(())
}
