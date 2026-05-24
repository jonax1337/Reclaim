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
    vec![
        e("VK7JG-NPHTM-C97JM-9MPGT-3V66T", "Windows 11 Pro"),
        e("W269N-WFGWX-YVC9B-4J6C9-T83GX", "Windows 11 Pro N"),
        e("MH37W-N47XK-V7XM9-C7227-GCQG9", "Windows 11 Home"),
        e("3KHY7-WNT83-DGQKR-F7HPR-844BM", "Windows 11 Home N"),
        e("NRG8B-VKK3Q-CXVCJ-9G2XF-6Q84J", "Windows 11 Home Single Language"),
        e("MNXKQ-WY2CT-JWBJ2-T68TQ-YBH2V", "Windows 11 Education"),
        e("DXG7C-N36C4-C4HTG-X4T3X-2YV77", "Windows 11 Pro Education"),
        e("XGVPP-NMH47-7TTHJ-W3FW7-8HV2C", "Windows 11 Pro Education N"),
        e("NW6C2-QMPVW-D7KKK-3GKT6-VCFB2", "Windows 11 Education N"),
        e("R3BYW-CBNWT-F3JTP-FM942-BTDXY", "Windows 11 Enterprise G"),
        e("NPPR9-FWDCX-D2C8J-H872K-2YT43", "Windows 11 Enterprise"),
        e("DPH2V-TTNVB-4X9Q3-TJR4H-KHJW4", "Windows 11 Enterprise N"),
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

/// Escape a value for safe use inside a PowerShell single-quoted string. PS
/// single-quoted strings escape `'` by doubling: `'it''s ok'`. They do NOT
/// interpret `$`, `` ` ``, or backslashes specially — so this is the safest
/// shell-quoting style for arbitrary input.
fn ps_single_quote(input: &str) -> String {
    input.replace('\'', "''")
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
const COMPONENT_DEPLOY: &str = "Microsoft-Windows-Deployment";

const ARCH: &str = "amd64";
const PUB_KEY_TOKEN: &str = "31bf3856ad364e35";

fn component_open(name: &str) -> String {
    format!(
        r#"    <component name="{name}" processorArchitecture="{ARCH}" publicKeyToken="{PUB_KEY_TOKEN}" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">"#
    )
}

fn build_xml(c: &UnattendConfig) -> String {
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

    // Auto-partition the first disk for UEFI/GPT install. This wipes the
    // selected disk — that's exactly the point of unattended install.
    s.push_str(
        r#"
      <DiskConfiguration>
        <Disk wcm:action="add">
          <DiskID>0</DiskID>
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
"#,
    );

    // Image install: pick by edition name if supplied, else first image
    s.push_str("      <ImageInstall>\n");
    s.push_str("        <OSImage>\n");
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
    s.push_str(
        r#"          <InstallTo>
            <DiskID>0</DiskID>
            <PartitionID>3</PartitionID>
          </InstallTo>
        </OSImage>
      </ImageInstall>
"#,
    );

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
    if !bypass_cmds.is_empty() {
        s.push_str("      <RunSynchronous>\n");
        for (i, cmd) in bypass_cmds.iter().enumerate() {
            s.push_str(&format!(
                r#"        <RunSynchronousCommand wcm:action="add">
          <Order>{}</Order>
          <Path>cmd /c {}</Path>
        </RunSynchronousCommand>
"#,
                i + 1,
                xml_escape(cmd)
            ));
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
        priv_cmds.push("reg add HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection /v MaxTelemetryAllowed /t REG_DWORD /d 1 /f".into());
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
    if !priv_cmds.is_empty() {
        s.push_str("      <RunSynchronous>\n");
        for (i, cmd) in priv_cmds.iter().enumerate() {
            s.push_str(&format!(
                r#"        <RunSynchronousCommand wcm:action="add">
          <Order>{}</Order>
          <Path>cmd /c {}</Path>
        </RunSynchronousCommand>
"#,
                i + 1,
                xml_escape(cmd)
            ));
        }
        s.push_str("      </RunSynchronous>\n");
    }

    s.push_str("    </component>\n");

    // Deployment component for Reseal flags (skip OOBE entirely if desired).
    // We only emit this when the user wants to skip OOBE — otherwise let it run.
    if c.skip_oobe_privacy && c.skip_ms_account && c.skip_eula {
        s.push_str(&component_open(COMPONENT_DEPLOY));
        s.push_str(
            r#"
      <Reseal>
        <Mode>Audit</Mode>
      </Reseal>
"#,
        );
        s.push_str("    </component>\n");
    }

    s.push_str("  </settings>\n");
    s
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
        s.push_str("        <HideOnlineAccountScreens>true</HideOnlineAccountScreens>\n");
        s.push_str("        <HideLocalAccountScreen>true</HideLocalAccountScreen>\n");
    }
    s.push_str("        <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE>\n");
    s.push_str("        <NetworkLocation>Home</NetworkLocation>\n");
    if c.skip_oobe_privacy {
        s.push_str("        <ProtectYourPC>3</ProtectYourPC>\n");
    } else {
        s.push_str("        <ProtectYourPC>1</ProtectYourPC>\n");
    }
    s.push_str("        <SkipMachineOOBE>true</SkipMachineOOBE>\n");
    s.push_str("        <SkipUserOOBE>true</SkipUserOOBE>\n");
    s.push_str("      </OOBE>\n");

    // Local account
    let password_value = c.password.clone().unwrap_or_default();
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

    // Autologon (optional)
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

    // AppX removals — one PS command per pattern, scoped to current user and
    // provisioned packages so the apps don't come back for new users.
    for pat in &c.debloat_appx_patterns {
        if pat.is_empty() {
            continue;
        }
        let safe = ps_single_quote(pat);
        let ps = format!(
            "Get-AppxPackage -AllUsers '{safe}' | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue; \
             Get-AppxProvisionedPackage -Online | Where-Object {{ $_.DisplayName -like '{safe}' }} | \
             Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue"
        );
        out.push((
            format!("powershell -NoProfile -ExecutionPolicy Bypass -Command \"{}\"", ps),
            format!("Remove AppX {pat}"),
        ));
    }

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
