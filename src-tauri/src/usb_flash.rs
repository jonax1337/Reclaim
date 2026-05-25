//! USB-stick flasher for Windows install ISOs.
//!
//! Uses Microsoft's own approach for sticks that need to hold a Windows 11
//! install image larger than 4 GiB: a single FAT32 partition, and `install.wim`
//! is split into `install.swm` chunks (each below the FAT32 4 GiB file-size
//! limit) via `Dism /Split-Image`. Windows Setup natively understands `.swm`
//! files and reassembles them transparently.
//!
//! Why FAT32-only:
//!   - UEFI firmwares can read FAT32 natively, so `\efi\boot\bootx64.efi`
//!     boots straight from the stick — no Rufus-specific NTFS UEFI shim
//!     required.
//!   - A dual-partition layout (FAT32 boot + NTFS for install.wim) does NOT
//!     work without a custom UEFI:NTFS bootloader, because Windows Setup looks
//!     for `\sources\install.{wim,esd}` relative to the boot media root, not
//!     across all attached volumes.
//!
//! Built-in Format-Volume caps FAT32 at 32 GiB. On a larger stick we deliberately
//! create only the first ~32 GiB as FAT32 and leave the rest unallocated — a
//! Win11 install ISO occupies <10 GiB after splitting, so 32 GiB is plenty.
//!
//! Safety: the PowerShell script re-verifies the target disk is USB,
//! non-system, non-boot before any destructive op. Rust-side input is also
//! validated.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use tauri::ipc::Channel;

use crate::maintenance::{run_pty_script, StreamEvent};
use crate::tweaks::run_ps;

#[derive(Serialize)]
pub struct UsbDrive {
    pub disk_number: u32,
    pub friendly_name: String,
    pub model: String,
    pub serial_number: String,
    pub size_bytes: u64,
    pub bus_type: String,
    pub partition_style: String,
    pub is_system: bool,
    pub is_boot: bool,
    pub is_offline: bool,
}

