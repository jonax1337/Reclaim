//! autounattend.xml generator.
//!
//! Pure XML synthesis from a typed config — no DISM, no ISO mutation. The
//! generated XML is self-contained: AppX removals and registry tweaks are
//! emitted as `<FirstLogonCommands>` entries that run on the new user's first
//! login, so the file works dropped onto any standard Win11 install media
//! (USB stick, Rufus image, mounted ISO) without needing companion scripts.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
pub struct RegistryTweak {
    pub hive: String,
    pub path: String,
    pub name: String,
    #[serde(rename = "type")]
    pub reg_type: String,
    pub value: serde_json::Value,
}

#[derive(Deserialize)]
pub struct UnattendConfig {
    // Locale
    pub language: String,           // "en-US"
    pub keyboard: String,           // "0409:00000409"
    pub system_locale: String,      // "en-US"
    pub user_locale: String,        // "en-US"
    pub timezone: String,           // "W. Europe Standard Time"
    pub geo_id: String,             // "94" (US), "94" (DE = 94 actually — DE is 94? Germany is GeoID 94)
    // (Frontend supplies the exact value from a picker.)

    // Account
    pub username: String,
    pub password: Option<String>,
    pub autologon: bool,
    pub computer_name: String,
    pub organization: String,

    // Edition picker (matched against /IMAGE/NAME wildcard)
    pub edition: Option<String>, // e.g. "Windows 11 Pro"
    // Generic retail key for unattended install. If user supplies their own
    // key it overrides this. The defaults are the MS-published KMS Client
    // Setup Keys used for edition selection during install.
    pub product_key: Option<String>,

    // Bypass
    pub bypass_tpm_check: bool,
    pub bypass_secure_boot_check: bool,
    pub bypass_ram_check: bool,
    pub bypass_storage_check: bool,
    pub bypass_cpu_check: bool,
    pub bypass_network_requirement: bool, // BypassNRO during OOBE
    pub skip_ms_account: bool,            // Force local account creation flow
    pub skip_eula: bool,
    pub skip_oobe_privacy: bool,          // Pre-answer all OOBE privacy prompts to off

    // OOBE privacy defaults (also emitted as registry writes during specialize)
    pub disable_telemetry: bool,
    pub disable_advertising_id: bool,
    pub disable_location: bool,
    pub disable_tailored_experiences: bool,
    pub disable_find_my_device: bool,
    pub disable_inking_typing: bool,
    pub disable_diagnostic_data: bool,
    pub disable_cortana: bool,

    // Debloat commands derived from the selected Reclaim profile
    pub debloat_appx_patterns: Vec<String>,
    pub registry_tweaks: Vec<RegistryTweak>,
    /// Free-form custom commands routed to a specific Setup hook (Task
    /// Sequence feature). Each command is emitted at its hook's correct
    /// location (RunSynchronous for windowsPE/specialize, FirstLogonCommand
    /// for oobeSystem/firstlogon, appended to setupcomplete.cmd for setup-
    /// complete).
    #[serde(default)]
    pub custom_commands: Vec<CustomCommand>,
    /// Winget IDs to install silently via setupcomplete.cmd after OOBE.
    #[serde(default)]
    pub winget_apps: Vec<String>,
    /// Opt-in auto disk wipe + partition. When None, Setup asks the user
    /// where to install. When Some, fully unattended install (zero clicks).
    #[serde(default)]
    pub disk_auto_setup: Option<DiskAutoSetup>,
}

#[derive(Deserialize, Clone)]
pub struct CustomCommand {
    pub hook: String, // "windowsPE" | "specialize" | "oobeSystem" | "setupcomplete" | "firstlogon"
    pub command: String,
    pub description: String,
}

/// Fully-automated disk setup: emit `<DiskConfiguration>` + `<InstallTo>` so
/// Setup wipes a specific disk, partitions UEFI/GPT (ESP + MSR + OS), and
/// installs without asking the user where to put Windows. Only emitted when
/// the user explicitly opts in (Task Sequence disk-setup step with
/// `confirmed: true`). Without this, Setup asks interactively which is the
/// safe default.
#[derive(Deserialize, Clone)]
pub struct DiskAutoSetup {
    pub disk_number: u32,
}

/// Generate a complete autounattend.xml as a string. Pure function; safe to
/// call from the UI to preview output before saving.
#[tauri::command]
pub async fn generate_autounattend_xml(config: UnattendConfig) -> Result<String, String> {
    Ok(build_xml(&config))
}

/// Save XML content to an absolute path picked by the user via the dialog
/// plugin. We don't second-guess the path — the file dialog already constrained
/// the user's choice. We just ensure the parent exists and write atomically.
#[tauri::command]
pub async fn save_autounattend_xml(path: String, xml: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let parent = target
        .parent()
        .ok_or_else(|| "destination has no parent directory".to_string())?;
    if !parent.exists() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create dir failed: {e}"))?;
    }
    atomic_write(&target, xml.as_bytes())
        .map_err(|e| format!("write {path} failed: {e}"))
}

