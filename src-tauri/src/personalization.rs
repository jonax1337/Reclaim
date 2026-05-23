use serde::Serialize;

use crate::tweaks::{ps_parse_error, run_ps};

#[derive(Serialize, Clone)]
pub struct WallpaperStatus {
    pub path: Option<String>,
    pub style: u32,
    pub tile: bool,
    pub lockscreen_policy_path: Option<String>,
}

const STATUS_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
$desk = Get-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name Wallpaper, WallpaperStyle, TileWallpaper -ErrorAction SilentlyContinue
$wallpaper = if ($desk -and $desk.Wallpaper) { $desk.Wallpaper } else { $null }
$style = if ($desk -and $desk.WallpaperStyle) { [int]$desk.WallpaperStyle } else { 0 }
$tile = if ($desk -and $desk.TileWallpaper) { [int]$desk.TileWallpaper -eq 1 } else { $false }
$lsKey = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization' -Name LockScreenImagePath -ErrorAction SilentlyContinue
$ls = if ($lsKey -and $lsKey.LockScreenImagePath) { $lsKey.LockScreenImagePath } else { $null }
[pscustomobject]@{
    path = $wallpaper
    style = $style
    tile = $tile
    lockscreen_policy_path = $ls
} | ConvertTo-Json -Compress
"#;

#[tauri::command]
pub async fn personalization_status() -> Result<WallpaperStatus, String> {
    let r = run_ps(STATUS_SCRIPT);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    let out = r.stdout.trim();
    if out.is_empty() {
        return Err("Empty personalization status payload".into());
    }
    let v: serde_json::Value = serde_json::from_str(out)
        .map_err(|e| ps_parse_error("Personalization status", &e.to_string(), out, &r.stderr))?;
    let opt_s = |k: &str| -> Option<String> {
        v.get(k).and_then(|x| x.as_str()).map(|s| s.to_string())
    };
    Ok(WallpaperStatus {
        path: opt_s("path"),
        style: v.get("style").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
        tile: v.get("tile").and_then(|x| x.as_bool()).unwrap_or(false),
        lockscreen_policy_path: opt_s("lockscreen_policy_path"),
    })
}

fn safe_image_path(p: &str) -> bool {
    !p.is_empty()
        && p.len() < 1024
        && !p.contains('\n')
        && !p.contains('\r')
        && !p.contains('\'')
        && !p.contains('"')
        && !p.contains('`')
        && !p.contains('$')
        && p.contains(':')
}

#[tauri::command]
pub async fn set_wallpaper(path: String, style: u32) -> Result<(), String> {
    if !safe_image_path(&path) {
        return Err("Rejected image path".into());
    }
    if !std::path::Path::new(&path).exists() {
        return Err("Image not found".into());
    }
    // Style mapping mirrors Windows: 0=Center, 2=Stretch, 6=Fit, 10=Fill, 22=Span.
    let (style_str, tile_str) = match style {
        0 => ("0", "0"),  // Center
        1 => ("0", "1"),  // Tile
        2 => ("2", "0"),  // Stretch
        6 => ("6", "0"),  // Fit
        10 => ("10", "0"), // Fill
        22 => ("22", "0"), // Span
        _ => return Err(format!("Unknown style: {style}")),
    };
    // SystemParametersInfo(SPI_SETDESKWALLPAPER=0x14, 0, path, SPIF_UPDATEINIFILE|SPIF_SENDCHANGE=3).
    // Write reg first so the style change persists even before the SPI broadcast.
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name WallpaperStyle -Value '{style_str}' -Force
Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name TileWallpaper -Value '{tile_str}' -Force
Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class Reclaim_Wp {{
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}}
"@
[Reclaim_Wp]::SystemParametersInfo(20, 0, '{path}', 3) | Out-Null
"#,
        path = path.replace('\'', "''"),
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

#[tauri::command]
pub async fn set_lockscreen(path: String) -> Result<(), String> {
    if !safe_image_path(&path) {
        return Err("Rejected image path".into());
    }
    if !std::path::Path::new(&path).exists() {
        return Err("Image not found".into());
    }
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$key = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization'
if (-not (Test-Path $key)) {{ New-Item -Path $key -Force | Out-Null }}
Set-ItemProperty -Path $key -Name 'LockScreenImagePath' -Value '{path}' -Force
Set-ItemProperty -Path $key -Name 'LockScreenImageUrl' -Value '{path}' -Force
Set-ItemProperty -Path $key -Name 'LockScreenImageStatus' -Value 1 -Type DWord -Force
"#,
        path = path.replace('\'', "''"),
    );
    let r = run_ps(&script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}

#[tauri::command]
pub async fn clear_lockscreen() -> Result<(), String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$key = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization'
foreach ($name in 'LockScreenImagePath','LockScreenImageUrl','LockScreenImageStatus') {
    Remove-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue
}
"#;
    let r = run_ps(script);
    if !r.success {
        return Err(if r.stderr.is_empty() { r.stdout } else { r.stderr });
    }
    Ok(())
}