#[tauri::command]
pub async fn list_usb_drives() -> Result<Vec<UsbDrive>, String> {
    let script = r#"
        $ErrorActionPreference = 'Stop'
        Get-Disk |
            Where-Object { $_.BusType -eq 'USB' } |
            ForEach-Object {
                [pscustomobject]@{
                    DiskNumber     = [int]$_.Number
                    FriendlyName   = [string]$_.FriendlyName
                    Model          = [string]$_.Model
                    SerialNumber   = [string]$_.SerialNumber
                    UniqueId       = [string]$_.UniqueId
                    SizeBytes      = [int64]$_.Size
                    BusType        = [string]$_.BusType
                    PartitionStyle = [string]$_.PartitionStyle
                    IsSystem       = [bool]$_.IsSystem
                    IsBoot         = [bool]$_.IsBoot
                    IsOffline      = [bool]$_.IsOffline
                }
            } |
            ConvertTo-Json -Depth 3 -Compress
    "#;
    let res = run_ps(script);
    if !res.success {
        return Err(if !res.stderr.trim().is_empty() {
            res.stderr
        } else {
            format!("Get-Disk failed (exit {})", res.code)
        });
    }
    let raw = res.stdout.trim();
    if raw.is_empty() {
        return Ok(Vec::new());
    }
    // ConvertTo-Json emits a single object (not an array) when there's exactly
    // one result — wrap so serde_json picks the Vec branch in either case.
    let json_text = if raw.starts_with('[') {
        raw.to_string()
    } else {
        format!("[{raw}]")
    };
    let parsed: Vec<RawUsbDrive> = serde_json::from_str(&json_text)
        .map_err(|e| format!("Parse Get-Disk JSON: {e}"))?;
    Ok(parsed.into_iter().map(Into::into).collect())
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RawUsbDrive {
    disk_number: u32,
    friendly_name: Option<String>,
    model: Option<String>,
    serial_number: Option<String>,
    unique_id: Option<String>,
    size_bytes: Option<i64>,
    bus_type: Option<String>,
    partition_style: Option<String>,
    is_system: Option<bool>,
    is_boot: Option<bool>,
    is_offline: Option<bool>,
}

impl From<RawUsbDrive> for UsbDrive {
    fn from(r: RawUsbDrive) -> Self {
        // Prefer the Windows-derived hardware ID from UniqueId (stable across
        // reboots, identical to the real serial for well-behaved firmware,
        // synthesized from other device props for garbage firmware that
        // reports "0000000005" + control bytes). Fall back to the cleaned
        // raw SerialNumber, then to nothing.
        let serial = extract_pnp_hardware_id(r.unique_id.as_deref().unwrap_or(""))
            .unwrap_or_else(|| clean_serial(r.serial_number.unwrap_or_default()));
        Self {
            disk_number: r.disk_number,
            friendly_name: r.friendly_name.unwrap_or_default(),
            model: r.model.unwrap_or_default(),
            serial_number: serial,
            size_bytes: r.size_bytes.unwrap_or(0).max(0) as u64,
            bus_type: r.bus_type.unwrap_or_default(),
            partition_style: r.partition_style.unwrap_or_default(),
            is_system: r.is_system.unwrap_or(false),
            is_boot: r.is_boot.unwrap_or(false),
            is_offline: r.is_offline.unwrap_or(false),
        }
    }
}

/// Pull the hardware-ID chunk out of a `Get-Disk` UniqueId / PNPDeviceID like:
///
///   `USBSTOR\DISK&VEN_KINGSTON&PROD_DATATRAVELER_3.0&REV_0000\E0D55EA574AE1571787B06CE&0:DESKTOP-FOO`
///
/// Windows derives this from the USB device's iSerialNumber when present, or
/// falls back to a deterministic hash of other device descriptors when the
/// firmware reports garbage. Either way it's stable, unique, and what
/// Windows itself uses to identify the drive — closer to "the real serial"
/// than what `Get-Disk .SerialNumber` returns for cheap sticks.
fn extract_pnp_hardware_id(unique_id: &str) -> Option<String> {
    if unique_id.is_empty() {
        return None;
    }
    // Drop trailing ":MACHINE" suffix some PowerShell versions append.
    let trimmed = unique_id.split(':').next().unwrap_or(unique_id);
    // Hardware ID is between the LAST backslash and the trailing "&<digit>".
    let after_last_backslash = trimmed.rsplit('\\').next()?;
    let id = after_last_backslash
        .rsplit_once('&')
        .map(|(prefix, _suffix)| prefix)
        .unwrap_or(after_last_backslash);
    let cleaned = id.trim();
    if cleaned.is_empty() {
        return None;
    }
    Some(cleaned.to_string())
}

/// `Get-Disk`'s SerialNumber for USB devices is the raw iSerialNumber
/// descriptor bytes, which on many sticks (Kingston DataTraveler in
/// particular) contains trailing control bytes (`\0`, `\x7F`, pipes from
/// uninitialized descriptor padding etc.) that render as garbage in the UI.
/// On some bridge chips the serial is also returned as hex-encoded ASCII
/// with byte-swapped pairs (per SCSI inquiry byte-order quirk).
///
/// Heuristic:
///   1. Strip control chars, trim.
///   2. Strip trailing non-alphanumeric padding (pipes, dashes, etc).
///   3. If the result is an even-length all-hex string of mostly-printable
///      bytes when decoded → hex-decode it (handles the SCSI-inquiry case).
///   4. Trim again, return empty if nothing meaningful is left.
fn clean_serial(raw: String) -> String {
    let stripped: String = raw
        .chars()
        .filter(|c| !c.is_control())
        .collect();
    let stripped = stripped.trim();
    let stripped = stripped.trim_end_matches(|c: char| !c.is_alphanumeric());
    let cleaned = stripped.trim();
    if cleaned.is_empty() {
        return String::new();
    }
    if let Some(decoded) = try_hex_ascii_decode(cleaned) {
        return decoded;
    }
    cleaned.to_string()
}

fn try_hex_ascii_decode(s: &str) -> Option<String> {
    if s.len() < 4 || s.len() % 2 != 0 {
        return None;
    }
    if !s.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let bytes: Result<Vec<u8>, _> = (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16))
        .collect();
    let bytes = bytes.ok()?;
    // Reject if the decoded bytes don't look like printable ASCII —
    // otherwise we'd "decode" a literal "12345678" hex serial that's
    // already correct into garbage.
    let printable_or_pad = bytes
        .iter()
        .filter(|&&b| (32..=126).contains(&b) || b == 0)
        .count();
    if printable_or_pad < bytes.len() {
        return None;
    }
    let printable: usize = bytes.iter().filter(|&&b| (33..=126).contains(&b)).count();
    if printable * 2 < bytes.len() {
        return None;
    }
    let s: String = bytes
        .iter()
        .filter(|&&b| (32..=126).contains(&b))
        .map(|&b| b as char)
        .collect();
    let cleaned = s.trim().trim_end_matches(|c: char| !c.is_alphanumeric()).to_string();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

#[cfg(test)]
mod tests {
    use super::{clean_serial, extract_pnp_hardware_id};

    #[test]
    fn extracts_kingston_hardware_id() {
        assert_eq!(
            extract_pnp_hardware_id(
                "USBSTOR\\DISK&VEN_KINGSTON&PROD_DATATRAVELER_3.0&REV_0000\\E0D55EA574AE1571787B06CE&0:DESKTOP-FLGUE1D"
            ),
            Some("E0D55EA574AE1571787B06CE".into()),
        );
    }
    #[test]
    fn extracts_without_machine_suffix() {
        assert_eq!(
            extract_pnp_hardware_id(
                "USBSTOR\\DISK&VEN_SANDISK&PROD_CRUZER&REV_1.0\\ABCDEF123456&0"
            ),
            Some("ABCDEF123456".into()),
        );
    }
    #[test]
    fn extract_returns_none_for_empty() {
        assert_eq!(extract_pnp_hardware_id(""), None);
    }
    #[test]
    fn extract_handles_no_backslash() {
        assert_eq!(extract_pnp_hardware_id("RAWSERIAL&0"), Some("RAWSERIAL".into()));
    }

    #[test]
    fn strips_trailing_pipes() {
        assert_eq!(clean_serial("000000000005||".into()), "000000000005");
    }
    #[test]
    fn strips_control_chars() {
        assert_eq!(clean_serial("ABC123\u{0000}\u{0001}".into()), "ABC123");
    }
    #[test]
    fn preserves_clean_alphanumeric() {
        assert_eq!(clean_serial("AA0102030405".into()), "AA0102030405");
    }
    #[test]
    fn empty_stays_empty() {
        assert_eq!(clean_serial("".into()), "");
        assert_eq!(clean_serial("   ".into()), "");
        assert_eq!(clean_serial("||".into()), "");
    }
    #[test]
    fn decodes_hex_ascii_when_meaningful() {
        // "Hi" = 0x48 0x69 = "4869"
        assert_eq!(clean_serial("4869".into()), "Hi");
    }
    #[test]
    fn does_not_mangle_real_hex_serial() {
        // Looks-like-hex but actually a serial — only decoded if the
        // result is plausible ASCII. 8 zeros = 0x00 0x00 0x00 0x00 = all
        // null → rejected (printable count == 0).
        assert_eq!(clean_serial("00000000".into()), "00000000");
    }
}

#[derive(Deserialize)]
pub struct UsbFlashRequest {
    pub iso_path: String,
    pub disk_number: u32,
    /// Optional autounattend.xml content. Dropped at the root of the FAT32
    /// partition so Windows Setup picks it up automatically.
    pub autounattend_xml: Option<String>,
    /// Optional setupcomplete.cmd body. Written to
    /// `\$OEM$\$$\Setup\Scripts\setupcomplete.cmd` on the stick — Windows
    /// Setup auto-copies it to `C:\Windows\Setup\Scripts\` during install
    /// and runs it as SYSTEM after oobeSystem. Safe place for AppX removals.
    #[serde(default)]
    pub setupcomplete_cmd: Option<String>,
}

fn validate_iso_path(p: &str) -> Result<PathBuf, String> {
    if p.is_empty() {
        return Err("ISO path is empty".into());
    }
    if p.contains('\'') || p.contains('"') || p.contains('\n') || p.contains('\r') {
        return Err(format!("ISO path contains illegal characters: {p}"));
    }
    if p.starts_with(r"\\") {
        return Err(format!("UNC paths not allowed: {p}"));
    }
    let buf = PathBuf::from(p);
    if !buf.is_absolute() {
        return Err(format!("ISO path is not absolute: {p}"));
    }
    let ext_ok = buf
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("iso"))
        .unwrap_or(false);
    if !ext_ok {
        return Err(format!("ISO path must end in .iso: {p}"));
    }
    if !buf.exists() {
        return Err(format!("ISO file does not exist: {p}"));
    }
    Ok(buf)
}