#[derive(Serialize)]
pub struct EditionInfo {
    pub key: String,
    pub label: String,
}

/// Static list of common Win11 edition keys (KMS client setup keys, published
/// by Microsoft for edition-selection during unattended install — not
/// activation keys). Used by the UI to populate the edition picker without
/// having to mount an ISO first.
#[tauri::command]
pub async fn list_win11_editions() -> Vec<EditionInfo> {
    fn e(key: &str, label: &str) -> EditionInfo {
        EditionInfo {
            key: key.to_string(),
            label: label.to_string(),
        }
    }
    // Microsoft KMS Client Setup Keys for Windows 11 (edition-selection keys
    // during unattended install; not activation keys). Source:
    // https://learn.microsoft.com/en-us/windows-server/get-started/kms-client-activation-keys
    vec![
        e("W269N-WFGWX-YVC9B-4J6C9-T83GX", "Windows 11 Pro"),
        e("MH37W-N47XK-V7XM9-C7227-GCQG9", "Windows 11 Pro N"),
        e("NRG8B-VKK3Q-CXVCJ-9G2XF-6Q84J", "Windows 11 Pro for Workstations"),
        e("9FNHH-K3HBT-3W4TD-6383H-6XYWF", "Windows 11 Pro for Workstations N"),
        e("6TP4R-GNPTD-KYYHQ-7B7DP-J447Y", "Windows 11 Pro Education"),
        e("YVWGF-BXNMC-HTQYQ-CPQ99-66QFC", "Windows 11 Pro Education N"),
        e("NW6C2-QMPVW-D7KKK-3GKT6-VCFB2", "Windows 11 Education"),
        e("2WH4N-8QGBV-H22JP-CT43Q-MDWWJ", "Windows 11 Education N"),
        e("NPPR9-FWDCX-D2C8J-H872K-2YT43", "Windows 11 Enterprise"),
        e("DPH2V-TTNVB-4X9Q3-TJR4H-KHJW4", "Windows 11 Enterprise N"),
        e("YDRBP-3D83W-TY26F-D46B2-XCKRJ", "Windows 11 Enterprise LTSC 2024"),
        e("MFY9F-XBN2F-TYFMP-CCV49-RMYVH", "Windows 11 Enterprise N LTSC 2024"),
        e("WNMTR-4C88C-JK8YV-HQ7T2-76DF9", "Windows 11 IoT Enterprise LTSC 2024"),
        e("TX9XD-98N7V-6WMQ6-BX7FG-H8Q99", "Windows 11 Home"),
        e("3KHY7-WNT83-DGQKR-F7HPR-844BM", "Windows 11 Home N"),
        e("7HNRX-D7KGG-3K4RQ-4WPJ4-YTDFH", "Windows 11 Home Single Language"),
    ]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn xml_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

fn atomic_write(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp_path = PathBuf::from(&tmp);
    {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&tmp_path)?;
        f.write_all(content)?;
        f.sync_all().ok();
    }
    match std::fs::rename(&tmp_path, path) {
        Ok(()) => Ok(()),
        Err(_) => {
            std::fs::copy(&tmp_path, path)?;
            let _ = std::fs::remove_file(&tmp_path);
            Ok(())
        }
    }
}

// ─── XML building ─────────────────────────────────────────────────────────────

const COMPONENT_INTL_WINPE: &str = "Microsoft-Windows-International-Core-WinPE";
const COMPONENT_SETUP: &str = "Microsoft-Windows-Setup";
const COMPONENT_SHELL: &str = "Microsoft-Windows-Shell-Setup";
const COMPONENT_INTL: &str = "Microsoft-Windows-International-Core";
// Microsoft-Windows-Deployment is the component that owns <RunSynchronous>
// in the specialize/auditUser/oobeSystem passes. Shell-Setup also exposes
// RunSynchronous but only in auditUser — putting RunSynchronous into
// Shell-Setup/specialize produces a schema-validation error
// (0x80220001 "The provided unattend file is not valid"), Setup exits with
// 0x1F during the oobeSystem→setup.exe transition, and the next boot
// reports "computer was restarted unexpectedly". v0.18.0–v0.18.2 all had
// this bug.
const COMPONENT_DEPLOY: &str = "Microsoft-Windows-Deployment";

const ARCH: &str = "amd64";
const PUB_KEY_TOKEN: &str = "31bf3856ad364e35";

fn component_open(name: &str) -> String {
    format!(
        r#"    <component name="{name}" processorArchitecture="{ARCH}" publicKeyToken="{PUB_KEY_TOKEN}" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">"#
    )
}

pub(crate) fn build_xml(c: &UnattendConfig) -> String {
    let mut out = String::with_capacity(8192);
    out.push_str(
        r#"<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend">
"#,
    );

    out.push_str(&pass_windows_pe(c));
    out.push_str(&pass_specialize(c));
    out.push_str(&pass_oobe_system(c));

    out.push_str("</unattend>\n");
    out
}

