//! ISO-builder pipeline.
//!
//! Mounts an existing Windows 11 ISO, copies its content to a working dir,
//! injects the autounattend.xml at the root, and repacks the result as a
//! hybrid BIOS+UEFI bootable ISO via `oscdimg.exe` (part of the Windows ADK
//! Deployment Tools).
//!
//! The PowerShell driver script is a STATIC template per phase — only file
//! paths from the frontend are interpolated, and those are first validated
//! to be absolute, single-line, no quotes, ending in `.iso`. The XML payload
//! is written to a temp file in Rust before the script runs, so the XML
//! never crosses the shell boundary.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::ipc::Channel;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

use crate::maintenance::{run_pty_script, StreamEvent};

/// Microsoft's stable fwlink for the December 2024 ADK (10.1.26100.2454) —
/// the latest release that supports Windows 11 25H2/24H2 and earlier.
/// Update this constant if MS publishes a newer x64 ADK release.
const ADK_SETUP_URL: &str = "https://go.microsoft.com/fwlink/?linkid=2289980";

const ADK_SETUP_FILENAME: &str = "reclaim-adksetup.exe";

const UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

#[derive(Serialize)]
pub struct IsoTools {
    pub oscdimg_path: Option<String>,
    pub dism_available: bool,
    pub ready: bool,
    pub adk_hint: String,
}

/// Detect oscdimg.exe in the common Windows ADK locations and dism.exe in
/// System32. Returns paths so the UI can show "ready / install ADK" status.
#[tauri::command]
pub async fn iso_check_tools() -> IsoTools {
    let oscdimg_path = find_oscdimg();
    let dism_available = Path::new(r"C:\Windows\System32\dism.exe").exists();
    let ready = oscdimg_path.is_some();
    IsoTools {
        oscdimg_path: oscdimg_path.clone(),
        dism_available,
        ready,
        adk_hint:
            "Install the 'Deployment Tools' feature of the Windows ADK from \
             https://learn.microsoft.com/en-us/windows-hardware/get-started/adk-install"
                .to_string(),
    }
}

fn find_oscdimg() -> Option<String> {
    let candidates = [
        r"C:\Program Files (x86)\Windows Kits\10\Assessment and Deployment Kit\Deployment Tools\amd64\Oscdimg\oscdimg.exe",
        r"C:\Program Files\Windows Kits\10\Assessment and Deployment Kit\Deployment Tools\amd64\Oscdimg\oscdimg.exe",
        r"C:\Program Files (x86)\Windows Kits\10\Assessment and Deployment Kit\Deployment Tools\x86\Oscdimg\oscdimg.exe",
    ];
    for c in candidates {
        if Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    None
}

#[derive(Deserialize)]
pub struct IsoBuildRequest {
    pub input_iso: String,
    pub output_iso: String,
    pub autounattend_xml: String,
    /// Optional setupcomplete.cmd body. When non-empty we drop it into
    /// `\$OEM$\$$\Setup\Scripts\setupcomplete.cmd` inside the work dir before
    /// repacking — Windows Setup auto-copies that to
    /// `C:\Windows\Setup\Scripts\` during install and runs it as SYSTEM after
    /// oobeSystem (the safe place for AppX removals).
    #[serde(default)]
    pub setupcomplete_cmd: Option<String>,
}

/// Validate that a path is absolute, has no quotes/newlines, and lives on a
/// local drive. Rejects UNC paths and anything that could break out of the
/// single-quoted PS argument we'll interpolate it into.
fn validate_iso_path(p: &str, must_exist: bool) -> Result<PathBuf, String> {
    if p.is_empty() {
        return Err("path is empty".into());
    }
    if p.contains('\'') || p.contains('"') || p.contains('\n') || p.contains('\r') {
        return Err(format!("path contains illegal characters: {p}"));
    }
    if p.starts_with(r"\\") {
        return Err(format!("UNC paths not allowed: {p}"));
    }
    let buf = PathBuf::from(p);
    if !buf.is_absolute() {
        return Err(format!("path is not absolute: {p}"));
    }
    let ext_ok = buf
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("iso"))
        .unwrap_or(false);
    if !ext_ok {
        return Err(format!("path must end in .iso: {p}"));
    }
    if must_exist && !buf.exists() {
        return Err(format!("file does not exist: {p}"));
    }
    Ok(buf)
}

