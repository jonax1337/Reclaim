use base64::Engine as _;
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufReader, Read};
use std::process::{Child, Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::ipc::Channel;

#[cfg(windows)]
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};

use crate::tweaks::run_ps;

/// Catalog of streamable maintenance ops. Each entry maps a frontend op id to
/// (label, PowerShell body). Bodies are STATIC strings — no user input ever
/// reaches the PowerShell payload.
fn op_catalog(op: &str) -> Option<(&'static str, &'static str)> {
    match op {
        // ---- Repair ----
        "sfc" => Some(("SFC /scannow", "sfc /scannow")),
        "dism-check" => Some((
            "DISM CheckHealth",
            "DISM /Online /Cleanup-Image /CheckHealth",
        )),
        "dism-scan" => Some((
            "DISM ScanHealth",
            "DISM /Online /Cleanup-Image /ScanHealth",
        )),
        "dism-restore" => Some((
            "DISM RestoreHealth",
            "DISM /Online /Cleanup-Image /RestoreHealth",
        )),
        "chkdsk-scan" => Some((
            "Check disk C: (scan)",
            "Write-Host '>>> Online read-only scan of C: via Repair-Volume...' -ForegroundColor Cyan; \
             $r = Repair-Volume -DriveLetter C -Scan -ErrorAction Stop; \
             Write-Host \"Result: $r\" -ForegroundColor Green",
        )),
        "chkdsk-spotfix" => Some((
            "Check disk C: (spot fix)",
            "Write-Host '>>> Online spot-fix of C: via Repair-Volume...' -ForegroundColor Cyan; \
             Write-Host '>>> This locks the volume briefly but does not need a reboot.' -ForegroundColor DarkGray; \
             $r = Repair-Volume -DriveLetter C -SpotFix -ErrorAction Stop; \
             Write-Host \"Result: $r\" -ForegroundColor Green",
        )),

        // ---- Cleanup ----
        "winsxs-cleanup" => Some((
            "WinSxS cleanup",
            "DISM /Online /Cleanup-Image /StartComponentCleanup",
        )),
        "winsxs-resetbase" => Some((
            "WinSxS cleanup + ResetBase",
            "DISM /Online /Cleanup-Image /StartComponentCleanup /ResetBase",
        )),
        "temp-cleanup" => Some((
            "Temp folder cleanup",
            "Write-Host '>>> Removing %TEMP% contents...'; \
             $tmp = [System.IO.Path]::GetTempPath(); \
             Get-ChildItem -LiteralPath $tmp -Force -ErrorAction SilentlyContinue | \
                ForEach-Object { try { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop; Write-Host \"  removed $($_.Name)\" } catch { Write-Host \"  skipped $($_.Name) (in use)\" -ForegroundColor DarkYellow } }; \
             Write-Host '>>> Removing $env:WINDIR\\Temp...'; \
             Get-ChildItem -LiteralPath $env:WINDIR\\Temp -Force -ErrorAction SilentlyContinue | \
                ForEach-Object { try { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop; Write-Host \"  removed $($_.Name)\" } catch { Write-Host \"  skipped $($_.Name) (in use)\" -ForegroundColor DarkYellow } }; \
             Write-Host '>>> Done.' -ForegroundColor Green",
        )),

        // ---- Defender ----
        "defender-sig-update" => Some((
            "Defender signature update",
            "& \"$env:ProgramFiles\\Windows Defender\\MpCmdRun.exe\" -SignatureUpdate",
        )),
        "defender-quick-scan" => Some((
            "Defender quick scan",
            "& \"$env:ProgramFiles\\Windows Defender\\MpCmdRun.exe\" -Scan -ScanType 1",
        )),
        "defender-full-scan" => Some((
            "Defender full scan",
            "& \"$env:ProgramFiles\\Windows Defender\\MpCmdRun.exe\" -Scan -ScanType 2",
        )),
        "defender-offline-scan" => Some((
            "Defender offline scan",
            "Write-Host '>>> Scheduling Defender Offline scan. Windows will reboot to perform it.' -ForegroundColor Yellow; \
             Start-MpWDOScan; \
             Write-Host '>>> Scheduled. Reboot to start the scan.' -ForegroundColor Green",
        )),
        "defender-status" => Some((
            "Defender status",
            "Get-MpComputerStatus | Format-List \
                AMServiceEnabled, AntispywareEnabled, AntivirusEnabled, BehaviorMonitorEnabled, \
                RealTimeProtectionEnabled, IoavProtectionEnabled, NISEnabled, \
                AntivirusSignatureLastUpdated, AntivirusSignatureVersion, \
                QuickScanStartTime, QuickScanEndTime, FullScanStartTime, FullScanEndTime",
        )),

        // ---- Reset ----
        "wu-components-reset" => Some((
            "Windows Update components reset",
            "Write-Host '>>> Stopping update services...'; \
             foreach ($svc in 'bits','wuauserv','appidsvc','cryptsvc') { \
                Write-Host \"  stop $svc\"; Stop-Service $svc -Force -ErrorAction SilentlyContinue }; \
             Write-Host '>>> Renaming SoftwareDistribution and catroot2...'; \
             $sd = \"$env:WINDIR\\SoftwareDistribution\"; \
             $cr = \"$env:WINDIR\\System32\\catroot2\"; \
             if (Test-Path $sd) { try { Rename-Item $sd \"$sd.bak\" -Force -ErrorAction Stop; Write-Host \"  renamed SoftwareDistribution\" } catch { Write-Host \"  could not rename SoftwareDistribution: $_\" -ForegroundColor Yellow } }; \
             if (Test-Path $cr) { try { Rename-Item $cr \"$cr.bak\" -Force -ErrorAction Stop; Write-Host \"  renamed catroot2\" } catch { Write-Host \"  could not rename catroot2: $_\" -ForegroundColor Yellow } }; \
             Write-Host '>>> Starting update services...'; \
             foreach ($svc in 'cryptsvc','appidsvc','wuauserv','bits') { \
                Write-Host \"  start $svc\"; Start-Service $svc -ErrorAction SilentlyContinue }; \
             Write-Host '>>> Done. Try Windows Update again.' -ForegroundColor Green",
        )),
        "spooler-reset" => Some((
            "Print spooler reset",
            "Write-Host '>>> Stopping Spooler service...'; \
             Stop-Service Spooler -Force -ErrorAction SilentlyContinue; \
             Write-Host '>>> Clearing queued jobs...'; \
             $q = \"$env:SystemRoot\\System32\\spool\\PRINTERS\"; \
             if (Test-Path $q) { Get-ChildItem $q -Force -ErrorAction SilentlyContinue | \
                ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue; Write-Host \"  removed $($_.Name)\" } }; \
             Write-Host '>>> Starting Spooler...'; \
             Start-Service Spooler; \
             Write-Host '>>> Done.' -ForegroundColor Green",
        )),
        "icon-cache-reset" => Some((
            "Icon cache rebuild",
            "Write-Host '>>> Stopping Explorer...'; \
             Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; \
             Start-Sleep -Seconds 1; \
             Write-Host '>>> Clearing icon + thumbnail cache...'; \
             $base = \"$env:LocalAppData\\Microsoft\\Windows\\Explorer\"; \
             Get-ChildItem $base -Filter 'iconcache*' -Force -ErrorAction SilentlyContinue | \
                ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue; Write-Host \"  removed $($_.Name)\" }; \
             Get-ChildItem $base -Filter 'thumbcache*' -Force -ErrorAction SilentlyContinue | \
                ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue; Write-Host \"  removed $($_.Name)\" }; \
             Remove-Item \"$env:LocalAppData\\IconCache.db\" -Force -ErrorAction SilentlyContinue; \
             Write-Host '>>> Restarting Explorer...'; \
             Start-Process explorer.exe; \
             Write-Host '>>> Done.' -ForegroundColor Green",
        )),
        "font-cache-reset" => Some((
            "Font cache rebuild",
            "Write-Host '>>> Stopping font cache services...'; \
             Stop-Service FontCache -Force -ErrorAction SilentlyContinue; \
             Stop-Service FontCache3.0.0.0 -Force -ErrorAction SilentlyContinue; \
             Write-Host '>>> Removing cache files...'; \
             $paths = @( \
                \"$env:LocalAppData\\FontCache\", \
                \"$env:WinDir\\ServiceProfiles\\LocalService\\AppData\\Local\\FontCache\" \
             ); \
             foreach ($p in $paths) { if (Test-Path $p) { \
                Get-ChildItem $p -Filter '*.dat' -Force -ErrorAction SilentlyContinue | \
                    ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue; Write-Host \"  removed $($_.FullName)\" } } }; \
             Write-Host '>>> Starting font cache services...'; \
             Start-Service FontCache -ErrorAction SilentlyContinue; \
             Start-Service FontCache3.0.0.0 -ErrorAction SilentlyContinue; \
             Write-Host '>>> Done.' -ForegroundColor Green",
        )),
        "store-reset" => Some((
            "Microsoft Store cache reset",
            "Write-Host '>>> Running wsreset...' -ForegroundColor Cyan; \
             wsreset.exe; \
             Write-Host '>>> Done. The Store should re-open automatically.' -ForegroundColor Green",
        )),

        // ---- Network ----
        "network-reset" => Some((
            "Network stack reset",
            "Write-Host '>>> Releasing IP leases...'; ipconfig /release; \
             Write-Host '>>> Resetting Winsock catalog...'; netsh winsock reset; \
             Write-Host '>>> Resetting TCP/IP stack...'; netsh int ip reset; \
             Write-Host '>>> Renewing IP leases...'; ipconfig /renew; \
             Write-Host '>>> Flushing DNS cache...'; ipconfig /flushdns; \
             Write-Host '>>> Done. A reboot is recommended.' -ForegroundColor Green",
        )),
        "firewall-reset" => Some((
            "Firewall reset to defaults",
            "Write-Host '>>> Resetting Windows Firewall to defaults...' -ForegroundColor Cyan; \
             netsh advfirewall reset; \
             Write-Host '>>> Done.' -ForegroundColor Green",
        )),

        _ => None,
    }
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreamEvent {
    pub kind: String, // "stdout" | "stderr" | "exit" | "info"
    pub data: String,
    /// True when this event came from a carriage-return flush (live progress,
    /// e.g. `sfc /scannow`'s "Verifying 50%"). The frontend overwrites the
    /// previous progress line instead of appending so the tab doesn't fill up
    /// with thousands of percentage updates.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub progress: bool,
}

/// Kills the child on drop if it's still alive. Guarantees we don't leak a
/// long-running PowerShell (e.g. DISM RestoreHealth) when the frontend
/// disconnects or the command function returns early.
struct ChildGuard(Arc<Mutex<Option<Child>>>);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        if let Ok(mut slot) = self.0.lock() {
            if let Some(mut child) = slot.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[derive(Serialize, Clone)]
pub struct PowerPlan {
    pub guid: String,
    pub name: String,
    pub active: bool,
}

/// Pump bytes from `reader` into `chan`, emitting one StreamEvent per logical
/// line. Splits on both `\n` and lone `\r` so that progress bars from native
/// tools (sfc, DISM, chkdsk) surface live instead of getting buffered until
/// the program exits. CR-flushed events get `progress: true` so the frontend
/// can overwrite the previous progress line.
/// Returns `Err(())` if the channel was disconnected by the frontend so the
/// caller can abort the parent stream loop and let the ChildGuard reap the
/// child process.
fn pump_stream<R: Read + Send + 'static>(
    reader: R,
    kind: &'static str,
    chan: Channel<StreamEvent>,
) -> Result<(), ()> {
    let mut br = BufReader::new(reader);
    let mut buf: Vec<u8> = Vec::with_capacity(256);
    let mut pending_cr = false;
    let mut byte = [0u8; 1];
    let send = |kind: &str, buf: &[u8], progress: bool| -> Result<(), ()> {
        let line = String::from_utf8_lossy(buf).into_owned();
        chan.send(StreamEvent {
            kind: kind.into(),
            data: line,
            progress,
        })
        .map_err(|_| ())
    };
    loop {
        match br.read(&mut byte) {
            Ok(0) => break,
            Ok(_) => {
                let b = byte[0];
                if pending_cr {
                    pending_cr = false;
                    if b == b'\n' {
                        // CRLF — emit accumulated buf as a normal line.
                        send(kind, &buf, false)?;
                        buf.clear();
                        continue;
                    } else {
                        // Lone CR — emit accumulated buf as a progress line,
                        // then fall through to process this byte normally.
                        // Skip if buf is empty (avoid blanking out the tab when
                        // tools spam consecutive bare \r's).
                        if !buf.is_empty() {
                            send(kind, &buf, true)?;
                            buf.clear();
                        }
                    }
                }
                if b == b'\r' {
                    pending_cr = true;
                } else if b == b'\n' {
                    send(kind, &buf, false)?;
                    buf.clear();
                } else {
                    buf.push(b);
                }
            }
            Err(_) => break,
        }
    }
    if !buf.is_empty() {
        send(kind, &buf, pending_cr)?;
    }
    Ok(())
}

/// Legacy pipe-based streamer. Used by winget (line-oriented progress bars
/// render fine without a PTY). The new PTY-based pipeline below is what
/// powers the embedded terminal in `/maintenance`.
#[cfg(windows)]
pub(crate) fn run_streamed(script: String, on_event: Channel<StreamEvent>) -> Result<i32, String> {
    let wrapped = format!(
        "chcp 65001 2>&1 | Out-Null; \
         [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
         $OutputEncoding = [System.Text.Encoding]::UTF8; \
         {script}"
    );
    let mut child = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &wrapped,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn failed: {e}"))?;

    let stdout = child.stdout.take().ok_or("no stdout pipe")?;
    let stderr = child.stderr.take().ok_or("no stderr pipe")?;

    let child_slot: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(Some(child)));
    let _guard = ChildGuard(child_slot.clone());

    let err_chan = on_event.clone();
    let stderr_thread = std::thread::spawn(move || {
        let _ = pump_stream(stderr, "stderr", err_chan);
    });

    let stdout_disconnected = pump_stream(stdout, "stdout", on_event).is_err();

    let _ = stderr_thread.join();
    let mut child = child_slot
        .lock()
        .ok()
        .and_then(|mut s| s.take())
        .ok_or("child slot empty")?;
    if stdout_disconnected {
        let _ = child.kill();
        let _ = child.wait();
        return Err("frontend disconnected".into());
    }
    let status = child.wait().map_err(|e| format!("wait failed: {e}"))?;
    Ok(status.code().unwrap_or(-1))
}