// ── windowsPE pass: locale, partitions, edition pick, install-time bypasses ──

fn pass_windows_pe(c: &UnattendConfig) -> String {
    let lang = xml_escape(&c.language);
    let kbd = xml_escape(&c.keyboard);
    let syslocale = xml_escape(&c.system_locale);
    let userlocale = xml_escape(&c.user_locale);

    let mut s = String::new();
    s.push_str("  <settings pass=\"windowsPE\">\n");

    // ── International core (UI language + locale) ─────────────────────────
    s.push_str(&component_open(COMPONENT_INTL_WINPE));
    s.push_str(&format!(
        r#"
      <SetupUILanguage>
        <UILanguage>{lang}</UILanguage>
      </SetupUILanguage>
      <InputLocale>{kbd}</InputLocale>
      <SystemLocale>{syslocale}</SystemLocale>
      <UILanguage>{lang}</UILanguage>
      <UserLocale>{userlocale}</UserLocale>
"#
    ));
    s.push_str("    </component>\n");

    // ── Setup component: disk layout, image pick, install-time tweaks ─────
    s.push_str(&component_open(COMPONENT_SETUP));

    // Tell Setup to look for the $OEM$ folder next to autounattend.xml. We
    // place \$OEM$\$$\Setup\Scripts\setupcomplete.cmd on the boot medium so
    // Windows copies it to %WINDIR%\Setup\Scripts\ during install; that file
    // is then executed as SYSTEM after oobeSystem completes — the safe place
    // for AppX-removals (specialize-pass RunSynchronous would corrupt Sysprep,
    // and even if it didn't, encoding the script inline blows past the 8 KB
    // command-line limit on RunSynchronousCommand).
    s.push_str("\n      <UseConfigurationSet>true</UseConfigurationSet>\n");

    // Disk configuration — only emitted when the user explicitly opted into
    // "fully automated mode" by enabling + confirming the disk-setup step in
    // the Task Sequence. Without it, Setup asks the user where to install
    // (one interactive click, safe on multi-disk systems).
    if let Some(disk) = &c.disk_auto_setup {
        let n = disk.disk_number;
        s.push_str(&format!(
            r#"      <DiskConfiguration>
        <Disk wcm:action="add">
          <DiskID>{n}</DiskID>
          <WillWipeDisk>true</WillWipeDisk>
          <CreatePartitions>
            <CreatePartition wcm:action="add">
              <Order>1</Order>
              <Type>EFI</Type>
              <Size>300</Size>
            </CreatePartition>
            <CreatePartition wcm:action="add">
              <Order>2</Order>
              <Type>MSR</Type>
              <Size>16</Size>
            </CreatePartition>
            <CreatePartition wcm:action="add">
              <Order>3</Order>
              <Type>Primary</Type>
              <Extend>true</Extend>
            </CreatePartition>
          </CreatePartitions>
          <ModifyPartitions>
            <ModifyPartition wcm:action="add">
              <Order>1</Order>
              <PartitionID>1</PartitionID>
              <Label>System</Label>
              <Format>FAT32</Format>
            </ModifyPartition>
            <ModifyPartition wcm:action="add">
              <Order>2</Order>
              <PartitionID>2</PartitionID>
            </ModifyPartition>
            <ModifyPartition wcm:action="add">
              <Order>3</Order>
              <PartitionID>3</PartitionID>
              <Label>Windows</Label>
              <Letter>C</Letter>
              <Format>NTFS</Format>
            </ModifyPartition>
          </ModifyPartitions>
        </Disk>
      </DiskConfiguration>
"#
        ));
    }

    // Image install: ImageInstall wraps both InstallFrom (edition picker by
    // /IMAGE/NAME) and InstallTo. When disk_auto_setup is set we point
    // InstallTo at the OS partition (DiskID=N PartitionID=3 from our layout
    // above). Otherwise we omit InstallTo so Setup prompts.
    let has_install_content = c.edition.is_some() || c.disk_auto_setup.is_some();
    if has_install_content {
        s.push_str("      <ImageInstall>\n        <OSImage>\n");
        if let Some(edition) = &c.edition {
            let edition_esc = xml_escape(edition);
            s.push_str(&format!(
                r#"          <InstallFrom>
            <MetaData wcm:action="add">
              <Key>/IMAGE/NAME</Key>
              <Value>{edition_esc}</Value>
            </MetaData>
          </InstallFrom>
"#
            ));
        }
        if let Some(disk) = &c.disk_auto_setup {
            let n = disk.disk_number;
            s.push_str(&format!(
                r#"          <InstallTo>
            <DiskID>{n}</DiskID>
            <PartitionID>3</PartitionID>
          </InstallTo>
"#
            ));
        } else {
            // No fixed target — show UI on partition selection.
            s.push_str("          <WillShowUI>OnError</WillShowUI>\n");
        }
        s.push_str("        </OSImage>\n      </ImageInstall>\n");
    }

    // UserData (EULA + product key for edition selection)
    s.push_str("      <UserData>\n");
    s.push_str("        <AcceptEula>true</AcceptEula>\n");
    s.push_str(&format!(
        "        <FullName>{}</FullName>\n",
        xml_escape(&c.username)
    ));
    s.push_str(&format!(
        "        <Organization>{}</Organization>\n",
        xml_escape(&c.organization)
    ));
    if let Some(key) = c.product_key.as_ref().filter(|k| !k.is_empty()) {
        s.push_str(&format!(
            r#"        <ProductKey>
          <Key>{}</Key>
          <WillShowUI>OnError</WillShowUI>
        </ProductKey>
"#,
            xml_escape(key)
        ));
    }
    s.push_str("      </UserData>\n");

    // Install-time bypasses via RunSynchronous (TPM/SecureBoot/RAM/Storage/CPU)
    let mut bypass_cmds: Vec<String> = Vec::new();
    if c.bypass_tpm_check {
        bypass_cmds.push("reg add HKLM\\System\\Setup\\LabConfig /v BypassTPMCheck /t REG_DWORD /d 1 /f".into());
    }
    if c.bypass_secure_boot_check {
        bypass_cmds.push("reg add HKLM\\System\\Setup\\LabConfig /v BypassSecureBootCheck /t REG_DWORD /d 1 /f".into());
    }
    if c.bypass_ram_check {
        bypass_cmds.push("reg add HKLM\\System\\Setup\\LabConfig /v BypassRAMCheck /t REG_DWORD /d 1 /f".into());
    }
    if c.bypass_storage_check {
        bypass_cmds.push("reg add HKLM\\System\\Setup\\LabConfig /v BypassStorageCheck /t REG_DWORD /d 1 /f".into());
    }
    if c.bypass_cpu_check {
        bypass_cmds.push("reg add HKLM\\System\\Setup\\LabConfig /v BypassCPUCheck /t REG_DWORD /d 1 /f".into());
    }
    // Custom commands targeting the windowsPE hook (Task Sequence feature).
    let pe_customs: Vec<&CustomCommand> =
        c.custom_commands.iter().filter(|cc| cc.hook == "windowsPE").collect();

    if !bypass_cmds.is_empty() || !pe_customs.is_empty() {
        s.push_str("      <RunSynchronous>\n");
        let mut order = 1usize;
        for cmd in &bypass_cmds {
            s.push_str(&format!(
                r#"        <RunSynchronousCommand wcm:action="add">
          <Order>{order}</Order>
          <Path>cmd /c {}</Path>
        </RunSynchronousCommand>
"#,
                xml_escape(cmd)
            ));
            order += 1;
        }
        for cc in &pe_customs {
            s.push_str(&format!(
                r#"        <RunSynchronousCommand wcm:action="add">
          <Order>{order}</Order>
          <Path>{}</Path>
          <Description>{}</Description>
        </RunSynchronousCommand>
"#,
                xml_escape(&cc.command),
                xml_escape(&cc.description),
            ));
            order += 1;
        }
        s.push_str("      </RunSynchronous>\n");
    }

    s.push_str("    </component>\n");
    s.push_str("  </settings>\n");
    s
}