/// Run the full extract→inject→repack pipeline. Streams every line of
/// PowerShell + oscdimg output to the frontend via the provided Channel,
/// so the UI can attach the events directly to an xterm.
#[tauri::command]
pub async fn iso_build(
    task_id: String,
    req: IsoBuildRequest,
    cols: u16,
    rows: u16,
    on_event: Channel<StreamEvent>,
) -> Result<i32, String> {
    let input = validate_iso_path(&req.input_iso, true)?;
    let output = validate_iso_path(&req.output_iso, false)?;

    let oscdimg = find_oscdimg().ok_or_else(|| {
        "oscdimg.exe not found. Install the Windows ADK Deployment Tools.".to_string()
    })?;

    // Write the autounattend.xml to a temp file so the PS script doesn't
    // need to carry it inline — keeps the script template static.
    let unattend_tmp =
        std::env::temp_dir().join(format!("reclaim-unattend-{}.xml", rand_suffix()));
    {
        let mut f = std::fs::File::create(&unattend_tmp)
            .map_err(|e| format!("create unattend temp file failed: {e}"))?;
        f.write_all(req.autounattend_xml.as_bytes())
            .map_err(|e| format!("write unattend temp file failed: {e}"))?;
    }

    // setupcomplete.cmd: same story — temp file written here, the PS pipeline
    // copies it into the work dir under $OEM$\$$\Setup\Scripts\ before repack.
    let setupcomplete_tmp = match req.setupcomplete_cmd.as_deref() {
        Some(body) if !body.is_empty() => {
            let p =
                std::env::temp_dir().join(format!("reclaim-setupcomplete-{}.cmd", rand_suffix()));
            let mut f = std::fs::File::create(&p)
                .map_err(|e| format!("create setupcomplete temp file failed: {e}"))?;
            f.write_all(body.as_bytes())
                .map_err(|e| format!("write setupcomplete temp file failed: {e}"))?;
            p.to_string_lossy().to_string()
        }
        _ => String::new(),
    };

    // Working dir for ISO extraction. Use a unique subdir so concurrent
    // builds don't collide and so we can always wipe ours without touching
    // user data.
    let work_dir = std::env::temp_dir().join(format!("reclaim-iso-{}", rand_suffix()));

    let script = build_pipeline_script(
        input.to_string_lossy().as_ref(),
        output.to_string_lossy().as_ref(),
        unattend_tmp.to_string_lossy().as_ref(),
        &setupcomplete_tmp,
        work_dir.to_string_lossy().as_ref(),
        &oscdimg,
    );

    run_pty_script(task_id, script, cols, rows, on_event).await
}

// ─── ADK auto-install helpers ─────────────────────────────────────────────────

/// Download the official Microsoft ADK web-setup stub (~1.5 MB) to %TEMP%.
/// Emits `adk-download:progress` events so the UI can show a real bar. The
/// returned path is what the frontend must pass to `launch_adk_installer` —
/// keeping the round-trip is what lets us validate the path before spawn.
#[tauri::command]
pub async fn download_adk_setup(app: tauri::AppHandle) -> Result<String, String> {
    let path = std::env::temp_dir().join(ADK_SETUP_FILENAME);

    let resp = reqwest::Client::new()
        .get(ADK_SETUP_URL)
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
        "adk-download:start",
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
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write: {e}"))?;
        // The setup stub is ~1.5 MB so we emit fairly frequently. 64 KB
        // intervals give a smooth bar without flooding the IPC channel.
        if downloaded - last_emit >= 64_000 || downloaded == total {
            last_emit = downloaded;
            let _ = app.emit(
                "adk-download:progress",
                serde_json::json!({ "downloaded": downloaded, "total": total }),
            );
        }
    }
    file.flush().await.map_err(|e| format!("Flush: {e}"))?;
    drop(file);

    let _ = app.emit(
        "adk-download:done",
        serde_json::json!({ "path": path.to_string_lossy(), "size": downloaded }),
    );

    Ok(path.to_string_lossy().to_string())
}

/// Spawn the downloaded ADK setup with only the Deployment Tools feature
/// pre-selected. The setup is intentionally NOT silent (`/quiet` is omitted)
/// so the user sees Microsoft's own installer UI and consents to UAC the way
/// they would with any other MS installer.
#[tauri::command]
pub async fn launch_adk_installer(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let temp = std::env::temp_dir();

    // Hard-validate: must live in TEMP and have our exact filename. Without
    // this check a frontend bug could turn this command into a "spawn any
    // exe by path" primitive.
    if !p.starts_with(&temp) {
        return Err("Installer must live in the temp directory".into());
    }
    let name_ok = p
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.eq_ignore_ascii_case(ADK_SETUP_FILENAME))
        .unwrap_or(false);
    if !name_ok {
        return Err(format!("Unexpected installer name (expected {ADK_SETUP_FILENAME})"));
    }
    if !p.exists() {
        return Err(format!("Installer file not found at {}", p.display()));
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const DETACHED_PROCESS: u32 = 0x00000008;
        // /features OptionId.DeploymentTools  → only the ~200 MB feature we
        //   actually need (includes oscdimg.exe), not the full 3 GB ADK
        // /ceip off                          → skip the telemetry opt-in nag
        // /norestart                         → don't reboot the user
        Command::new(&p)
            .args([
                "/features",
                "OptionId.DeploymentTools",
                "/ceip",
                "off",
                "/norestart",
            ])
            .creation_flags(DETACHED_PROCESS)
            .spawn()
            .map_err(|e| format!("Launch failed: {e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = p;
        Err("Windows only".into())
    }
}

fn rand_suffix() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}", n)
}