#[tauri::command]
pub async fn usb_flash_iso(
    task_id: String,
    req: UsbFlashRequest,
    cols: u16,
    rows: u16,
    on_event: Channel<StreamEvent>,
) -> Result<i32, String> {
    let iso = validate_iso_path(&req.iso_path)?;
    if req.disk_number == 0 {
        return Err("Disk 0 is reserved for the system disk".into());
    }

    let unattend_path = if let Some(xml) = req.autounattend_xml.as_ref() {
        let tmp = std::env::temp_dir().join(format!("reclaim-usb-unattend-{}.xml", rand_suffix()));
        let mut f = std::fs::File::create(&tmp)
            .map_err(|e| format!("create unattend temp file failed: {e}"))?;
        f.write_all(xml.as_bytes())
            .map_err(|e| format!("write unattend temp file failed: {e}"))?;
        tmp.to_string_lossy().to_string()
    } else {
        String::new()
    };

    let setupcomplete_path = match req.setupcomplete_cmd.as_deref() {
        Some(body) if !body.is_empty() => {
            let tmp = std::env::temp_dir()
                .join(format!("reclaim-usb-setupcomplete-{}.cmd", rand_suffix()));
            let mut f = std::fs::File::create(&tmp)
                .map_err(|e| format!("create setupcomplete temp file failed: {e}"))?;
            f.write_all(body.as_bytes())
                .map_err(|e| format!("write setupcomplete temp file failed: {e}"))?;
            tmp.to_string_lossy().to_string()
        }
        _ => String::new(),
    };

    let script = build_flash_script(
        iso.to_string_lossy().as_ref(),
        req.disk_number,
        &unattend_path,
        &setupcomplete_path,
    );

    run_pty_script(task_id, script, cols, rows, on_event).await
}