// ── specialize pass: machine config, BypassNRO, privacy defaults ────────────

fn pass_specialize(c: &UnattendConfig) -> String {
    let mut s = String::new();
    s.push_str("  <settings pass=\"specialize\">\n");
    s.push_str(&component_open(COMPONENT_SHELL));

    s.push_str(&format!(
        "\n      <ComputerName>{}</ComputerName>\n",
        xml_escape(&c.computer_name)
    ));
    s.push_str(&format!(
        "      <TimeZone>{}</TimeZone>\n",
        xml_escape(&c.timezone)
    ));
    s.push_str(&format!(
        "      <RegisteredOrganization>{}</RegisteredOrganization>\n",
        xml_escape(&c.organization)
    ));
    s.push_str(&format!(
        "      <RegisteredOwner>{}</RegisteredOwner>\n",
        xml_escape(&c.username)
    ));

    // Privacy registry writes during specialize — applied before any user
    // exists, so they become machine defaults rather than per-user state.
    let mut priv_cmds: Vec<String> = Vec::new();
    if !c.geo_id.is_empty() {
        // Strip anything but digits; the geo id is always a numeric MS code.
        let geo: String = c.geo_id.chars().filter(|d| d.is_ascii_digit()).collect();
        if !geo.is_empty() {
            priv_cmds.push(format!(
                "reg add \"HKU\\.DEFAULT\\Control Panel\\International\\Geo\" /v Nation /t REG_SZ /d {geo} /f"
            ));
        }
    }
    if c.bypass_network_requirement {
        priv_cmds.push("reg add HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\OOBE /v BypassNRO /t REG_DWORD /d 1 /f".into());
    }
    if c.disable_telemetry {
        priv_cmds.push("reg add HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection /v AllowTelemetry /t REG_DWORD /d 0 /f".into());
    }
    if c.disable_diagnostic_data {
        // Cap telemetry at Basic (1). Lives in the same policy hive as
        // disable_telemetry (which sets 0 = Security), so the user can pick
        // "off" or "basic" without writing two conflicting values.
        if !c.disable_telemetry {
            priv_cmds.push("reg add HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection /v AllowTelemetry /t REG_DWORD /d 1 /f".into());
        }
    }
    if c.disable_location {
        priv_cmds.push("reg add HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors /v DisableLocation /t REG_DWORD /d 1 /f".into());
    }
    if c.disable_find_my_device {
        priv_cmds.push("reg add HKLM\\SOFTWARE\\Policies\\Microsoft\\FindMyDevice /v AllowFindMyDevice /t REG_DWORD /d 0 /f".into());
    }
    if c.disable_inking_typing {
        priv_cmds.push("reg add HKLM\\SOFTWARE\\Policies\\Microsoft\\InputPersonalization /v RestrictImplicitTextCollection /t REG_DWORD /d 1 /f".into());
        priv_cmds.push("reg add HKLM\\SOFTWARE\\Policies\\Microsoft\\InputPersonalization /v RestrictImplicitInkCollection /t REG_DWORD /d 1 /f".into());
    }
    if c.disable_cortana {
        priv_cmds.push("reg add HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search /v AllowCortana /t REG_DWORD /d 0 /f".into());
    }

    // ── Pre-OOBE sponsored-apps killer ─────────────────────────────────────
    // Setup runs `specialize` BEFORE the OOBE network-connect — this is the
    // only window where we can block the Microsoft Store sponsored-apps push
    // (WhatsApp / Spotify / Disney+ / TikTok / Netflix / Instagram / Sponsored
    // Games etc.) before the cloud manifest is fetched. Doing it any later
    // (FirstLogonCommands, setupcomplete.cmd) is whack-a-mole because the
    // download has already started by then.
    if !c.debloat_appx_patterns.is_empty() {
        // Machine-wide policies — kill the consumer content + Store auto-download.
        for kv in [
            ("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent", "DisableWindowsConsumerFeatures", 1),
            ("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent", "DisableCloudOptimizedContent", 1),
            ("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent", "DisableConsumerAccountStateContent", 1),
            ("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent", "DisableSoftLanding", 1),
            ("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent", "DisableThirdPartySuggestions", 1),
            ("HKLM\\SOFTWARE\\Policies\\Microsoft\\WindowsStore", "AutoDownload", 2),
        ] {
            let (path, name, value) = kv;
            priv_cmds.push(format!("reg add \"{path}\" /v {name} /t REG_DWORD /d {value} /f"));
        }
        // HKU\.DEFAULT writes — this hive is the template Windows copies for
        // every new user. Setting these here means every account created later
        // (admin during OOBE first, then any other accounts) starts with
        // ContentDeliveryManager fully disabled. SubscribedContent-* are the
        // individual Spotlight / Tips / Suggested-Apps surfaces.
        let ck = "HKU\\.DEFAULT\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager";
        for v in [
            "ContentDeliveryAllowed",
            "OemPreInstalledAppsEnabled",
            "PreInstalledAppsEnabled",
            "PreInstalledAppsEverEnabled",
            "SilentInstalledAppsEnabled",
            "SystemPaneSuggestionsEnabled",
            "SoftLandingEnabled",
            "RotatingLockScreenEnabled",
            "RotatingLockScreenOverlayEnabled",
            "SubscribedContentEnabled",
            "SubscribedContent-310093Enabled",
            "SubscribedContent-338387Enabled",
            "SubscribedContent-338388Enabled",
            "SubscribedContent-338389Enabled",
            "SubscribedContent-338393Enabled",
            "SubscribedContent-353694Enabled",
            "SubscribedContent-353696Enabled",
            "SubscribedContent-353698Enabled",
        ] {
            priv_cmds.push(format!("reg add \"{ck}\" /v {v} /t REG_DWORD /d 0 /f"));
        }
    }

    // AppX removals are NOT emitted here. They live in setupcomplete.cmd on
    // the boot medium under \$OEM$\$$\Setup\Scripts\setupcomplete.cmd —
    // generated by `generate_setupcomplete_cmd` and dropped onto the stick /
    // into the ISO by the flasher / builder. Windows Setup auto-copies it to
    // C:\Windows\Setup\Scripts\ and runs it as SYSTEM after oobeSystem.
    //
    // Earlier (v0.18.1) attempt embedded the whole script base64-encoded into
    // a single RunSynchronousCommand here; on Privacy Maximum that produced a
    // ~50 KB `cmd /c …` invocation, which blew past Setup's CreateProcess
    // command-line limit and crashed specialize → reboot loop.

    // Shell-Setup component is closed here — <RunSynchronous> does NOT belong
    // inside it (only in Microsoft-Windows-Setup/windowsPE and Microsoft-
    // Windows-Deployment/{specialize,auditUser,oobeSystem}).
    s.push_str("    </component>\n");

    // Custom commands targeting the specialize hook (Task Sequence feature).
    let spec_customs: Vec<&CustomCommand> = c
        .custom_commands
        .iter()
        .filter(|cc| cc.hook == "specialize")
        .collect();

    if !priv_cmds.is_empty() || !spec_customs.is_empty() {
        s.push_str(&component_open(COMPONENT_DEPLOY));
        s.push_str("\n      <RunSynchronous>\n");
        let mut order = 1usize;
        for cmd in &priv_cmds {
            s.push_str(&run_sync_cmd(order, &xml_escape(&format!("cmd /c {cmd}"))));
            order += 1;
        }
        for cc in &spec_customs {
            s.push_str(&run_sync_cmd(order, &xml_escape(&cc.command)));
            order += 1;
        }
        s.push_str("      </RunSynchronous>\n");
        s.push_str("    </component>\n");
    }

    s.push_str("  </settings>\n");
    s
}