/// Build the PS pipeline script. Paths are interpolated as single-quoted
/// strings (PS single-quote escape is `''` for `'`, but we already rejected
/// `'` in validate_iso_path so plain interpolation is safe). The whole
/// script is invoked by `run_pty_script` via `powershell.exe -Command`.
fn build_pipeline_script(
    input_iso: &str,
    output_iso: &str,
    unattend_xml: &str,
    setupcomplete_cmd: &str,
    work_dir: &str,
    oscdimg_path: &str,
) -> String {
    // Use a here-string so the multi-line script is readable. Variable
    // interpolation is done with format!, then PS sees its own $vars only.
    format!(
        r#"
$ErrorActionPreference = 'Stop'
$srcIso = '{input_iso}'
$dstIso = '{output_iso}'
$xml    = '{unattend_xml}'
$setup  = '{setupcomplete_cmd}'
$work   = '{work_dir}'
$oscdimg = '{oscdimg_path}'

function Write-Step($msg) {{
    Write-Host ''
    Write-Host ('>>> ' + $msg) -ForegroundColor Cyan
}}

try {{
    Write-Step ('Mounting ' + $srcIso)
    $mount = Mount-DiskImage -ImagePath $srcIso -PassThru
    Start-Sleep -Milliseconds 500
    $vol = Get-Volume -DiskImage $mount
    $srcRoot = $vol.DriveLetter + ':\'
    Write-Host ('    mounted at ' + $srcRoot)

    Write-Step ('Creating working directory ' + $work)
    if (Test-Path $work) {{ Remove-Item $work -Recurse -Force }}
    New-Item -ItemType Directory -Path $work | Out-Null

    Write-Step 'Copying ISO contents (this can take a while)'
    # robocopy gives a real-time progress bar; /NFL/NDL suppress per-file/dir
    # noise but keep summary lines. Exit codes 0-7 are success.
    $rc = robocopy $srcRoot $work /MIR /R:2 /W:3 /NFL /NDL /NJH /NP
    if ($LASTEXITCODE -gt 7) {{ throw ('robocopy failed with exit ' + $LASTEXITCODE) }}
    Write-Host ('    copy complete (robocopy exit ' + $LASTEXITCODE + ')')

    Write-Step 'Injecting autounattend.xml at ISO root'
    Copy-Item -LiteralPath $xml -Destination (Join-Path $work 'autounattend.xml') -Force
    # Some installers also look in \sources — drop a copy there too.
    $sources = Join-Path $work 'sources'
    if (Test-Path $sources) {{
        Copy-Item -LiteralPath $xml -Destination (Join-Path $sources 'autounattend.xml') -Force
    }}
    Write-Host '    injected'

    if ($setup -and (Test-Path -LiteralPath $setup)) {{
        Write-Step 'Injecting $OEM$\$$\Setup\Scripts\setupcomplete.cmd'
        $oemScripts = Join-Path $work '$OEM$\$$\Setup\Scripts'
        New-Item -ItemType Directory -Path $oemScripts -Force | Out-Null
        Copy-Item -LiteralPath $setup -Destination (Join-Path $oemScripts 'setupcomplete.cmd') -Force
        Write-Host '    setupcomplete.cmd in place'
    }}

    Write-Step ('Dismounting ' + $srcIso)
    Dismount-DiskImage -ImagePath $srcIso | Out-Null

    Write-Step ('Repacking ISO via oscdimg → ' + $dstIso)
    $etfs = Join-Path $work 'boot\etfsboot.com'
    $efi  = Join-Path $work 'efi\microsoft\boot\efisys.bin'
    if (-not (Test-Path $etfs)) {{ throw 'boot/etfsboot.com missing — source ISO is not Windows-installable.' }}
    if (-not (Test-Path $efi))  {{ throw 'efi/microsoft/boot/efisys.bin missing — source ISO has no UEFI boot.' }}

    $bootdata = '2#p0,e,b' + $etfs + '#pEF,e,b' + $efi
    & $oscdimg -m -o -u2 -udfver102 -bootdata:$bootdata $work $dstIso
    if ($LASTEXITCODE -ne 0) {{ throw ('oscdimg failed with exit ' + $LASTEXITCODE) }}

    Write-Step 'Done.'
    $size = (Get-Item -LiteralPath $dstIso).Length / 1MB
    Write-Host ('Output: ' + $dstIso)
    Write-Host ('Size:   ' + ('{{0:N1}}' -f $size) + ' MB') -ForegroundColor Green
}} catch {{
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    # Best-effort cleanup; ignore errors here so the user sees the real cause.
    try {{ Dismount-DiskImage -ImagePath $srcIso -ErrorAction SilentlyContinue | Out-Null }} catch {{}}
    throw
}} finally {{
    Write-Step 'Cleaning up working directory'
    if (Test-Path $work) {{
        Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    }}
    if (Test-Path $xml) {{
        Remove-Item $xml -Force -ErrorAction SilentlyContinue
    }}
    if ($setup -and (Test-Path -LiteralPath $setup)) {{
        Remove-Item -LiteralPath $setup -Force -ErrorAction SilentlyContinue
    }}
}}
"#
    )
}