#[cfg(not(windows))]
pub(crate) fn run_streamed(_script: String, _on_event: Channel<StreamEvent>) -> Result<i32, String> {
    Err("Streaming PowerShell is Windows-only.".into())
}

// ----- PTY-based streaming (real embedded terminal) -----

#[cfg(windows)]
struct PtySession {
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[cfg(windows)]
fn pty_sessions() -> &'static Mutex<HashMap<String, PtySession>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, PtySession>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(windows)]
fn pty_send_chunk(chan: &Channel<StreamEvent>, bytes: &[u8]) -> bool {
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    chan.send(StreamEvent {
        kind: "bytes".into(),
        data: encoded,
        progress: false,
    })
    .is_ok()
}

#[cfg(windows)]
pub(crate) async fn run_pty_script(
    task_id: String,
    script: String,
    cols: u16,
    rows: u16,
    on_event: Channel<StreamEvent>,
) -> Result<i32, String> {
    let safe_cols = cols.max(40);
    let safe_rows = rows.max(8);
    let chan = on_event.clone();
    let session_id = task_id.clone();

    let exit_code = tokio::task::spawn_blocking(move || -> Result<i32, String> {
        let pty = native_pty_system();
        let pair = pty
            .openpty(PtySize {
                rows: safe_rows,
                cols: safe_cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("openpty failed: {e}"))?;

        let mut cmd = CommandBuilder::new("powershell.exe");
        cmd.arg("-NoProfile");
        cmd.arg("-ExecutionPolicy");
        cmd.arg("Bypass");
        cmd.arg("-Command");
        cmd.arg(&script);

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("spawn failed: {e}"))?;
        // Drop the slave so the child gets EOF on its end when it exits.
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("clone_reader failed: {e}"))?;

        let killer = child.clone_killer();
        pty_sessions().lock().unwrap().insert(
            session_id.clone(),
            PtySession {
                master: pair.master,
                killer,
            },
        );

        // The reader thread signals via this channel whenever it stops (either
        // because the pty hit EOF, the frontend disconnected, or an error
        // bubbled). We use it later to wait briefly for final output to drain
        // after the child exits, without blocking forever on a stuck reader.
        let (reader_done_tx, reader_done_rx) = std::sync::mpsc::channel::<()>();
        let read_chan = chan.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if !pty_send_chunk(&read_chan, &buf[..n]) {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            let _ = reader_done_tx.send(());
        });

        // child.wait() is the authoritative "is this op finished?" signal. On
        // ConPTY the cloned reader sometimes doesn't observe EOF cleanly, so we
        // never block on the reader thread itself — instead we drop the master
        // to encourage EOF, then wait briefly for the reader to drain.
        let status = child.wait().map_err(|e| format!("wait failed: {e}"))?;
        pty_sessions().lock().unwrap().remove(&session_id);
        let _ = reader_done_rx.recv_timeout(std::time::Duration::from_millis(1500));

        Ok(status.exit_code() as i32)
    })
    .await
    .map_err(|e| format!("task join failed: {e}"))??;

    let _ = on_event.send(StreamEvent {
        kind: "exit".into(),
        data: exit_code.to_string(),
        progress: false,
    });
    Ok(exit_code)
}