/// Emit a single `<RunSynchronousCommand>` entry. `path_xml` must already be
/// XML-escaped — caller decides whether the value needs `cmd /c` wrapping.
fn run_sync_cmd(order: usize, path_xml: &str) -> String {
    format!(
        r#"        <RunSynchronousCommand wcm:action="add">
          <Order>{order}</Order>
          <Path>{path_xml}</Path>
        </RunSynchronousCommand>
"#
    )
}

/// Build the `setupcomplete.cmd` body. One PowerShell line per AppX pattern,
/// each logging to `C:\Windows\Setup\Scripts\setupcomplete.log` so the user
/// can audit what got removed after first boot.
///
/// The frontend obtains this string via `generate_setupcomplete_cmd` and
/// passes it on to the ISO builder / USB flasher, which drop it onto the
/// boot medium as `\$OEM$\$$\Setup\Scripts\setupcomplete.cmd`. Windows Setup
/// then copies it to `%WINDIR%\Setup\Scripts\` during install and runs it as
/// SYSTEM after `oobeSystem` completes.
#[tauri::command]
pub async fn generate_setupcomplete_cmd(config: UnattendConfig) -> Result<String, String> {
    let setup_customs: Vec<&CustomCommand> = config
        .custom_commands
        .iter()
        .filter(|cc| cc.hook == "setupcomplete")
        .collect();
    Ok(build_setupcomplete_script(
        &config.debloat_appx_patterns,
        &setup_customs,
        &config.winget_apps,
    ))
}

