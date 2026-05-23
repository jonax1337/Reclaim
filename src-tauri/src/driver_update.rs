use futures_util::StreamExt;
use serde::Serialize;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

const UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

#[derive(Serialize, Clone)]
pub struct NvidiaDriverInfo {
    pub version: String,
    pub name: String,
    pub release_date: String,
    pub os_name: String,
    pub download_url: String,
    pub details_url: String,
    pub size_mb: Option<f64>,
}

#[derive(Serialize, Clone)]
pub struct DownloadedFile {
    pub path: String,
    pub size_bytes: u64,
}

async fn http_get_text(url: &str) -> Result<String, String> {
    let resp = reqwest::Client::new()
        .get(url)
        .header("User-Agent", UA)
        .header("Accept", "*/*")
        .send()
        .await
        .map_err(|e| format!("HTTP error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| format!("Body read: {e}"))
}

async fn nv_lookup(type_id: u32, parent_id: u32) -> Result<Vec<(u32, String)>, String> {
    let url = format!(
        "https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID={}&ParentID={}&Lang=en-us",
        type_id, parent_id
    );
    let text = http_get_text(&url).await?;
    // NVIDIA's XML emits <Name> BEFORE <Value> inside each <LookupValue>.
    let re = regex::Regex::new(r"(?s)<Name>\s*([^<]+?)\s*</Name>\s*<Value>\s*(\d+)\s*</Value>")
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for cap in re.captures_iter(&text) {
        if let (Some(name), Some(id)) = (cap.get(1), cap.get(2)) {
            if let Ok(id_num) = id.as_str().parse::<u32>() {
                out.push((id_num, name.as_str().trim().to_string()));
            }
        }
    }
    if out.is_empty() {
        return Err(format!(
            "NVIDIA lookup returned no entries for TypeID={} ParentID={} (response {} bytes)",
            type_id,
            parent_id,
            text.len()
        ));
    }
    Ok(out)
}

fn pick_series(gpu_name: &str, lookup: &[(u32, String)]) -> Option<u32> {
    let name = gpu_name.to_uppercase();
    let is_mobile = name.contains("LAPTOP") || name.contains("MOBILE");
    let is_rtx = name.contains("RTX");
    let is_gtx = name.contains("GTX");

    // Extract the leading 2 digits of the 4-digit GPU model (e.g., 3060 → 30).
    let series_num: u32 = regex::Regex::new(r"(?:RTX|GTX|GEFORCE)\s*(\d{2})\d{2}")
        .ok()
        .and_then(|r| r.captures(&name))
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse::<u32>().ok())?;

    // NVIDIA labels: "GeForce RTX 40 Series", "GeForce 16 Series", "GeForce 10
    // Series" (note: no GTX prefix on the 10/16 series labels). Try specific →
    // generic, then fall back to any series whose name contains the number.
    let mut candidates: Vec<String> = Vec::new();
    if is_rtx {
        candidates.push(format!("RTX {} SERIES", series_num));
    }
    if is_gtx {
        candidates.push(format!("GTX {} SERIES", series_num));
    }
    candidates.push(format!("{} SERIES", series_num));

    for (id, n) in lookup {
        let upper = n.to_uppercase();
        let is_n_mobile = upper.contains("LAPTOP")
            || upper.contains("NOTEBOOK")
            || upper.contains("MOBILE");
        if is_n_mobile != is_mobile {
            continue;
        }
        for phrase in &candidates {
            if upper.contains(phrase.as_str()) {
                return Some(*id);
            }
        }
    }
    None
}

fn pick_family(gpu_name: &str, lookup: &[(u32, String)]) -> Option<u32> {
    let re = regex::Regex::new(r"(?i)(RTX|GTX)\s*(\d{4})(?:\s+(Ti\s+Super|Ti|Super))?")
        .ok()?;
    let cap = re.captures(gpu_name)?;
    let kind = cap.get(1)?.as_str().to_uppercase();
    let num = cap.get(2)?.as_str();
    let suffix = cap.get(3).map(|m| m.as_str().to_uppercase()).unwrap_or_default();
    let target = if suffix.is_empty() {
        format!("{} {}", kind, num)
    } else {
        format!("{} {} {}", kind, num, suffix)
    };
    let target_norm = target.split_whitespace().collect::<Vec<_>>().join(" ");

    let mut best: Option<(u32, usize)> = None;
    for (id, name) in lookup {
        let name_upper = name.to_uppercase();
        let name_norm = name_upper.split_whitespace().collect::<Vec<_>>().join(" ");
        if !name_norm.contains(&target_norm) {
            continue;
        }
        let len = name_norm.len();
        if best.map(|(_, l)| len < l).unwrap_or(true) {
            best = Some((*id, len));
        }
    }
    best.map(|(id, _)| id)
}

#[tauri::command]
pub async fn lookup_nvidia_driver(gpu_name: String) -> Result<NvidiaDriverInfo, String> {
    let series = nv_lookup(2, 1).await?;
    let psid = pick_series(&gpu_name, &series)
        .ok_or_else(|| format!("Could not match series for '{}'", gpu_name))?;

    let families = nv_lookup(3, psid).await?;
    let pfid = pick_family(&gpu_name, &families)
        .ok_or_else(|| format!("Could not match family for '{}'", gpu_name))?;

    // OS 57 = "Windows 10/11 64-bit" — single combined option NVIDIA uses for the consumer driver.
    let os_id = 57u32;
    let url = format!(
        "https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php?\
         func=DriverManualLookup&psid={psid}&pfid={pfid}&osID={osid}&languageCode=1033&isWHQL=1&dch=1&sort1=0&numberOfResults=1",
        psid = psid,
        pfid = pfid,
        osid = os_id
    );
    let text = http_get_text(&url).await?;
    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Driver JSON parse: {e}"))?;

    let success = v.get("Success").and_then(|s| s.as_str()).unwrap_or("0");
    if success != "1" {
        let cause = v
            .get("Cause")
            .and_then(|s| s.as_str())
            .unwrap_or("Unknown error");
        return Err(format!("NVIDIA: {cause}"));
    }

    let entry = v
        .get("IDS")
        .and_then(|x| x.as_array())
        .and_then(|a| a.first())
        .and_then(|x| x.get("downloadInfo"))
        .ok_or_else(|| "No driver in NVIDIA response".to_string())?;

    let get_str = |k: &str| {
        entry
            .get(k)
            .and_then(|x| x.as_str())
            .map(|s| s.to_string())
            .unwrap_or_default()
    };
    // NVIDIA returns most string fields URL-encoded (e.g. "Windows%2011").
    // URLs themselves are already valid as-is — don't double-decode them.
    let decode = |k: &str| url_decode(&get_str(k));
    // "DownloadURLFileSize" is a string like "958.81 MB" — strip the unit suffix.
    let parse_size = |s: &str| -> Option<f64> {
        let cleaned = s
            .trim()
            .trim_end_matches(|c: char| c.is_ascii_alphabetic() || c.is_whitespace())
            .trim()
            .replace(',', ".");
        cleaned.parse::<f64>().ok()
    };

    Ok(NvidiaDriverInfo {
        version: decode("Version"),
        name: decode("Name"),
        release_date: decode("ReleaseDateTime"),
        os_name: decode("OSName"),
        download_url: get_str("DownloadURL"),
        details_url: get_str("DetailsURL"),
        size_mb: entry
            .get("DownloadURLFileSize")
            .and_then(|x| x.as_str())
            .and_then(parse_size)
            .or_else(|| entry.get("DownloadURLFileSize").and_then(|x| x.as_f64())),
    })
}

fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(b' ');
        } else {
            out.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

#[tauri::command]
pub async fn download_driver(
    app: tauri::AppHandle,
    url: String,
    filename: String,
) -> Result<DownloadedFile, String> {
    let safe_name = sanitize_filename(&filename);
    let downloads = dirs::download_dir().ok_or_else(|| "Downloads folder not found".to_string())?;
    let path = downloads.join(&safe_name);

    let resp = reqwest::Client::new()
        .get(&url)
        .header("User-Agent", UA)
        .header("Accept", "*/*")
        .send()
        .await
        .map_err(|e| format!("HTTP error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let _ = app.emit(
        "driver-download:start",
        serde_json::json!({ "total": total, "path": path.to_string_lossy() }),
    );

    let mut file = tokio::fs::File::create(&path)
        .await
        .map_err(|e| format!("Create file: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Chunk error: {e}"))?;
        downloaded += chunk.len() as u64;
        file.write_all(&chunk).await.map_err(|e| format!("Write: {e}"))?;
        if downloaded - last_emit > 1_000_000 || downloaded == total {
            last_emit = downloaded;
            let _ = app.emit(
                "driver-download:progress",
                serde_json::json!({ "downloaded": downloaded, "total": total }),
            );
        }
    }
    file.flush().await.map_err(|e| format!("Flush: {e}"))?;
    drop(file);

    let _ = app.emit(
        "driver-download:done",
        serde_json::json!({ "path": path.to_string_lossy(), "size": downloaded }),
    );

    Ok(DownloadedFile {
        path: path.to_string_lossy().to_string(),
        size_bytes: downloaded,
    })
}

#[tauri::command]
pub async fn launch_installer(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const DETACHED_PROCESS: u32 = 0x00000008;
        Command::new(&path)
            .creation_flags(DETACHED_PROCESS)
            .spawn()
            .map_err(|e| format!("Launch failed: {e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Only on Windows".into())
    }
}

#[tauri::command]
pub async fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("explorer.exe")
            .args(["/select,", &path])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Explorer failed: {e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Only on Windows".into())
    }
}

fn sanitize_filename(name: &str) -> String {
    let bad = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut s: String = name.chars().map(|c| if bad.contains(&c) { '_' } else { c }).collect();
    if s.is_empty() {
        s = "driver-installer.exe".into();
    }
    if !s.to_lowercase().ends_with(".exe") {
        s.push_str(".exe");
    }
    s
}