#[cfg(windows)]
#[tauri::command]
pub async fn maintenance_run_stream(
    task_id: String,
    op: String,
    cols: u16,
    rows: u16,
    on_event: Channel<StreamEvent>,
) -> Result<i32, String> {
    let (label, body) = op_catalog(&op).ok_or_else(|| format!("Unknown op: {op}"))?;
    // PowerShell wrapper:
    //   chcp 65001        — UTF-8 console code page so native tools (sfc, DISM,
    //                       chkdsk) emit UTF-8 instead of OEM. Also affects
    //                       child processes spawned inside.
    //   $PSStyle.*        — enable ANSI rendering on PS7+; on Windows PS 5.1 the
    //                       host already uses ANSI when attached to a ConPTY.
    //   Write-Host header — colored banner so the user knows which op started.
    //   exit $LASTEXITCODE — propagate the native tool's exit code through PS.
    let script = format!(
        "chcp 65001 2>&1 | Out-Null; \
         [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
         $OutputEncoding = [System.Text.Encoding]::UTF8; \
         Write-Host '>>> {label}' -ForegroundColor Cyan; \
         {body}; \
         exit $LASTEXITCODE"
    );
    run_pty_script(task_id, script, cols, rows, on_event).await
}

/// Strict path validation for paths interpolated into the unblock PowerShell.
#[cfg(windows)]
fn looks_like_safe_unblock_path(p: &str) -> bool {
    !p.is_empty()
        && p.len() < 1024
        && !p.contains('\n')
        && !p.contains('\r')
        && !p.contains('"')
        && !p.contains('\'')
        && !p.contains('`')
        && !p.contains('$')
        && !p.contains("..")
        && p.contains(':')
}