pub(crate) fn build_setupcomplete_script(
    patterns: &[String],
    custom_setup_cmds: &[&CustomCommand],
    winget_apps: &[String],
) -> String {
    let mut out = String::new();
    // CRLF throughout — this file ends up as a Windows .cmd. Some Win11 cmd
    // builds choke on LF-only line endings in batch files.
    out.push_str("@echo off\r\n");
    out.push_str("setlocal\r\n");
    out.push_str("set LOG=C:\\Windows\\Setup\\Scripts\\setupcomplete.log\r\n");
    out.push_str("echo === Reclaim setupcomplete.cmd started %date% %time% === >> \"%LOG%\"\r\n");

    // Two-pass approach: sponsored apps (WhatsApp/Spotify/Disney+/etc) often
    // are still mid-download when setupcomplete.cmd runs. Pass 1 catches what's
    // already there, sleep 60s for any in-flight Store installs to finish, then
    // Pass 2 mops them up. Each pass kills BOTH provisioned-package (image
    // baseline, blocks future user accounts) AND already-installed packages
    // (for the freshly-created admin user).
    for (idx, label) in [(1usize, "PASS 1"), (2, "PASS 2 (retry after store finishes)")].iter() {
        out.push_str(&format!(
            "echo --- {label} --- >> \"%LOG%\"\r\n"
        ));
        for pat in patterns.iter().filter(|p| !p.is_empty()) {
            let safe = pat.replace('\'', "''").replace('"', "");
            out.push_str(&format!(
                "echo [appx pass{idx}] {pat} >> \"%LOG%\"\r\n\
                 powershell -NoProfile -Command \
                 \"Get-AppxProvisionedPackage -Online | \
                 Where-Object {{ $_.DisplayName -like '{safe}' }} | \
                 Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue; \
                 Get-AppxPackage -AllUsers '{safe}' | \
                 Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue\" \
                 >> \"%LOG%\" 2>&1\r\n"
            ));
        }
        if *idx == 1 {
            out.push_str("echo Waiting 60s for any in-flight Store installs to finish... >> \"%LOG%\"\r\n");
            // PING is the most reliable "sleep N seconds in cmd.exe" idiom:
            // available everywhere, no PS startup tax per call.
            out.push_str("ping 127.0.0.1 -n 61 >nul\r\n");
        }
    }

    // Winget apps — silent install. Winget is bundled on Win11 24H2+; on
    // earlier builds the user gets a "winget not found" error in the log but
    // setupcomplete.cmd continues. Each app is its own line so one failure
    // doesn't take the rest down.
    if !winget_apps.is_empty() {
        out.push_str("echo --- Installing winget apps --- >> \"%LOG%\"\r\n");
        for id in winget_apps.iter().filter(|s| !s.is_empty()) {
            // Strip cmd-significant chars from the id (winget IDs are
            // alphanumeric + dots + hyphens, but be defensive).
            let safe = id
                .replace(['"', '\r', '\n', '|', '&', '<', '>'], "");
            out.push_str(&format!(
                "echo [winget] {safe} >> \"%LOG%\"\r\n\
                 winget install --exact --id \"{safe}\" \
                 --silent --accept-source-agreements --accept-package-agreements \
                 >> \"%LOG%\" 2>&1\r\n"
            ));
        }
    }

    // Custom commands targeting the setupcomplete hook — appended verbatim
    // after the AppX/winget passes. User-supplied; we don't escape (they're
    // expected to know what they're doing).
    if !custom_setup_cmds.is_empty() {
        out.push_str("echo --- Custom commands (setupcomplete hook) --- >> \"%LOG%\"\r\n");
        for cc in custom_setup_cmds {
            let safe_desc = cc
                .description
                .replace(['\r', '\n'], " ");
            out.push_str(&format!(
                "echo [custom] {safe_desc} >> \"%LOG%\"\r\n{} >> \"%LOG%\" 2>&1\r\n",
                cc.command
            ));
        }
    }

    out.push_str("echo === Reclaim setupcomplete.cmd finished %date% %time% === >> \"%LOG%\"\r\n");
    out.push_str("exit /b 0\r\n");
    out
}