fn rand_suffix() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}", n)
}

/// Single-FAT32 layout with on-the-fly install.wim split. PS variable
/// interpolation handles paths; the iso path is already shell-safe (no `'`,
/// `"`, newlines, UNC).
fn build_flash_script(
    iso: &str,
    disk_number: u32,
    unattend_path: &str,
    setupcomplete_path: &str,
) -> String {
    let unattend_block = if unattend_path.is_empty() {
        String::from("$unattend = ''")
    } else {
        format!("$unattend = '{unattend_path}'")
    };
    let setupcomplete_block = if setupcomplete_path.is_empty() {
        String::from("$setupcomplete = ''")
    } else {
        format!("$setupcomplete = '{setupcomplete_path}'")
    };
    format!(
        r#"
$ErrorActionPreference = 'Stop'
chcp 65001 2>&1 | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$srcIso  = '{iso}'
$diskNo  = {disk_number}
{unattend_block}
{setupcomplete_block}

# FAT32 file-size limit is 4 GiB (4,294,967,295 bytes). MS recommends splitting
# install.wim into <4 GiB chunks via Dism /Split-Image; 3800 MB gives a safe
# margin against the hard limit when the resulting .swm wrappers add overhead.
$fat32MaxFileMb = 4090
$splitChunkMb   = 3800

# Format-Volume caps FAT32 at 32 GiB. On bigger sticks we deliberately create
# a 32 GiB FAT32 partition and leave the rest unallocated — a Win11 install
# fits comfortably in 32 GiB after splitting.
$maxFat32SizeBytes = 32GB

function Write-Step($msg) {{
    Write-Host ''
    Write-Host ('>>> ' + $msg) -ForegroundColor Cyan
}}
function Write-Note($msg) {{ Write-Host ('    ' + $msg) -ForegroundColor DarkGray }}
function Write-Ok($msg)   {{ Write-Host ('    ' + $msg) -ForegroundColor Green }}
function Write-Fail($msg) {{ Write-Host ('!!! ' + $msg) -ForegroundColor Red }}

$mounted = $false
try {{
    # ─── Safety: re-verify the target disk inside PS ──────────────────────
    Write-Step ('Verifying target disk ' + $diskNo)
    $disk = Get-Disk -Number $diskNo -ErrorAction Stop
    if ($disk.BusType -ne 'USB') {{ throw ('Disk ' + $diskNo + ' is not a USB device (BusType=' + $disk.BusType + ')') }}
    if ($disk.IsSystem)          {{ throw ('Disk ' + $diskNo + ' is the system disk — refusing to flash') }}
    if ($disk.IsBoot)            {{ throw ('Disk ' + $diskNo + ' is the boot disk — refusing to flash') }}
    Write-Ok ('OK — ' + $disk.FriendlyName + '  (' + [math]::Round($disk.Size / 1GB, 1) + ' GB, USB)')

    # ─── Mount source ISO ──────────────────────────────────────────────────
    Write-Step ('Mounting ' + $srcIso)
    $mount = Mount-DiskImage -ImagePath $srcIso -PassThru -ErrorAction Stop
    $mounted = $true
    Start-Sleep -Milliseconds 800
    $vol = Get-Volume -DiskImage $mount
    if (-not $vol -or -not $vol.DriveLetter) {{ throw 'Mounted the ISO but could not resolve a drive letter for it.' }}
    $srcRoot = ($vol.DriveLetter + ':\')
    Write-Ok ('mounted at ' + $srcRoot)

    # ─── Detect the install image (wim/esd/swm) ────────────────────────────
    $sourcesDir = Join-Path $srcRoot 'sources'
    $installWim  = Join-Path $sourcesDir 'install.wim'
    $installEsd  = Join-Path $sourcesDir 'install.esd'
    $needsSplit  = $false
    $useExisting = $false
    if (Test-Path -LiteralPath $installWim) {{
        $sizeMb = [math]::Round((Get-Item -LiteralPath $installWim).Length / 1MB, 1)
        Write-Note ('install image: install.wim  (' + $sizeMb + ' MB)')
        if ((Get-Item -LiteralPath $installWim).Length -gt ($fat32MaxFileMb * 1MB)) {{ $needsSplit = $true }}
    }} elseif (Test-Path -LiteralPath $installEsd) {{
        $sizeMb = [math]::Round((Get-Item -LiteralPath $installEsd).Length / 1MB, 1)
        Write-Note ('install image: install.esd  (' + $sizeMb + ' MB)')
        if ((Get-Item -LiteralPath $installEsd).Length -gt ($fat32MaxFileMb * 1MB)) {{
            throw 'install.esd is larger than 4 GiB — cannot fit on FAT32, and we cannot split ESD. Use an ISO with install.wim instead.'
        }}
        $useExisting = $true
    }} else {{
        # Already pre-split (e.g. MS Media Creation Tool output) — accept as-is.
        $swm = @(Get-ChildItem -LiteralPath $sourcesDir -Filter 'install*.swm' -ErrorAction SilentlyContinue)
        if ($swm.Count -gt 0) {{
            Write-Note ('install image: pre-split (' + $swm.Count + ' chunks)')
            $useExisting = $true
        }} else {{
            throw 'No sources\install.{{wim,esd,swm}} found — this does not look like a Windows install ISO.'
        }}
    }}

    # ─── Wipe + (re)initialize the disk as GPT ─────────────────────────────
    Write-Step ('Wiping disk ' + $diskNo + ' (this destroys ALL data on it)')
    Get-Disk -Number $diskNo | Clear-Disk -RemoveData -RemoveOEM -Confirm:$false -ErrorAction Stop
    Start-Sleep -Milliseconds 500
    $d = Get-Disk -Number $diskNo
    if ($d.PartitionStyle -eq 'RAW') {{
        Initialize-Disk -Number $diskNo -PartitionStyle GPT -ErrorAction Stop
    }} elseif ($d.PartitionStyle -ne 'GPT') {{
        Set-Disk -Number $diskNo -PartitionStyle GPT -ErrorAction Stop
    }}
    Start-Sleep -Milliseconds 500
    Write-Ok ('disk wiped + GPT ready (was ' + $d.PartitionStyle + ')')

    # ─── Single FAT32 partition (capped at 32 GiB) ─────────────────────────
    $diskBytes = (Get-Disk -Number $diskNo).Size
    if ($diskBytes -le $maxFat32SizeBytes) {{
        Write-Step 'Creating FAT32 partition (uses entire disk)'
        $part = New-Partition -DiskNumber $diskNo -UseMaximumSize -AssignDriveLetter -ErrorAction Stop
    }} else {{
        $sizeGb = [math]::Round($maxFat32SizeBytes / 1GB, 0)
        Write-Step ('Creating FAT32 partition (' + $sizeGb + ' GiB; remainder left unallocated)')
        $part = New-Partition -DiskNumber $diskNo -Size $maxFat32SizeBytes -AssignDriveLetter -ErrorAction Stop
    }}
    Start-Sleep -Milliseconds 500
    $vol = Format-Volume -Partition $part -FileSystem FAT32 -NewFileSystemLabel 'RECLAIM' -Confirm:$false -Force -ErrorAction Stop
    $letter = ($part | Get-Partition).DriveLetter
    if (-not $letter) {{ throw 'Failed to assign drive letter to USB partition.' }}
    $usbRoot = ($letter + ':\')
    Write-Ok ('partition ready: ' + $usbRoot + '  (' + $vol.FileSystemLabel + ')')

    # ─── Copy boot files (everything except install.wim) ────────────────────
    Write-Step ('Copying boot files → ' + $usbRoot)
    # robocopy /MIR mirror, /R:2 retry twice, /W:3 wait 3s, /NFL/NDL silent,
    # /NJH no header, /NP no progress, /XF excludes install.wim (we handle it
    # via Dism /Split-Image right after — install.esd / install*.swm we leave
    # alone because they already fit or are pre-split).
    $rc = robocopy $srcRoot $usbRoot /MIR /R:2 /W:3 /NFL /NDL /NJH /NP /XF install.wim
    if ($LASTEXITCODE -gt 7) {{ throw ('robocopy failed with exit ' + $LASTEXITCODE) }}
    Write-Ok ('boot copy complete (robocopy exit ' + $LASTEXITCODE + ')')

    # ─── Place install image (split if needed) ──────────────────────────────
    $dstSources = Join-Path $usbRoot 'sources'
    New-Item -ItemType Directory -Path $dstSources -Force | Out-Null
    if ($needsSplit) {{
        Write-Step ('Splitting install.wim into ~' + $splitChunkMb + ' MB chunks (this can take several minutes)')
        $swmTarget = Join-Path $dstSources 'install.swm'
        # Dism /Split-Image is the official MS-supported way to fit install.wim
        # on FAT32. It creates install.swm + install2.swm + install3.swm + …
        & dism.exe /Split-Image /ImageFile:$installWim /SWMFile:$swmTarget /FileSize:$splitChunkMb
        if ($LASTEXITCODE -ne 0) {{ throw ('dism /Split-Image failed with exit ' + $LASTEXITCODE) }}
        Write-Ok 'install.wim split into install.swm chunks'
    }} elseif ($useExisting) {{
        # install.esd or pre-split install*.swm — these were already mirrored
        # by the /MIR above, so nothing left to do here.
        Write-Ok 'install image already fits FAT32 (no split needed)'
    }} else {{
        # install.wim that's actually under 4 GiB — mirror copied everything
        # except install.wim, so put it now.
        Write-Step 'Copying install.wim (fits FAT32 without split)'
        Copy-Item -LiteralPath $installWim -Destination (Join-Path $dstSources 'install.wim') -Force
        Write-Ok 'install.wim copied'
    }}

    # ─── Inject autounattend.xml (optional) ─────────────────────────────────
    if ($unattend -and (Test-Path -LiteralPath $unattend)) {{
        Write-Step 'Injecting autounattend.xml'
        Copy-Item -LiteralPath $unattend -Destination (Join-Path $usbRoot 'autounattend.xml') -Force
        Copy-Item -LiteralPath $unattend -Destination (Join-Path $dstSources 'autounattend.xml') -Force
        Write-Ok 'autounattend.xml in place'
    }} else {{
        Write-Note 'no autounattend.xml — vanilla install media'
    }}

    # ─── Inject $OEM$\$$\Setup\Scripts\setupcomplete.cmd (optional) ─────────
    # Win Setup copies the $OEM$\$$\ tree into %WINDIR%\ during install when
    # UseConfigurationSet=true is set in the unattend (autounattend.xml above
    # already does that). So our setupcomplete.cmd lands at
    # C:\Windows\Setup\Scripts\setupcomplete.cmd and Setup runs it as SYSTEM
    # after oobeSystem completes.
    if ($setupcomplete -and (Test-Path -LiteralPath $setupcomplete)) {{
        Write-Step 'Injecting $OEM$\$$\Setup\Scripts\setupcomplete.cmd'
        $oemScripts = Join-Path $usbRoot '$OEM$\$$\Setup\Scripts'
        New-Item -ItemType Directory -Path $oemScripts -Force | Out-Null
        Copy-Item -LiteralPath $setupcomplete -Destination (Join-Path $oemScripts 'setupcomplete.cmd') -Force
        Write-Ok 'setupcomplete.cmd in place'
    }}

    # ─── Sanity check: UEFI bootloader present ─────────────────────────────
    $bootx64 = Join-Path $usbRoot 'efi\boot\bootx64.efi'
    if (Test-Path -LiteralPath $bootx64) {{
        Write-Ok 'UEFI bootloader present: efi\boot\bootx64.efi'
    }} else {{
        Write-Host '    WARNING: efi\boot\bootx64.efi missing. UEFI boot may fail.' -ForegroundColor Yellow
    }}

    Write-Step 'Done.'
    Write-Host ('Bootable USB ready on disk ' + $diskNo + ': ' + $disk.FriendlyName) -ForegroundColor Green
    Write-Host ('Drive: ' + $usbRoot) -ForegroundColor Green
}} catch {{
    Write-Fail $_.Exception.Message
    throw
}} finally {{
    if ($mounted) {{
        Write-Step 'Dismounting ISO'
        try {{ Dismount-DiskImage -ImagePath $srcIso -ErrorAction SilentlyContinue | Out-Null }} catch {{}}
    }}
    if ($unattend -and (Test-Path -LiteralPath $unattend)) {{
        Remove-Item -LiteralPath $unattend -Force -ErrorAction SilentlyContinue
    }}
    if ($setupcomplete -and (Test-Path -LiteralPath $setupcomplete)) {{
        Remove-Item -LiteralPath $setupcomplete -Force -ErrorAction SilentlyContinue
    }}
}}
"#
    )
}