#[cfg(windows)]
#[tauri::command]
pub async fn unblock_files_stream(
    task_id: String,
    target: String,
    recursive: bool,
    cols: u16,
    rows: u16,
    on_event: Channel<StreamEvent>,
) -> Result<i32, String> {
    if !looks_like_safe_unblock_path(&target) {
        return Err("Rejected target path".into());
    }
    if !std::path::Path::new(&target).exists() {
        return Err("Target does not exist".into());
    }
    let recurse_flag = if recursive { "-Recurse " } else { "" };
    // The path has been validated above; no quote/newline/backtick/dollar can
    // appear in it, so single-quoted interpolation is safe.
    let script = format!(
        "chcp 65001 2>&1 | Out-Null; \
         [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
         $OutputEncoding = [System.Text.Encoding]::UTF8; \
         Write-Host '>>> Unblock-File on {target}' -ForegroundColor Cyan; \
         $target = '{target}'; \
         if (Test-Path -LiteralPath $target -PathType Container) {{ \
            $items = Get-ChildItem -LiteralPath $target {recurse_flag}-File -Force -ErrorAction SilentlyContinue; \
            $total = ($items | Measure-Object).Count; \
            Write-Host \"Found $total files to inspect.\" -ForegroundColor DarkGray; \
            $unblocked = 0; \
            foreach ($f in $items) {{ \
                $alt = Get-Item -LiteralPath $f.FullName -Stream Zone.Identifier -ErrorAction SilentlyContinue; \
                if ($alt) {{ \
                    try {{ Unblock-File -LiteralPath $f.FullName -ErrorAction Stop; Write-Host \"  unblocked $($f.FullName)\" -ForegroundColor Green; $unblocked++ }} \
                    catch {{ Write-Host \"  failed $($f.FullName): $_\" -ForegroundColor Red }} \
                }} \
            }}; \
            Write-Host \">>> Unblocked $unblocked file(s) out of $total.\" -ForegroundColor Cyan \
         }} else {{ \
            $alt = Get-Item -LiteralPath $target -Stream Zone.Identifier -ErrorAction SilentlyContinue; \
            if ($alt) {{ \
                try {{ Unblock-File -LiteralPath $target -ErrorAction Stop; Write-Host \"  unblocked $target\" -ForegroundColor Green }} \
                catch {{ Write-Host \"  failed: $_\" -ForegroundColor Red }} \
            }} else {{ Write-Host '>>> File has no Zone.Identifier — nothing to unblock.' -ForegroundColor DarkGray }} \
         }}; \
         exit 0"
    );
    run_pty_script(task_id, script, cols, rows, on_event).await
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn unblock_files_stream(
    _task_id: String,
    _target: String,
    _recursive: bool,
    _cols: u16,
    _rows: u16,
    _on_event: Channel<StreamEvent>,
) -> Result<i32, String> {
    Err("Unblock is Windows-only.".into())
}

#[cfg(windows)]
#[tauri::command]
pub async fn maintenance_pty_resize(task_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = pty_sessions().lock().map_err(|e| e.to_string())?;
    if let Some(session) = map.get(&task_id) {
        session
            .master
            .resize(PtySize {
                rows: rows.max(8),
                cols: cols.max(40),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
pub async fn maintenance_pty_kill(task_id: String) -> Result<(), String> {
    let mut map = pty_sessions().lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = map.remove(&task_id) {
        session.killer.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn maintenance_run_stream(
    _task_id: String,
    _op: String,
    _cols: u16,
    _rows: u16,
    _on_event: Channel<StreamEvent>,
) -> Result<i32, String> {
    Err("Maintenance ops are Windows-only.".into())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn maintenance_pty_resize(
    _task_id: String,
    _cols: u16,
    _rows: u16,
) -> Result<(), String> {
    Err("Windows only.".into())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn maintenance_pty_kill(_task_id: String) -> Result<(), String> {
    Err("Windows only.".into())
}

#[tauri::command]
pub async fn list_power_plans() -> Result<Vec<PowerPlan>, String> {
    let r = run_ps("powercfg /list");
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    // powercfg /list output is localized — the prefix differs per Windows language
    // (e.g. "Power Scheme GUID:" on EN, "Energieschema-GUID:" on DE). Match the GUID
    // and parenthesized name with a regex so locale doesn't matter.
    let re = regex::Regex::new(
        r"(?m)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\s+\(([^)]+)\)\s*(\*?)",
    )
    .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for cap in re.captures_iter(&r.stdout) {
        out.push(PowerPlan {
            guid: cap[1].to_string(),
            name: cap[2].trim().to_string(),
            active: !cap[3].is_empty(),
        });
    }
    Ok(out)
}

fn valid_guid(s: &str) -> bool {
    let bytes = s.as_bytes();
    bytes.len() == 36
        && bytes[8] == b'-'
        && bytes[13] == b'-'
        && bytes[18] == b'-'
        && bytes[23] == b'-'
        && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

#[tauri::command]
pub async fn set_power_plan(guid: String) -> Result<(), String> {
    if !valid_guid(&guid) {
        return Err(format!("Rejected GUID: {guid}"));
    }
    let r = run_ps(&format!("powercfg /setactive {guid}"));
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

#[tauri::command]
pub async fn unlock_ultimate_performance() -> Result<String, String> {
    let r = run_ps(
        "powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61",
    );
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(r.stdout.trim().to_string())
}

/// Built-in Windows power schemes that we refuse to delete.
const PROTECTED_GUIDS: &[&str] = &[
    "381b4222-f694-41f0-9685-ff5bb260df2e", // Balanced
    "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", // High Performance
    "a1841308-3541-4fab-bc81-f71556f20b4a", // Power Saver
];

#[tauri::command]
pub async fn delete_power_plan(guid: String) -> Result<(), String> {
    if !valid_guid(&guid) {
        return Err(format!("Rejected GUID: {guid}"));
    }
    let lower = guid.to_lowercase();
    if PROTECTED_GUIDS.iter().any(|g| *g == lower) {
        return Err("Cannot delete a built-in Windows power scheme.".into());
    }
    let r = run_ps(&format!("powercfg /delete {guid}"));
    if !r.success {
        let msg = if r.stderr.is_empty() { r.stdout } else { r.stderr };
        return Err(msg.trim().to_string());
    }
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
pub async fn launch_cleanmgr() -> Result<(), String> {
    Command::new("cleanmgr.exe")
        .args(["/sageset:1"])
        .spawn()
        .map_err(|e| format!("Could not launch cleanmgr: {e}"))?;
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
pub async fn launch_memory_diagnostic() -> Result<(), String> {
    Command::new("mdsched.exe")
        .spawn()
        .map_err(|e| format!("Could not launch mdsched: {e}"))?;
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn launch_cleanmgr() -> Result<(), String> {
    Err("Windows only.".into())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn launch_memory_diagnostic() -> Result<(), String> {
    Err("Windows only.".into())
}