// ── oobeSystem pass: OOBE config + user account + FirstLogonCommands ─────────

fn pass_oobe_system(c: &UnattendConfig) -> String {
    let mut s = String::new();
    s.push_str("  <settings pass=\"oobeSystem\">\n");

    // International locale (applied to the OOBE phase)
    s.push_str(&component_open(COMPONENT_INTL));
    s.push_str(&format!(
        r#"
      <InputLocale>{}</InputLocale>
      <SystemLocale>{}</SystemLocale>
      <UILanguage>{}</UILanguage>
      <UserLocale>{}</UserLocale>
"#,
        xml_escape(&c.keyboard),
        xml_escape(&c.system_locale),
        xml_escape(&c.language),
        xml_escape(&c.user_locale),
    ));
    s.push_str("    </component>\n");

    // Shell-Setup: OOBE flags + local account + autologon + first-logon
    s.push_str(&component_open(COMPONENT_SHELL));

    // OOBE block
    s.push_str("\n      <OOBE>\n");
    if c.skip_eula {
        s.push_str("        <HideEULAPage>true</HideEULAPage>\n");
    }
    if c.skip_ms_account {
        // HideOnlineAccountScreens is the documented Win11 element.
        // (HideLocalAccountScreen is not a real schema element — it was
        // silently ignored at best, schema-validation noise at worst.)
        s.push_str("        <HideOnlineAccountScreens>true</HideOnlineAccountScreens>\n");
    }
    s.push_str("        <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE>\n");
    s.push_str("        <NetworkLocation>Home</NetworkLocation>\n");
    if c.skip_oobe_privacy {
        s.push_str("        <ProtectYourPC>3</ProtectYourPC>\n");
    } else {
        s.push_str("        <ProtectYourPC>1</ProtectYourPC>\n");
    }
    // SkipMachineOOBE / SkipUserOOBE were deprecated after Windows 7 and on
    // Win11 24H2/25H2 can actually abort the oobeSystem pass with 0x80070002.
    // The replacement is the per-page Hide*Screen flags above + the OOBE
    // registry bypass written during specialize.
    s.push_str("      </OOBE>\n");

    // Local account
    // Local account: only emit if a non-empty password was supplied. Windows
    // 11 24H2+ LSA refuses to create local accounts with blank passwords —
    // emitting an empty <Value></Value> aborts the oobeSystem pass with the
    // "computer was restarted unexpectedly" reboot loop. Without the block
    // Setup falls back to its own account-creation screen (one extra OOBE
    // step, but reliable).
    let password_value = c.password.clone().unwrap_or_default();
    if !password_value.is_empty() {
        s.push_str(&format!(
            r#"
      <UserAccounts>
        <LocalAccounts>
          <LocalAccount wcm:action="add">
            <Name>{name}</Name>
            <DisplayName>{name}</DisplayName>
            <Group>Administrators</Group>
            <Password>
              <Value>{pw}</Value>
              <PlainText>true</PlainText>
            </Password>
          </LocalAccount>
        </LocalAccounts>
      </UserAccounts>
"#,
            name = xml_escape(&c.username),
            pw = xml_escape(&password_value),
        ));

        // AutoLogon only makes sense when a real password exists: with an
        // empty password 24H2+ silently disables autologon anyway.
        if c.autologon {
            s.push_str(&format!(
                r#"      <AutoLogon>
        <Enabled>true</Enabled>
        <LogonCount>1</LogonCount>
        <Username>{name}</Username>
        <Password>
          <Value>{pw}</Value>
          <PlainText>true</PlainText>
        </Password>
      </AutoLogon>
"#,
                name = xml_escape(&c.username),
                pw = xml_escape(&password_value),
            ));
        }
    }

    // FirstLogonCommands: debloat AppX + apply registry tweaks
    let first_logon = build_first_logon_commands(c);
    if !first_logon.is_empty() {
        s.push_str("      <FirstLogonCommands>\n");
        for (i, (cmd, desc)) in first_logon.iter().enumerate() {
            s.push_str(&format!(
                r#"        <SynchronousCommand wcm:action="add">
          <Order>{}</Order>
          <CommandLine>{}</CommandLine>
          <Description>{}</Description>
        </SynchronousCommand>
"#,
                i + 1,
                xml_escape(cmd),
                xml_escape(desc),
            ));
        }
        s.push_str("      </FirstLogonCommands>\n");
    }

    s.push_str(&format!(
        "      <TimeZone>{}</TimeZone>\n",
        xml_escape(&c.timezone)
    ));

    s.push_str("    </component>\n");
    s.push_str("  </settings>\n");
    s
}

/// Build the list of `(command, description)` entries that run on first
/// logon. AppX removals are emitted as inline PowerShell single-liners so the
/// XML stays self-contained — no companion debloat.ps1 script needed.
fn build_first_logon_commands(c: &UnattendConfig) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();

    // Custom commands targeting oobeSystem or firstlogon hooks (Task Sequence).
    for cc in c.custom_commands.iter() {
        if cc.hook == "oobeSystem" || cc.hook == "firstlogon" {
            out.push((cc.command.clone(), cc.description.clone()));
        }
    }

    // OOBE privacy registry writes that have to be HKCU (per-user) rather
    // than HKLM — those run during first logon as the new user.
    if c.disable_advertising_id {
        out.push((
            "reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo /v Enabled /t REG_DWORD /d 0 /f".into(),
            "Disable advertising ID".into(),
        ));
    }
    if c.disable_tailored_experiences {
        out.push((
            "reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy /v TailoredExperiencesWithDiagnosticDataEnabled /t REG_DWORD /d 0 /f".into(),
            "Disable tailored experiences".into(),
        ));
    }

    // AppX removals are emitted in the specialize pass (as SYSTEM) — see
    // pass_specialize. FirstLogonCommands runs with a filtered medium-IL
    // token where `Remove-AppxProvisionedPackage -Online` silently fails.

    // Custom registry tweaks from the selected Reclaim profile
    for t in &c.registry_tweaks {
        let cmd = reg_add_cmd(t);
        if let Some(cmd) = cmd {
            out.push((cmd, format!("Apply tweak {}\\{}", t.path, t.name)));
        }
    }

    out
}

/// Build a `reg add` command line from a typed RegistryTweak. Returns None
/// for unsupported hive/type combinations (those are skipped silently — the
/// frontend should only send supported ones).
fn reg_add_cmd(t: &RegistryTweak) -> Option<String> {
    let hive_full = match t.hive.as_str() {
        "HKCU" => "HKCU",
        "HKLM" => "HKLM",
        "HKCR" => "HKCR",
        "HKU" => "HKU",
        _ => return None,
    };
    let (type_arg, value_str) = match t.reg_type.as_str() {
        "DWORD" => {
            let n = t.value.as_i64()?;
            ("REG_DWORD", n.to_string())
        }
        "SZ" => {
            let s = t.value.as_str()?;
            ("REG_SZ", s.to_string())
        }
        "EXPANDSZ" => {
            let s = t.value.as_str()?;
            ("REG_EXPAND_SZ", s.to_string())
        }
        _ => return None,
    };
    // reg.exe wants the full key path (hive + subpath) as one quoted arg
    // when the path contains spaces. Strip any quote chars from inputs so
    // the resulting command line can't be cmd-escaped into something else.
    let strip = |s: &str| s.replace(['"', '\n', '\r'], "");
    let path = strip(&t.path);
    let name = strip(&t.name);
    let value = strip(&value_str);
    Some(format!(
        "reg add \"{hive_full}\\{path}\" /v \"{name}\" /t {type_arg} /d \"{value}\" /f"
    ))
}
