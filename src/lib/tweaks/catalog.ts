import type { RegHive, RegType } from "./bridge";

export type TweakCategory =
  | "bloatware"
  | "privacy"
  | "ai"
  | "explorer"
  | "search"
  | "taskbar"
  | "updates"
  | "performance"
  | "notifications"
  | "browser"
  | "security"
  | "memory"
  | "gaming";

export type RegOp = {
  kind: "reg";
  hive: RegHive;
  path: string;
  name: string;
  type: RegType;
  value: number | string;
  defaultValue?: number | string;
  deleteOnRevert?: boolean;
};

export type ShellOp = {
  kind: "shell";
  script: string;
  elevated?: boolean;
};

export type TweakOp = RegOp | ShellOp;

export type Tweak = {
  id: string;
  category: TweakCategory;
  title: string;
  description: string;
  apply: TweakOp[];
  revert?: TweakOp[];
  check?: TweakOp[];
  recommended?: boolean;
  requiresRestart?: "explorer" | "logon" | "system";
  warning?: string;
};

const explorerAdv = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced";
const policiesData = "Software\\Policies\\Microsoft\\Windows\\DataCollection";
const adInfo = "Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo";
const searchKey = "Software\\Microsoft\\Windows\\CurrentVersion\\Search";
const cdmKey = "Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager";

export const PRIVACY_TWEAKS: Tweak[] = [
  {
    id: "telemetry-off",
    category: "privacy",
    title: "Disable telemetry",
    description:
      "Sets the diagnostic data level to 'Security' (0). Stops Windows from sending diagnostic data to Microsoft.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: policiesData,
        name: "AllowTelemetry",
        type: "DWORD",
        value: 0,
        defaultValue: 3,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: policiesData,
        name: "AllowTelemetry",
        type: "DWORD",
        value: 0,
      },
    ],
    revert: [
      {
        kind: "reg",
        hive: "HKLM",
        path: policiesData,
        name: "AllowTelemetry",
        type: "DWORD",
        value: 3,
        deleteOnRevert: true,
      },
    ],
  },
  {
    id: "advertising-id-off",
    category: "privacy",
    title: "Disable advertising ID",
    description: "Prevents apps from using a personalised advertising ID to track you.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: adInfo,
        name: "Enabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: adInfo, name: "Enabled", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "activity-history-off",
    category: "privacy",
    title: "Disable activity history",
    description: "Stops Windows from recording your app and file usage for the Timeline feature.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\System",
        name: "EnableActivityFeed",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\System",
        name: "PublishUserActivities",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\System",
        name: "UploadUserActivities",
        type: "DWORD",
        value: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\System",
        name: "EnableActivityFeed",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "location-tracking-off",
    category: "privacy",
    title: "Disable location tracking",
    description: "Turns off the system-wide location service.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "SYSTEM\\CurrentControlSet\\Services\\lfsvc\\Service\\Configuration",
        name: "Status",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location",
        name: "Value",
        type: "SZ",
        value: "Deny",
        defaultValue: "Allow",
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "SYSTEM\\CurrentControlSet\\Services\\lfsvc\\Service\\Configuration",
        name: "Status",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "feedback-nag-off",
    category: "privacy",
    title: "Disable feedback prompts",
    description: "Windows will stop asking you for feedback about the OS experience.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Siuf\\Rules",
        name: "NumberOfSIUFInPeriod",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Siuf\\Rules",
        name: "PeriodInNanoSeconds",
        type: "DWORD",
        value: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Siuf\\Rules",
        name: "NumberOfSIUFInPeriod",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "tailored-experiences-off",
    category: "privacy",
    title: "Disable tailored experiences",
    description: "Microsoft will no longer analyse your diagnostic data for personalised tips.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\Privacy",
        name: "TailoredExperiencesWithDiagnosticDataEnabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\Privacy",
        name: "TailoredExperiencesWithDiagnosticDataEnabled",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "find-my-device-off",
    category: "privacy",
    title: "Disable 'Find my device'",
    description: "Turns off location tracking tied to your Microsoft account.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\FindMyDevice",
        name: "AllowFindMyDevice",
        type: "DWORD",
        value: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\FindMyDevice",
        name: "AllowFindMyDevice",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "error-reporting-off",
    category: "privacy",
    title: "Disable Windows Error Reporting",
    description: "Stops Windows from sending crash and error reports to Microsoft.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Microsoft\\Windows\\Windows Error Reporting",
        name: "Disabled",
        type: "DWORD",
        value: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Microsoft\\Windows\\Windows Error Reporting",
        name: "Disabled",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "ceip-off",
    category: "privacy",
    title: "Disable Customer Experience Improvement Program",
    description: "Opts out of the CEIP — additional usage telemetry.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Microsoft\\SQMClient\\Windows",
        name: "CEIPEnable",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\AppV\\CEIP",
        name: "CEIPEnable",
        type: "DWORD",
        value: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Microsoft\\SQMClient\\Windows",
        name: "CEIPEnable",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "wifi-sense-off",
    category: "privacy",
    title: "Disable Wi-Fi Sense",
    description: "Stops Windows from sharing Wi-Fi credentials with contacts.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Microsoft\\PolicyManager\\default\\WiFi\\AllowWiFiHotSpotReporting",
        name: "Value",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Microsoft\\PolicyManager\\default\\WiFi\\AllowAutoConnectToWiFiSenseHotspots",
        name: "Value",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "autoplay-off",
    category: "privacy",
    title: "Disable Autoplay",
    description:
      "Prevents Windows from auto-running media on inserted USB drives and discs.",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\AutoplayHandlers",
        name: "DisableAutoplay",
        type: "DWORD",
        value: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\AutoplayHandlers",
        name: "DisableAutoplay",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "clipboard-cloud-sync-off",
    category: "privacy",
    title: "Disable cloud clipboard sync",
    description: "Stops Windows from syncing your clipboard history to your Microsoft account.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\System",
        name: "AllowCrossDeviceClipboard",
        type: "DWORD",
        value: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\System",
        name: "AllowCrossDeviceClipboard",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "shared-experiences-off",
    category: "privacy",
    title: "Disable shared experiences (Project Rome)",
    description:
      "Disables the cross-device 'Continue on PC' feature and related cloud connections.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\System",
        name: "EnableCdp",
        type: "DWORD",
        value: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\System",
        name: "EnableCdp",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "spotlight-desktop-off",
    category: "privacy",
    title: "Disable Windows Spotlight on desktop",
    description: "Stops Windows from showing rotating Spotlight images and ads on the desktop.",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Policies\\Microsoft\\Windows\\CloudContent",
        name: "DisableSpotlightCollectionOnDesktop",
        type: "DWORD",
        value: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Policies\\Microsoft\\Windows\\CloudContent",
        name: "DisableSpotlightCollectionOnDesktop",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "suggested-actions-off",
    category: "privacy",
    title: "Disable suggested actions on copy",
    description:
      "Stops Win11 from popping suggestions when you copy a phone number, date or address.",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\Shell\\Copilot",
        name: "IsCopilotAvailable",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\Shell\\SuggestedActions",
        name: "Disabled",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "onedrive-sync-ads-off",
    category: "privacy",
    title: "Disable OneDrive sync ads in Explorer",
    description: "Hides 'sync provider' notifications inside File Explorer.",
    recommended: true,
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "ShowSyncProviderNotifications",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "ShowSyncProviderNotifications",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "inking-typing-personalization-off",
    category: "privacy",
    title: "Disable inking & typing personalization",
    description:
      "Stops Windows from collecting handwriting and typing samples to improve the cloud language model.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\InputPersonalization", name: "RestrictImplicitInkCollection", type: "DWORD", value: 1, defaultValue: 0 },
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\InputPersonalization", name: "RestrictImplicitTextCollection", type: "DWORD", value: 1, defaultValue: 0 },
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\InputPersonalization\\TrainedDataStore", name: "HarvestContacts", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\InputPersonalization", name: "RestrictImplicitInkCollection", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "app-account-info-off",
    category: "privacy",
    title: "Block apps from accessing Account Info",
    description: "Denies apps access to your Windows account name, picture, and other info.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\userAccountInformation", name: "Value", type: "SZ", value: "Deny", defaultValue: "Allow" },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\userAccountInformation", name: "Value", type: "SZ", value: "Deny" },
    ],
  },
  {
    id: "app-contacts-access-off",
    category: "privacy",
    title: "Block apps from accessing Contacts",
    description: "Denies all apps access to your Contacts store.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\contacts", name: "Value", type: "SZ", value: "Deny", defaultValue: "Allow" },
    ],
  },
  {
    id: "app-calendar-access-off",
    category: "privacy",
    title: "Block apps from accessing Calendar",
    description: "Denies all apps access to the Windows Calendar store.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\appointments", name: "Value", type: "SZ", value: "Deny", defaultValue: "Allow" },
    ],
  },
  {
    id: "app-call-history-off",
    category: "privacy",
    title: "Block apps from accessing Call History",
    description: "Denies apps the ability to read phone call history (relevant on phone-paired PCs).",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\phoneCallHistory", name: "Value", type: "SZ", value: "Deny", defaultValue: "Allow" },
    ],
  },
  {
    id: "app-messaging-access-off",
    category: "privacy",
    title: "Block apps from accessing Messaging",
    description: "Denies apps read access to SMS/MMS messages on phone-linked devices.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\chat", name: "Value", type: "SZ", value: "Deny", defaultValue: "Allow" },
    ],
  },
  {
    id: "app-diagnostics-access-off",
    category: "privacy",
    title: "Block apps from running diagnostics on other apps",
    description: "Denies apps access to information about other running apps.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\appDiagnostics", name: "Value", type: "SZ", value: "Deny", defaultValue: "Allow" },
    ],
  },
  {
    id: "smartscreen-explorer-off",
    category: "privacy",
    title: "Disable SmartScreen for Explorer",
    description:
      "Stops Explorer from sending downloaded file hashes to Microsoft for reputation lookup. Reduces protection against unknown executables.",
    warning: "You lose protection against malicious downloads. Only disable if you have a separate AV layer.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer", name: "SmartScreenEnabled", type: "SZ", value: "Off", defaultValue: "RequireAdmin" },
    ],
  },
  {
    id: "smartscreen-edge-off",
    category: "privacy",
    title: "Disable SmartScreen for Edge",
    description: "Disables URL reputation checks in Microsoft Edge.",
    warning: "Reduces phishing protection in Edge.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Edge", name: "SmartScreenEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "smartscreen-store-off",
    category: "privacy",
    title: "Disable SmartScreen for Store apps",
    description: "Stops the Store app SmartScreen URL/content evaluation.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\AppHost", name: "EnableWebContentEvaluation", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "compat-telemetry-task-off",
    category: "privacy",
    title: "Disable Compatibility Appraiser task",
    description:
      "Disables the scheduled task that scans installed software and reports compatibility data to Microsoft.",
    recommended: true,
    // try/catch: Disable-ScheduledTask treats "task not found" as terminating
    // and surfaces a non-zero exit even with -ErrorAction SilentlyContinue.
    // Win11 25H2 removed this task entirely; absence already achieves the goal.
    apply: [{ kind: "shell", script: "try { Disable-ScheduledTask -TaskName 'Microsoft Compatibility Appraiser' -TaskPath '\\Microsoft\\Windows\\Application Experience\\' -ErrorAction Stop | Out-Null } catch { }; exit 0" }],
    revert: [{ kind: "shell", script: "try { Enable-ScheduledTask -TaskName 'Microsoft Compatibility Appraiser' -TaskPath '\\Microsoft\\Windows\\Application Experience\\' -ErrorAction Stop | Out-Null } catch { }; exit 0" }],
    check: [
      {
        // Missing task on Win11 25H2+ counts as "goal achieved" — Microsoft
        // already removed the privacy threat from the image.
        kind: "shell",
        script:
          "$t = Get-ScheduledTask -TaskName 'Microsoft Compatibility Appraiser' -TaskPath '\\Microsoft\\Windows\\Application Experience\\' -ErrorAction SilentlyContinue; if (-not $t -or $t.State -eq 'Disabled') { exit 0 } else { exit 1 }",
      },
    ],
  },
  {
    id: "program-data-updater-off",
    category: "privacy",
    title: "Disable ProgramDataUpdater task",
    description:
      "Disables the Application Experience task that updates AIT (Application Impact Telemetry) data.",
    apply: [{ kind: "shell", script: "try { Disable-ScheduledTask -TaskName 'ProgramDataUpdater' -TaskPath '\\Microsoft\\Windows\\Application Experience\\' -ErrorAction Stop | Out-Null } catch { }; exit 0" }],
    revert: [{ kind: "shell", script: "try { Enable-ScheduledTask -TaskName 'ProgramDataUpdater' -TaskPath '\\Microsoft\\Windows\\Application Experience\\' -ErrorAction Stop | Out-Null } catch { }; exit 0" }],
    check: [
      {
        kind: "shell",
        script:
          "$t = Get-ScheduledTask -TaskName 'ProgramDataUpdater' -TaskPath '\\Microsoft\\Windows\\Application Experience\\' -ErrorAction SilentlyContinue; if (-not $t -or $t.State -eq 'Disabled') { exit 0 } else { exit 1 }",
      },
    ],
  },
  {
    id: "clipboard-history-off",
    category: "privacy",
    title: "Disable clipboard history",
    description: "Turns off Windows' local clipboard history (Win+V). Independent from cloud sync.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Clipboard", name: "EnableClipboardHistory", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Clipboard", name: "EnableClipboardHistory", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "app-launch-tracking-off",
    category: "privacy",
    title: "Disable app launch tracking",
    description:
      "Stops Windows from tracking which apps you launch (used to populate Start's 'Most used').",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "Start_TrackProgs", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "Start_TrackProgs", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "handwriting-data-sharing-off",
    category: "privacy",
    title: "Disable handwriting data sharing",
    description: "Disables Tablet PC handwriting error reporting.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Policies\\Microsoft\\Windows\\TabletPC", name: "PreventHandwritingErrorReports", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "limit-diagnostic-log-collection",
    category: "privacy",
    title: "Limit diagnostic log collection",
    description:
      "Caps the diagnostic log payload Windows can collect. Pairs with the telemetry level — this gate exists even when 'Required diagnostic data' is the lowest level you can pick.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: policiesData, name: "LimitDiagnosticLogCollection", type: "DWORD", value: 1, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: policiesData, name: "LimitDiagnosticLogCollection", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "limit-dump-collection",
    category: "privacy",
    title: "Limit crash dump collection",
    description:
      "Stops Microsoft from receiving full memory or kernel dumps when something crashes. Local dumps in %LocalAppData%\\CrashDumps still work.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: policiesData, name: "LimitDumpCollection", type: "DWORD", value: 1, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: policiesData, name: "LimitDumpCollection", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "feedback-notifications-policy-off",
    category: "privacy",
    title: "Block feedback notifications (policy)",
    description:
      "Group-policy enforced version of the feedback-prompt block. Suppresses 'How satisfied are you?' toasts even after a feature update resets the per-user keys.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\DataCollection", name: "DoNotShowFeedbackNotifications", type: "DWORD", value: 1, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\DataCollection", name: "DoNotShowFeedbackNotifications", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "lock-screen-camera-off",
    category: "privacy",
    title: "Disable lock-screen camera",
    description:
      "Stops the camera from being usable on the lock screen — protects against drive-by activation while the PC is unattended.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\Personalization", name: "NoLockScreenCamera", type: "DWORD", value: 1, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\Personalization", name: "NoLockScreenCamera", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "lock-screen-slideshow-off",
    category: "privacy",
    title: "Disable lock-screen slideshow",
    description:
      "Prevents the lock screen from running a slideshow of your pictures — quieter, less I/O, and pictures stay off the lock screen.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\Personalization", name: "NoLockScreenSlideshow", type: "DWORD", value: 1, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\Personalization", name: "NoLockScreenSlideshow", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "hide-account-on-signin",
    category: "privacy",
    title: "Hide account details on sign-in screen",
    description:
      "Hides your email address (and other account info) on the Windows sign-in screen. Useful for shoulder-surfing protection.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\System", name: "BlockUserFromShowingAccountDetailsOnSignin", type: "DWORD", value: 1, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\System", name: "BlockUserFromShowingAccountDetailsOnSignin", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "block-microsoft-accounts",
    category: "privacy",
    title: "Block adding Microsoft accounts",
    description:
      "Stops Windows from letting users add new Microsoft accounts. Existing accounts that are already signed in keep working.",
    warning:
      "If your current Windows session is signed in with a Microsoft account, leave this off — only enable it on machines that should stay on local accounts only.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", name: "NoConnectedUser", type: "DWORD", value: 3, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", name: "NoConnectedUser", type: "DWORD", value: 3 },
    ],
  },
  {
    id: "mdns-off",
    category: "privacy",
    title: "Network: disable mDNS multicast",
    description:
      "Stops Windows from advertising itself via multicast DNS on local networks. Reduces background chatter and the surface for LAN-side discovery.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows NT\\DNSClient", name: "EnableMulticast", type: "DWORD", value: 0, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows NT\\DNSClient", name: "EnableMulticast", type: "DWORD", value: 0 },
    ],
    requiresRestart: "system",
  },
  {
    id: "llmnr-off",
    category: "privacy",
    title: "Network: disable LLMNR",
    description:
      "Turns off Link-Local Multicast Name Resolution — a classic hardening move. LLMNR is widely abused for credential theft (Responder-style attacks) and is rarely needed on modern networks.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows NT\\DNSClient", name: "EnableMulticastNameResolution", type: "DWORD", value: 0, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows NT\\DNSClient", name: "EnableMulticastNameResolution", type: "DWORD", value: 0 },
    ],
    requiresRestart: "system",
  },
  {
    id: "minimize-connections",
    category: "privacy",
    title: "Network: prefer single connection",
    description:
      "Tells the Windows Connection Manager to stop auto-connecting to additional networks (e.g. open Wi-Fi) while already connected. Cuts down on opportunistic side-channels.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\WcmSvc\\GroupPolicy", name: "fMinimizeConnections", type: "DWORD", value: 1, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\WcmSvc\\GroupPolicy", name: "fMinimizeConnections", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "wpad-off",
    category: "privacy",
    title: "Network: disable WPAD",
    description:
      "Disables Web Proxy Auto-Discovery. WPAD is a long-standing source of LAN-side proxy hijacks. Only enable if your network genuinely requires automatic proxy detection.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Wpad", name: "WpadOverride", type: "DWORD", value: 1, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Wpad", name: "WpadOverride", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "nearby-share-off",
    category: "privacy",
    title: "Disable Nearby Sharing",
    description:
      "Stops the Windows Connected Devices Platform from advertising your PC to nearby Bluetooth + Wi-Fi devices. Closes a low-traffic but always-on discovery channel.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\CDP", name: "CdpSessionUserAuthzPolicy", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\CDP", name: "NearShareChannelUserAuthzPolicy", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\CDP", name: "RomeSdkChannelUserAuthzPolicy", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\CDP", name: "NearShareChannelUserAuthzPolicy", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "office-content-download-off",
    category: "privacy",
    title: "Block Office cloud content downloads",
    description:
      "Stops Office (Word / Excel / PowerPoint / Outlook) from downloading templates, icons, fonts and other content from Microsoft's online services. Affects the whole Office 2016+ family.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Policies\\Microsoft\\Office\\16.0\\Common\\Internet", name: "UseOnlineContent", type: "DWORD", value: 0, defaultValue: 2 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Policies\\Microsoft\\Office\\16.0\\Common\\Internet", name: "UseOnlineContent", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "spotlight-lockscreen-off",
    category: "privacy",
    title: "Disable Windows Spotlight on lock screen",
    description:
      "Stops the lock screen from fetching Bing rotating wallpapers and 'Did you know?' overlays from Microsoft. Falls back to a static image you pick. Complements the desktop spotlight toggle.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\CloudContent", name: "DisableWindowsSpotlightOnLockScreen", type: "DWORD", value: 1, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\CloudContent", name: "DisableWindowsSpotlightOnLockScreen", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "store-auto-update-off",
    category: "privacy",
    title: "Block Microsoft Store auto-updates",
    description:
      "Stops the Store from silently updating installed UWP apps in the background. You can still update manually from the Store UI when you want.",
    warning:
      "UWP apps will drift out of date — re-enable periodically or update from the Store manually.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\WindowsStore", name: "AutoDownload", type: "DWORD", value: 2, defaultValue: 4 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\WindowsStore", name: "AutoDownload", type: "DWORD", value: 2 },
    ],
  },
];

export const AI_TWEAKS: Tweak[] = [
  {
    id: "copilot-off",
    category: "ai",
    title: "Disable Windows Copilot",
    description:
      "Removes Copilot from the taskbar and disables the integration system-wide (user policy + taskbar icon).",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsCopilot",
        name: "TurnOffWindowsCopilot",
        type: "DWORD",
        value: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "ShowCopilotButton",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsCopilot",
        name: "TurnOffWindowsCopilot",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "recall-off",
    category: "ai",
    title: "Disable Windows Recall",
    description:
      "Stops Recall from taking AI snapshots of your screen (Copilot+ PC feature).",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsAI",
        name: "DisableAIDataAnalysis",
        type: "DWORD",
        value: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsAI",
        name: "DisableAIDataAnalysis",
        type: "DWORD",
        value: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsAI",
        name: "DisableAIDataAnalysis",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "click-to-do-off",
    category: "ai",
    title: "Disable Click to Do",
    description: "Blocks the AI actions triggered when clicking on screenshots.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsAI",
        name: "DisableClickToDo",
        type: "DWORD",
        value: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsAI",
        name: "DisableClickToDo",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "edge-ai-off",
    category: "ai",
    title: "Disable Edge AI features",
    description: "Turns off Copilot in Edge, the Bing sidebar and hub hover cards.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Edge",
        name: "HubsSidebarEnabled",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Edge",
        name: "ShowMicrosoftRewards",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "notepad-copilot-off",
    category: "ai",
    title: "Disable Notepad AI features",
    description: "Removes Copilot suggestions from Notepad and the Store recommendation banner.",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Notepad",
        name: "ShowStoreRecommendation",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Notepad",
        name: "IsCopilotAvailable",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Notepad",
        name: "EnableAIFeatures",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "paint-cocreator-off",
    category: "ai",
    title: "Disable Paint Cocreator",
    description: "Disables the AI image-generation features inside Microsoft Paint.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\Paint", name: "DisableCocreator", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "photos-generative-erase-off",
    category: "ai",
    title: "Disable Photos generative erase",
    description: "Hides the generative erase / AI fill tool in the Photos app.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\Photos", name: "DisableGenerativeErase", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "windows-ai-policy-off",
    category: "ai",
    title: "Disable Windows AI data analysis (policy)",
    description:
      "Sets the umbrella WindowsAI policy that gates Recall, semantic indexing, and other on-device AI features.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\WindowsAI", name: "DisableAIDataAnalysis", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "edge-hub-sidebar-off",
    category: "ai",
    title: "Disable Edge Hub sidebar (Bing chat)",
    description: "Hides the Bing Chat / Discover sidebar inside Edge.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Edge", name: "HubsSidebarEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "office-ai-feedback-off",
    category: "ai",
    title: "Disable Office connected experiences feedback",
    description:
      "Reduces the diagnostic data Office sends to Microsoft and turns off AI-driven cloud feedback experiences.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Office\\Common\\ClientTelemetry", name: "DisableTelemetry", type: "DWORD", value: 1, defaultValue: 0 },
      { kind: "reg", hive: "HKCU", path: "Software\\Policies\\Microsoft\\Office\\16.0\\Common", name: "SendCustomerData", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
];

export const SEARCH_TWEAKS: Tweak[] = [
  {
    id: "bing-search-off",
    category: "search",
    title: "Disable Bing search in Start",
    description: "Local search will no longer show Bing web suggestions.",
    recommended: true,
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Policies\\Microsoft\\Windows\\Explorer",
        name: "DisableSearchBoxSuggestions",
        type: "DWORD",
        value: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: searchKey,
        name: "BingSearchEnabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Policies\\Microsoft\\Windows\\Explorer",
        name: "DisableSearchBoxSuggestions",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "cortana-off",
    category: "search",
    title: "Disable Cortana",
    description: "Prevents Cortana search and voice services from running.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\Windows Search",
        name: "AllowCortana",
        type: "DWORD",
        value: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\Windows Search",
        name: "AllowCortana",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "web-search-off",
    category: "search",
    title: "Disable web search",
    description: "Local results only — no web round trip when searching.",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: searchKey,
        name: "CortanaConsent",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\Windows Search",
        name: "ConnectedSearchUseWeb",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "search-highlights-off",
    category: "search",
    title: "Disable search highlights",
    description: "Removes the animated icons and trending topics from the search box.",
    recommended: true,
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\Feeds\\DSB",
        name: "ShowDynamicContent",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Dsh",
        name: "AllowNewsAndInterests",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "safe-search-off",
    category: "search",
    title: "Disable SafeSearch",
    description: "Turns off the SafeSearch filter for Windows Search results.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings", name: "SafeSearchMode", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "search-history-off",
    category: "search",
    title: "Disable search history on this device",
    description: "Stops Windows Search from storing your previous queries locally.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings", name: "IsDeviceSearchHistoryEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "msa-cloud-search-off",
    category: "search",
    title: "Disable Microsoft account cloud search",
    description:
      "Disables search results from your Microsoft account (Outlook mail, OneDrive files, …) inside Start search.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings", name: "IsMSACloudSearchEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "aad-cloud-search-off",
    category: "search",
    title: "Disable work/school cloud search",
    description:
      "Disables search results from your Entra ID (Azure AD) account in Start search.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings", name: "IsAADCloudSearchEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "start-recent-docs-off",
    category: "search",
    title: "Hide recent documents in Start search",
    description:
      "Stops Start from showing recently opened documents under search results and the Start menu.",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "Start_TrackDocs", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
];

export const EXPLORER_TWEAKS: Tweak[] = [
  {
    id: "show-file-extensions",
    category: "explorer",
    title: "Show file extensions",
    description: "Displays file extensions for known file types.",
    recommended: true,
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "HideFileExt",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "HideFileExt",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "show-hidden-files",
    category: "explorer",
    title: "Show hidden files",
    description: "Makes hidden and system files visible in File Explorer.",
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "Hidden",
        type: "DWORD",
        value: 1,
        defaultValue: 2,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "Hidden",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "classic-context-menu",
    category: "explorer",
    title: "Classic context menu (Windows 10 style)",
    description:
      "Restores the full right-click menu — no more 'Show more options' indirection.",
    recommended: true,
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32",
        name: "",
        type: "SZ",
        value: "",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Remove-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}' -Recurse -Force -ErrorAction SilentlyContinue",
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32",
        name: "",
        type: "SZ",
        value: "",
      },
    ],
  },
  {
    id: "hide-gallery",
    category: "explorer",
    title: "Hide Gallery from Explorer",
    description: "Removes the 'Gallery' entry from File Explorer's sidebar.",
    requiresRestart: "explorer",
    apply: [
      {
        kind: "shell",
        script:
          "Remove-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{e88865ea-0e1c-4e20-9aa6-edcd0212c87c}' -Recurse -Force -ErrorAction SilentlyContinue; New-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{e88865ea-0e1c-4e20-9aa6-edcd0212c87c}' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\CLSID\\{e88865ea-0e1c-4e20-9aa6-edcd0212c87c}' -Name 'System.IsPinnedToNameSpaceTree' -Value 0 -Type DWord",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Remove-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{e88865ea-0e1c-4e20-9aa6-edcd0212c87c}' -Recurse -Force -ErrorAction SilentlyContinue",
      },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Classes\\CLSID\\{e88865ea-0e1c-4e20-9aa6-edcd0212c87c}", name: "System.IsPinnedToNameSpaceTree", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "hide-home",
    category: "explorer",
    title: "Hide Home from Explorer",
    description: "Removes the 'Home' entry from File Explorer's sidebar.",
    requiresRestart: "explorer",
    apply: [
      {
        kind: "shell",
        script:
          "New-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{f874310e-b6b7-47dc-bc84-b9e6b38f5903}' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\CLSID\\{f874310e-b6b7-47dc-bc84-b9e6b38f5903}' -Name 'System.IsPinnedToNameSpaceTree' -Value 0 -Type DWord",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Remove-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{f874310e-b6b7-47dc-bc84-b9e6b38f5903}' -Recurse -Force -ErrorAction SilentlyContinue",
      },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Classes\\CLSID\\{f874310e-b6b7-47dc-bc84-b9e6b38f5903}", name: "System.IsPinnedToNameSpaceTree", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "launch-this-pc",
    category: "explorer",
    title: "Open Explorer to 'This PC'",
    description: "Explorer opens 'This PC' instead of Quick Access / Home.",
    recommended: true,
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "LaunchTo",
        type: "DWORD",
        value: 1,
        defaultValue: 2,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "LaunchTo",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "long-paths-enable",
    category: "explorer",
    title: "Enable long path support",
    description:
      "Removes the legacy 260-character path limit so you can work with deeply nested folders.",
    requiresRestart: "system",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "SYSTEM\\CurrentControlSet\\Control\\FileSystem",
        name: "LongPathsEnabled",
        type: "DWORD",
        value: 1,
        defaultValue: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "SYSTEM\\CurrentControlSet\\Control\\FileSystem",
        name: "LongPathsEnabled",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "show-full-path-title",
    category: "explorer",
    title: "Show full path in title bar",
    description: "Explorer window title shows the full folder path, not just the leaf name.",
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\CabinetState",
        name: "FullPath",
        type: "DWORD",
        value: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\CabinetState",
        name: "FullPath",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "compact-mode-explorer",
    category: "explorer",
    title: "Enable Explorer compact mode",
    description: "Reduces row spacing in File Explorer for a denser layout.",
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "UseCompactMode", type: "DWORD", value: 1, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "UseCompactMode", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "no-shortcut-suffix",
    category: "explorer",
    title: "Disable '- Shortcut' suffix",
    description: "Removes the '- Shortcut' suffix when creating new shortcuts.",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "link", type: "DWORD", value: 0, defaultValue: 0x1F },
    ],
  },
  {
    id: "show-drive-letters-first",
    category: "explorer",
    title: "Show drive letters before drive names",
    description: "Reverses the Win11 default — drive letter appears before the volume label.",
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer", name: "ShowDriveLettersFirst", type: "DWORD", value: 4, defaultValue: 0 },
    ],
  },
  {
    id: "nav-expand-to-current-folder",
    category: "explorer",
    title: "Expand navigation pane to current folder",
    description: "Auto-expands the left navigation tree to follow the open folder.",
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "NavPaneExpandToCurrentFolder", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "nav-show-all-folders",
    category: "explorer",
    title: "Show all folders in navigation pane",
    description: "Shows desktop, Control Panel, and Recycle Bin in the navigation pane.",
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "NavPaneShowAllFolders", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "confirm-file-delete",
    category: "explorer",
    title: "Re-enable delete confirmation dialog",
    description:
      "Windows 11 hides the 'Are you sure you want to delete' prompt by default. This brings it back.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer", name: "ConfirmFileDelete", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "restore-folder-windows",
    category: "explorer",
    title: "Restore Explorer windows on logon",
    description: "Re-opens previously open Explorer windows after a reboot.",
    requiresRestart: "logon",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "PersistBrowsers", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "verbose-status-messages",
    category: "explorer",
    title: "Enable verbose status messages",
    description: "Shows detailed shutdown/startup messages (useful for diagnosing slow boots).",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", name: "VerboseStatus", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "hide-quick-access-pinned",
    category: "explorer",
    title: "Hide pinned + recent in Quick Access",
    description: "Removes pinned items and recent files from the Quick Access view.",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "ShowFrequent", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "ShowRecent", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "thumbcache-network-off",
    category: "explorer",
    title: "Disable thumbnail caching on network folders",
    description: "Stops Windows from creating thumbs.db cache files on mapped/UNC drives.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer", name: "DisableThumbsDBOnNetworkFolders", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "hide-start-recommended-section",
    category: "explorer",
    title: "Hide Start menu 'Recommended' section",
    description:
      "Removes the recently-added apps + recent files row at the bottom of the Win11 Start menu. Pure-pinned-apps layout — quieter and faster.",
    recommended: true,
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\Explorer", name: "HideRecommendedSection", type: "DWORD", value: 1, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\Explorer", name: "HideRecommendedSection", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "balloon-tips-off",
    category: "explorer",
    title: "Disable balloon tips",
    description:
      "Stops Explorer from popping the small 'tip' balloons over icons and taskbar items (the ones that used to suggest pinning Edge or trying out Microsoft 365).",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "EnableBalloonTips", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "EnableBalloonTips", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "explorer-checkboxes-on",
    category: "explorer",
    title: "Enable file checkboxes in Explorer",
    description:
      "Shows a checkbox next to each file/folder on hover so multi-select works with single clicks (handy on laptops without a precise touchpad).",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "AutoCheckSelect", type: "DWORD", value: 1, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "AutoCheckSelect", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "search-app-background-off",
    category: "explorer",
    title: "Disable Search app background tracking",
    description:
      "Stops the Windows Search app from running its background discovery + ranking tasks while you're not using search. Saves a small amount of CPU on idle.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Search", name: "BackgroundAppGlobalToggle", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Search", name: "BackgroundAppGlobalToggle", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "restart-apps-on-signin-off",
    category: "explorer",
    title: "Don't auto-restart apps after sign-in",
    description:
      "Disables the Windows 11 'restore my apps on sign-in' feature that re-launches whatever was open when you signed out. Fewer surprise windows on boot.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "RestartApps", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "RestartApps", type: "DWORD", value: 0 },
    ],
  },
];

export const TASKBAR_TWEAKS: Tweak[] = [
  {
    id: "taskbar-align-left",
    category: "taskbar",
    title: "Align taskbar to the left",
    description: "Classic Windows 10 layout — Start menu and icons on the left.",
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "TaskbarAl",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "TaskbarAl",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "hide-widgets",
    category: "taskbar",
    title: "Hide widgets",
    description: "Removes the weather / news widget from the taskbar.",
    recommended: true,
    requiresRestart: "explorer",
    // Win11 25H2 LOCKED the legacy HKCU\Software\Microsoft\Windows\
    // CurrentVersion\Explorer\Advanced!TaskbarDa value — reg.exe and PS both
    // get ERROR_ACCESS_DENIED there. The modern (and now only) reliable
    // mechanism is the Dsh HKLM policy. Side effect: this tweak now requires
    // admin where it used to be user-local.
    apply: [
      { kind: "reg", hive: "HKLM", path: "SOFTWARE\\Policies\\Microsoft\\Dsh", name: "AllowNewsAndInterests", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SOFTWARE\\Policies\\Microsoft\\Dsh", name: "AllowNewsAndInterests", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "hide-task-view",
    category: "taskbar",
    title: "Hide Task View button",
    description: "Removes the Task View / Desktops icon from the taskbar.",
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "ShowTaskViewButton",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "ShowTaskViewButton",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "hide-chat",
    category: "taskbar",
    title: "Hide Chat / Teams icon",
    description: "Removes the Meet Now / Teams chat icon from the taskbar.",
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "TaskbarMn",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "TaskbarMn", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "hide-sponsored-recommendations",
    category: "taskbar",
    title: "Hide sponsored Start recommendations",
    description: "Stops the Start menu from showing app ads and sponsored content.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "SubscribedContent-338388Enabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "SubscribedContent-338389Enabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "SubscribedContent-353698Enabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "SystemPaneSuggestionsEnabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "ContentDeliveryAllowed",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "OemPreInstalledAppsEnabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "PreInstalledAppsEnabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "SilentInstalledAppsEnabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "SubscribedContent-338388Enabled",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "lockscreen-tips-off",
    category: "taskbar",
    title: "Disable lock screen tips & ads",
    description: "Removes 'tips, tricks and suggestions' from the lock screen.",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "RotatingLockScreenEnabled",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "RotatingLockScreenOverlayEnabled",
        type: "DWORD",
        value: 0,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: cdmKey,
        name: "SubscribedContent-338387Enabled",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "show-seconds-clock",
    category: "taskbar",
    title: "Show seconds in taskbar clock",
    description: "Displays seconds on the system clock — Win11 hidden feature.",
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "ShowSecondsInSystemClock",
        type: "DWORD",
        value: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "ShowSecondsInSystemClock",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "hide-recently-added",
    category: "taskbar",
    title: "Hide recently added apps in Start",
    description: "Stops the Start menu from highlighting newly installed apps.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\Explorer",
        name: "HideRecentlyAddedApps",
        type: "DWORD",
        value: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\Explorer",
        name: "HideRecentlyAddedApps",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "taskbar-end-task",
    category: "taskbar",
    title: "Enable 'End task' in taskbar right-click",
    description: "Adds the developer 'End task' option to the taskbar context menu (Win11).",
    requiresRestart: "explorer",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\TaskbarDeveloperSettings",
        name: "TaskbarEndTask",
        type: "DWORD",
        value: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\TaskbarDeveloperSettings",
        name: "TaskbarEndTask",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "hide-most-used",
    category: "taskbar",
    title: "Hide most-used apps in Start",
    description: "Stops the Start menu from showing frequently launched apps.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\Explorer",
        name: "HideFrequentlyUsedApps",
        type: "DWORD",
        value: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\Explorer",
        name: "HideFrequentlyUsedApps",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "taskbar-combine-when-full",
    category: "taskbar",
    title: "Combine taskbar buttons only when full",
    description:
      "Shows separate buttons for each window until the taskbar fills up — then groups them.",
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "TaskbarGlomLevel", type: "DWORD", value: 1, defaultValue: 0 },
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "MMTaskbarGlomLevel", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "taskbar-mode-small",
    category: "taskbar",
    title: "Smaller taskbar height",
    description: "Sets the taskbar to small mode (less vertical space, smaller icons).",
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "TaskbarSi", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "hide-search-box",
    category: "taskbar",
    title: "Hide taskbar search box",
    description: "Removes the search box / icon from the taskbar entirely.",
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKCU", path: searchKey, name: "SearchboxTaskbarMode", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: searchKey, name: "SearchboxTaskbarMode", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "hide-tray-people",
    category: "taskbar",
    title: "Hide People button (legacy)",
    description: "Hides the People icon in the system tray — only relevant on older builds.",
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv + "\\People", name: "PeopleBand", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "taskbar-mm-current-monitor",
    category: "taskbar",
    title: "Multi-monitor: show button only on active monitor",
    description:
      "On multi-monitor setups, shows each window's taskbar button only on the monitor that hosts it.",
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "MMTaskbarMode", type: "DWORD", value: 2, defaultValue: 0 },
    ],
  },
  {
    id: "taskbar-primary-monitor-only",
    category: "taskbar",
    title: "Show taskbar only on primary monitor",
    description: "Disables the taskbar on secondary monitors entirely.",
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "MMTaskbarEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "no-recent-docs-history",
    category: "taskbar",
    title: "Disable recent docs in jump lists",
    description:
      "Stops Windows from remembering recently opened documents in app jump lists and the taskbar.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer", name: "NoRecentDocsHistory", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "tray-overflow-show-all",
    category: "taskbar",
    title: "Always show all tray icons",
    description: "Removes the 'overflow' arrow — every running tray icon is shown.",
    requiresRestart: "explorer",
    apply: [
      { kind: "reg", hive: "HKCU", path: explorerAdv, name: "EnableAutoTray", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
];

export const UPDATE_TWEAKS: Tweak[] = [
  {
    id: "defer-feature-updates",
    category: "updates",
    title: "Defer feature updates",
    description: "Delays large Windows feature updates by 365 days.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate",
        name: "DeferFeatureUpdates",
        type: "DWORD",
        value: 1,
      },
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate",
        name: "DeferFeatureUpdatesPeriodInDays",
        type: "DWORD",
        value: 365,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate",
        name: "DeferFeatureUpdates",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "no-auto-restart",
    category: "updates",
    title: "No automatic restarts",
    description: "Windows won't auto-reboot when a user is signed in.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU",
        name: "NoAutoRebootWithLoggedOnUsers",
        type: "DWORD",
        value: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU",
        name: "NoAutoRebootWithLoggedOnUsers",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "delivery-optimization-off",
    category: "updates",
    title: "Disable Delivery Optimization",
    description: "Stops Windows from sharing update bits peer-to-peer with other PCs.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\DeliveryOptimization",
        name: "DODownloadMode",
        type: "DWORD",
        value: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\DeliveryOptimization",
        name: "DODownloadMode",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "exclude-drivers-from-wu",
    category: "updates",
    title: "Exclude drivers from Windows Update",
    description:
      "Stops Windows Update from offering driver updates. Lets you keep manually selected vendor drivers.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate", name: "ExcludeWUDriversInQualityUpdate", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "active-hours-extended",
    category: "updates",
    title: "Extend active hours (6–23)",
    description:
      "Disables auto-activity-hours detection and sets active hours from 06:00 to 23:00 so Windows won't restart for updates during that window.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Microsoft\\WindowsUpdate\\UX\\Settings", name: "SmartActiveHoursState", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKLM", path: "Software\\Microsoft\\WindowsUpdate\\UX\\Settings", name: "ActiveHoursStart", type: "DWORD", value: 6, defaultValue: 8 },
      { kind: "reg", hive: "HKLM", path: "Software\\Microsoft\\WindowsUpdate\\UX\\Settings", name: "ActiveHoursEnd", type: "DWORD", value: 23, defaultValue: 17 },
    ],
  },
  {
    id: "notify-before-download",
    category: "updates",
    title: "Notify before download",
    description: "Asks before Windows Update downloads new packages instead of doing it automatically.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", name: "AUOptions", type: "DWORD", value: 2, defaultValue: 4 },
    ],
  },
  {
    id: "preview-builds-off",
    category: "updates",
    title: "Block Insider Preview builds",
    description: "Prevents Windows from receiving Insider/Preview channel builds.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\PreviewBuilds", name: "AllowBuildPreview", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "auto-restart-presentation-off",
    category: "updates",
    title: "Block restart during presentation mode",
    description:
      "Prevents auto-restart for updates while a presentation is active (full-screen apps, video calls).",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", name: "NoAutoRebootWithLoggedOnUsers", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "no-restart-notifications",
    category: "updates",
    title: "Suppress restart notifications",
    description:
      "Silences the 'your PC will restart for updates' toasts and reminders. Pairs well with 'No automatic restarts' so Windows stays quiet until you reboot.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", name: "SetAutoRestartNotificationDisable", type: "DWORD", value: 1, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", name: "SetAutoRestartNotificationDisable", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "lock-wu-ui",
    category: "updates",
    title: "Lock Windows Update settings UI",
    description:
      "Hides the 'check for updates' button and disables the Pause/Resume controls in Settings. Useful on shared machines where you don't want anyone undoing the configured update policy.",
    warning:
      "After enabling, Settings > Windows Update is mostly view-only. Disable this first if you ever need to use the UI to install updates manually.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate", name: "SetDisableUXWUAccess", type: "DWORD", value: 1, deleteOnRevert: true },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\WindowsUpdate", name: "SetDisableUXWUAccess", type: "DWORD", value: 1 },
    ],
  },
];

const ACCESSIBILITY_STICKY = "Control Panel\\Accessibility\\StickyKeys";
const ACCESSIBILITY_TOGGLE = "Control Panel\\Accessibility\\ToggleKeys";
const ACCESSIBILITY_FILTER = "Control Panel\\Accessibility\\Keyboard Response";

export const PERFORMANCE_TWEAKS: Tweak[] = [
  {
    id: "sticky-keys-prompt-off",
    category: "performance",
    title: "Disable Sticky Keys 5x Shift prompt",
    description:
      "Stops Windows from popping a dialog when you hit Shift five times. Sticky Keys itself stays available.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: ACCESSIBILITY_STICKY,
        name: "Flags",
        type: "SZ",
        value: "506",
        defaultValue: "510",
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: ACCESSIBILITY_STICKY,
        name: "Flags",
        type: "SZ",
        value: "506",
      },
    ],
  },
  {
    id: "toggle-keys-prompt-off",
    category: "performance",
    title: "Disable Toggle Keys prompt",
    description: "Stops the prompt when you hold Num Lock for 5 seconds.",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: ACCESSIBILITY_TOGGLE,
        name: "Flags",
        type: "SZ",
        value: "58",
        defaultValue: "62",
      },
    ],
  },
  {
    id: "filter-keys-prompt-off",
    category: "performance",
    title: "Disable Filter Keys prompt",
    description: "Stops the prompt when you hold the right Shift key for 8 seconds.",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: ACCESSIBILITY_FILTER,
        name: "Flags",
        type: "SZ",
        value: "122",
        defaultValue: "126",
      },
    ],
  },
  {
    id: "background-apps-off",
    category: "performance",
    title: "Disable background apps",
    description:
      "Stops UWP apps from running in the background unless explicitly opened.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications",
        name: "GlobalUserDisabled",
        type: "DWORD",
        value: 1,
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\Search",
        name: "BackgroundAppGlobalToggle",
        type: "DWORD",
        value: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications",
        name: "GlobalUserDisabled",
        type: "DWORD",
        value: 1,
      },
    ],
  },
  {
    id: "storage-sense-off",
    category: "performance",
    title: "Disable Storage Sense",
    description:
      "Stops Windows from auto-deleting files and emptying the Recycle Bin on its own.",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\StorageSense",
        name: "AllowStorageSenseGlobal",
        type: "DWORD",
        value: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\StorageSense",
        name: "AllowStorageSenseGlobal",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "fast-startup-off",
    category: "performance",
    title: "Disable Fast Startup",
    description:
      "Forces a real cold boot. Recommended for dual-boot setups and after driver issues.",
    requiresRestart: "system",
    apply: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power",
        name: "HiberbootEnabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKLM",
        path: "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power",
        name: "HiberbootEnabled",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "game-dvr-off",
    category: "performance",
    title: "Disable Game DVR",
    description:
      "Stops Game Bar from recording in the background — frees CPU/GPU during gaming.",
    recommended: true,
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "System\\GameConfigStore",
        name: "GameDVR_Enabled",
        type: "DWORD",
        value: 0,
        defaultValue: 1,
      },
      {
        kind: "reg",
        hive: "HKLM",
        path: "Software\\Policies\\Microsoft\\Windows\\GameDVR",
        name: "AllowGameDVR",
        type: "DWORD",
        value: 0,
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "System\\GameConfigStore",
        name: "GameDVR_Enabled",
        type: "DWORD",
        value: 0,
      },
    ],
  },
  {
    id: "mouse-accel-off",
    category: "performance",
    title: "Disable mouse acceleration",
    description:
      "Removes Windows' pointer-precision enhancement so mouse movement is 1:1.",
    requiresRestart: "logon",
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Control Panel\\Mouse",
        name: "MouseSpeed",
        type: "SZ",
        value: "0",
        defaultValue: "1",
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: "Control Panel\\Mouse",
        name: "MouseThreshold1",
        type: "SZ",
        value: "0",
        defaultValue: "6",
      },
      {
        kind: "reg",
        hive: "HKCU",
        path: "Control Panel\\Mouse",
        name: "MouseThreshold2",
        type: "SZ",
        value: "0",
        defaultValue: "10",
      },
    ],
    check: [
      {
        kind: "reg",
        hive: "HKCU",
        path: "Control Panel\\Mouse",
        name: "MouseSpeed",
        type: "SZ",
        value: "0",
      },
    ],
  },
  {
    id: "diagtrack-service-off",
    category: "performance",
    title: "Disable DiagTrack service",
    description:
      "Stops and disables Microsoft's diagnostic telemetry service. Belt-and-braces with the telemetry policy.",
    warning: "Some IT-management tools depend on DiagTrack — re-enable if your employer uses them.",
    apply: [
      {
        kind: "shell",
        script:
          "$ErrorActionPreference='SilentlyContinue'; Stop-Service -Name DiagTrack -Force; Set-Service -Name DiagTrack -StartupType Disabled",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Set-Service -Name DiagTrack -StartupType Automatic; Start-Service -Name DiagTrack",
      },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\DiagTrack", name: "Start", type: "DWORD", value: 4 },
    ],
  },
  {
    id: "diagtrack-tasks-off",
    category: "performance",
    title: "Disable telemetry scheduled tasks",
    description:
      "Disables Microsoft Compatibility Appraiser, Customer Experience and Application Experience tasks.",
    apply: [
      {
        kind: "shell",
        script:
          "$tasks = @('\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser','\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater','\\Microsoft\\Windows\\Application Experience\\StartupAppTask','\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator','\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip','\\Microsoft\\Windows\\Autochk\\Proxy','\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector'); foreach ($t in $tasks) { schtasks /Change /TN $t /Disable 2>$null }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "$tasks = @('\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser','\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater','\\Microsoft\\Windows\\Application Experience\\StartupAppTask','\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator','\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip','\\Microsoft\\Windows\\Autochk\\Proxy','\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector'); foreach ($t in $tasks) { schtasks /Change /TN $t /Enable 2>$null }",
      },
    ],
    check: [
      {
        kind: "shell",
        // Win11 25H2 may have moved/removed some of these tasks. We declare
        // "on" when at least one of the tracked tasks exists AND every
        // existing one is Disabled. Missing tasks count as already-mitigated.
        script:
          "$tasks = @('\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser','\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater','\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator'); $found = 0; foreach ($t in $tasks) { $st = Get-ScheduledTask -TaskPath ([System.IO.Path]::GetDirectoryName($t) + '\\') -TaskName ([System.IO.Path]::GetFileName($t)) -ErrorAction SilentlyContinue; if ($st) { $found++; if ($st.State -ne 'Disabled') { exit 1 } } }; if ($found -eq 0) { exit 1 } else { exit 0 }",
      },
    ],
  },
  {
    id: "hibernation-off",
    category: "performance",
    title: "Disable hibernation",
    description:
      "Removes hiberfil.sys (frees gigabytes of disk space). Also disables Fast Startup as a side-effect.",
    requiresRestart: "system",
    // Hyper-V VMs (and some platforms) refuse `powercfg -h on` because the
    // firmware doesn't advertise hibernation support. Wrap to swallow that
    // platform-side rejection — applying off and reverting on are both
    // best-effort against the firmware's actual capability.
    apply: [{ kind: "shell", script: "$null = powercfg -h off 2>&1; exit 0" }],
    revert: [{ kind: "shell", script: "$null = powercfg -h on 2>&1; exit 0" }],
    check: [
      {
        // HibernateEnabled is set to 0 by `powercfg -h off`. Missing key on
        // platforms where the firmware never supported hibernation (e.g.
        // Hyper-V Gen2 VMs) — that counts as "tweak achieved its goal".
        kind: "shell",
        script:
          "try { $v = (Get-ItemProperty 'HKLM:\\System\\CurrentControlSet\\Control\\Power' -Name HibernateEnabled -ErrorAction Stop).HibernateEnabled; if ($v -eq 0) { exit 0 } else { exit 1 } } catch { exit 0 }",
      },
    ],
  },
  {
    id: "reserved-storage-off",
    category: "performance",
    title: "Disable Reserved Storage",
    description:
      "Frees roughly 7 GB by removing the storage Windows reserves for updates. Updates still install, just without the pre-allocated buffer.",
    recommended: true,
    requiresRestart: "system",
    // DISM /Set-ReservedStorageState can return non-zero exit codes even when
    // the toggle succeeded (e.g. servicing-stack reentrancy "operation in
    // progress" — surfaces 5005/0x800f0805 on second run). We swallow DISM's
    // exit code and judge success by the actual reserved-storage state
    // afterward via the locale-stable PS cmdlet.
    apply: [
      {
        kind: "shell",
        script:
          "$null = DISM /Online /Set-ReservedStorageState /State:Disabled 2>&1; if ((Get-WindowsReservedStorageState -ErrorAction SilentlyContinue).ReservedStorageState -eq 'Disabled') { exit 0 } else { exit 1 }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "$null = DISM /Online /Set-ReservedStorageState /State:Enabled 2>&1; if ((Get-WindowsReservedStorageState -ErrorAction SilentlyContinue).ReservedStorageState -eq 'Enabled') { exit 0 } else { exit 1 }",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "try { if ((Get-WindowsReservedStorageState -ErrorAction Stop).ReservedStorageState -eq 'Disabled') { exit 0 } else { exit 1 } } catch { exit 1 }",
      },
    ],
  },
  {
    id: "ntfs-last-access-off",
    category: "performance",
    title: "Disable NTFS last access timestamp",
    description:
      "Stops NTFS from updating the 'last accessed' timestamp on every file read. Tiny IO win, mostly relevant on HDDs.",
    apply: [{ kind: "shell", script: "fsutil behavior set DisableLastAccess 1 | Out-Null" }],
    revert: [{ kind: "shell", script: "fsutil behavior set DisableLastAccess 2 | Out-Null" }],
    check: [
      {
        // fsutil reports "DisableLastAccess = N (User Disabled, ...)". 1 = on, 2 = off (user default).
        kind: "shell",
        script:
          "$o = fsutil behavior query DisableLastAccess 2>&1 | Out-String; if ($o -match 'DisableLastAccess\\s*=\\s*1') { exit 0 } else { exit 1 }",
      },
    ],
  },
  {
    id: "ssd-scheduled-defrag-off",
    category: "performance",
    title: "Disable scheduled defrag",
    description:
      "Disables the weekly ScheduledDefrag task. Win11 only runs ReTrim on SSDs anyway, but if you prefer manual control.",
    apply: [{ kind: "shell", script: "Disable-ScheduledTask -TaskName 'ScheduledDefrag' -TaskPath '\\Microsoft\\Windows\\Defrag\\' | Out-Null" }],
    revert: [{ kind: "shell", script: "Enable-ScheduledTask -TaskName 'ScheduledDefrag' -TaskPath '\\Microsoft\\Windows\\Defrag\\' | Out-Null" }],
    check: [
      {
        kind: "shell",
        script:
          "$t = Get-ScheduledTask -TaskName 'ScheduledDefrag' -TaskPath '\\Microsoft\\Windows\\Defrag\\' -ErrorAction SilentlyContinue; if ($t -and $t.State -eq 'Disabled') { exit 0 } else { exit 1 }",
      },
    ],
  },
  {
    id: "ipv6-teredo-off",
    category: "performance",
    title: "Disable IPv6 Teredo tunneling",
    description: "Disables the legacy Teredo IPv6-over-IPv4 transition tunnel.",
    apply: [{ kind: "shell", script: "netsh interface teredo set state disabled | Out-Null" }],
    revert: [{ kind: "shell", script: "netsh interface teredo set state default | Out-Null" }],
    check: [
      {
        // Get-NetTeredoConfiguration returns a structured Type enum independent of UI locale.
        kind: "shell",
        script:
          "try { if ((Get-NetTeredoConfiguration -ErrorAction Stop).Type -eq 'Disabled') { exit 0 } else { exit 1 } } catch { exit 1 }",
      },
    ],
  },
  {
    id: "ndu-off",
    category: "performance",
    title: "Disable Network Data Usage driver",
    description: "Disables the NDU service that tracks network usage per app. Reclaims memory.",
    requiresRestart: "system",
    apply: [
      { kind: "reg", hive: "HKLM", path: "System\\CurrentControlSet\\Services\\Ndu", name: "Start", type: "DWORD", value: 4, defaultValue: 2 },
    ],
  },
  {
    id: "power-plan-high-performance",
    category: "performance",
    title: "Activate High Performance power plan",
    description: "Switches the active power plan to High Performance.",
    apply: [{ kind: "shell", script: "powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c | Out-Null" }],
    revert: [{ kind: "shell", script: "powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e | Out-Null" }],
    check: [
      {
        kind: "shell",
        script:
          "$o = powercfg /getactivescheme 2>&1 | Out-String; if ($o -match '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c') { exit 0 } else { exit 1 }",
      },
    ],
  },
  {
    id: "menu-show-delay-zero",
    category: "performance",
    title: "Remove menu show delay",
    description: "Sets the menu show delay from 400ms to 0 — snappier context/start menus.",
    requiresRestart: "logon",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Control Panel\\Desktop", name: "MenuShowDelay", type: "SZ", value: "0", defaultValue: "400" },
    ],
  },
  {
    id: "visual-effects-best-performance",
    category: "performance",
    title: "Visual effects: best performance",
    description:
      "Disables every non-essential visual effect (animations, shadows, smoothing). Best on weak GPUs.",
    requiresRestart: "logon",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects", name: "VisualFXSetting", type: "DWORD", value: 2, defaultValue: 0 },
    ],
  },
  {
    id: "search-indexing-off",
    category: "performance",
    title: "Disable Windows Search indexing service",
    description:
      "Stops the WSearch service. Start search becomes slower for files, but RAM and SSD writes go down.",
    warning: "Start menu file search becomes much slower without indexing.",
    apply: [{ kind: "shell", script: "Set-Service -Name 'WSearch' -StartupType Disabled; Stop-Service -Name 'WSearch' -Force -ErrorAction SilentlyContinue" }],
    revert: [{ kind: "shell", script: "Set-Service -Name 'WSearch' -StartupType Automatic; Start-Service -Name 'WSearch' -ErrorAction SilentlyContinue" }],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\WSearch", name: "Start", type: "DWORD", value: 4 },
    ],
  },
  {
    id: "maps-broker-off",
    category: "performance",
    title: "Disable MapsBroker service",
    description:
      "Stops the 'Downloaded Maps Manager' service that downloads + updates offline maps for the built-in Maps app. Useless unless you actively use the Maps UWP app.",
    recommended: true,
    apply: [
      {
        kind: "shell",
        script:
          "Set-Service -Name 'MapsBroker' -StartupType Disabled -ErrorAction SilentlyContinue; Stop-Service -Name 'MapsBroker' -Force -ErrorAction SilentlyContinue",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Set-Service -Name 'MapsBroker' -StartupType Manual -ErrorAction SilentlyContinue",
      },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\MapsBroker", name: "Start", type: "DWORD", value: 4 },
    ],
  },
  {
    id: "retail-demo-off",
    category: "performance",
    title: "Disable RetailDemo service",
    description:
      "Stops the Retail Demo service used by store-display PCs to reset themselves. Has no purpose on a normal user system.",
    recommended: true,
    apply: [
      {
        kind: "shell",
        script:
          "Set-Service -Name 'RetailDemo' -StartupType Disabled -ErrorAction SilentlyContinue; Stop-Service -Name 'RetailDemo' -Force -ErrorAction SilentlyContinue",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Set-Service -Name 'RetailDemo' -StartupType Manual -ErrorAction SilentlyContinue",
      },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\RetailDemo", name: "Start", type: "DWORD", value: 4 },
    ],
  },
  {
    id: "xbox-services-off",
    category: "performance",
    title: "Disable Xbox Live services",
    description:
      "Stops the three Xbox Live services (XblAuthManager / XblGameSave / XboxNetApiSvc). Useless unless you use Xbox Game Pass, Xbox cloud saves or play Microsoft Store-signed multiplayer titles. The accessory service (XboxGipSvc) is left alone so controllers keep working.",
    warning:
      "Microsoft Store games that gate on Xbox sign-in (some Game Pass titles) will refuse to launch until you revert.",
    apply: [
      {
        kind: "shell",
        script:
          "@('XblAuthManager','XblGameSave','XboxNetApiSvc') | ForEach-Object { Set-Service -Name $_ -StartupType Disabled -ErrorAction SilentlyContinue; Stop-Service -Name $_ -Force -ErrorAction SilentlyContinue }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "@('XblAuthManager','XblGameSave','XboxNetApiSvc') | ForEach-Object { Set-Service -Name $_ -StartupType Manual -ErrorAction SilentlyContinue }",
      },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\XblAuthManager", name: "Start", type: "DWORD", value: 4 },
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\XblGameSave", name: "Start", type: "DWORD", value: 4 },
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\XboxNetApiSvc", name: "Start", type: "DWORD", value: 4 },
    ],
  },
  {
    id: "wmp-network-sharing-off",
    category: "performance",
    title: "Disable Windows Media Player network sharing",
    description:
      "Stops the WMP Network Sharing Service (WMPNetworkSvc) that advertises your media library to UPnP / DLNA devices on your LAN. Useless unless you stream from WMP to a TV.",
    recommended: true,
    apply: [
      {
        kind: "shell",
        script:
          "Set-Service -Name 'WMPNetworkSvc' -StartupType Disabled -ErrorAction SilentlyContinue; Stop-Service -Name 'WMPNetworkSvc' -Force -ErrorAction SilentlyContinue",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Set-Service -Name 'WMPNetworkSvc' -StartupType Manual -ErrorAction SilentlyContinue",
      },
    ],
    check: [
      // Service is optional in modern Win11 (removed by some editions). When
      // the service key is absent, treat the tweak as already-achieved (the
      // service that the tweak targets doesn't exist on this system).
      {
        kind: "shell",
        script:
          "$svc = Get-Service -Name 'WMPNetworkSvc' -ErrorAction SilentlyContinue; if (-not $svc -or $svc.StartType -eq 'Disabled') { exit 0 } else { exit 1 }",
      },
    ],
  },
  {
    id: "dmwap-push-off",
    category: "performance",
    title: "Disable WAP Push Message routing service",
    description:
      "Disables dmwappushservice — the Device Management Wireless Application Protocol push routing service that ferries enterprise MDM messages from cellular networks. Pointless on non-managed desktops; also feeds the telemetry pipeline.",
    apply: [
      {
        kind: "shell",
        script:
          "Set-Service -Name 'dmwappushservice' -StartupType Disabled -ErrorAction SilentlyContinue; Stop-Service -Name 'dmwappushservice' -Force -ErrorAction SilentlyContinue",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Set-Service -Name 'dmwappushservice' -StartupType Manual -ErrorAction SilentlyContinue",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$svc = Get-Service -Name 'dmwappushservice' -ErrorAction SilentlyContinue; if (-not $svc -or $svc.StartType -eq 'Disabled') { exit 0 } else { exit 1 }",
      },
    ],
  },
];

const pushNotifKey = "Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications";
const notifSettingsKey = "Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings";

export const NOTIFICATION_TWEAKS: Tweak[] = [
  {
    id: "toast-notifications-off",
    category: "notifications",
    title: "Disable all toast notifications",
    description: "Globally disables Windows toast notifications. Tray icons still work.",
    apply: [
      { kind: "reg", hive: "HKCU", path: pushNotifKey, name: "ToastEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: pushNotifKey, name: "ToastEnabled", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "notification-sounds-off",
    category: "notifications",
    title: "Disable notification sounds",
    description: "Mutes the audible chime that accompanies notifications.",
    apply: [
      { kind: "reg", hive: "HKCU", path: notifSettingsKey, name: "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "lock-screen-notifications-off",
    category: "notifications",
    title: "Disable notifications on lock screen",
    description: "Stops notifications from appearing while the device is locked.",
    apply: [
      { kind: "reg", hive: "HKCU", path: notifSettingsKey, name: "NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "tips-tricks-off",
    category: "notifications",
    title: "Disable Windows tips & suggestions",
    description: "Stops 'Get tips, tricks, and suggestions' toasts about Windows features.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKCU", path: cdmKey, name: "SubscribedContent-338389Enabled", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKCU", path: cdmKey, name: "SoftLandingEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "welcome-experience-off",
    category: "notifications",
    title: "Disable Welcome experience",
    description: "Disables the 'Welcome to Windows / Let's finish setting up' walkthrough screens.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKCU", path: cdmKey, name: "SubscribedContent-310093Enabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "finish-setup-suggestions-off",
    category: "notifications",
    title: "Disable 'Finish setting up your PC' prompts",
    description: "Disables the post-update 'finish setting up' suggestions.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\UserProfileEngagement", name: "ScoobeSystemSettingEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "app-suggestions-start-off",
    category: "notifications",
    title: "Disable app suggestions in Start",
    description: "Removes promoted Store apps from the Start menu.",
    apply: [
      { kind: "reg", hive: "HKCU", path: cdmKey, name: "SubscribedContent-338388Enabled", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKCU", path: cdmKey, name: "SubscribedContent-338387Enabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "defender-notifications-off",
    category: "notifications",
    title: "Hide Defender summary notifications",
    description:
      "Hides Defender's periodic summary toasts. Active threat alerts still appear.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows Defender Security Center\\Notifications", name: "DisableEnhancedNotifications", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "startup-impact-toast-off",
    category: "notifications",
    title: "Hide 'Apps slowing startup' toast",
    description:
      "Stops Windows from popping the periodic 'Some apps are slowing down your startup' toast that suggests you disable startup entries. The startup-apps page is still accessible from Task Manager.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer", name: "StartupNotify", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer", name: "StartupNotify", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "low-disk-warning-off",
    category: "notifications",
    title: "Disable low disk space warnings",
    description:
      "Suppresses the 'You're running out of space on Drive X' system-tray warnings. Watch your disk usage manually instead — useful for people who deliberately run drives near full.",
    warning:
      "You will not be warned when a drive nears 100 % full. Keep an eye on disk free space yourself.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer", name: "NoLowDiskSpaceChecks", type: "DWORD", value: 1, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer", name: "NoLowDiskSpaceChecks", type: "DWORD", value: 1 },
    ],
  },
];

const edgePolicy = "Software\\Policies\\Microsoft\\Edge";

export const BROWSER_TWEAKS: Tweak[] = [
  {
    id: "edge-first-run-skip",
    category: "browser",
    title: "Skip Edge first-run experience",
    description:
      "Skips the Edge onboarding wizard, sign-in prompts, and import-from-other-browser nags on first launch.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "HideFirstRunExperience", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "edge-bing-suggestions-off",
    category: "browser",
    title: "Disable Bing in the Edge address bar",
    description: "Stops Edge from showing Bing search suggestions and Bing rich answers in the address bar.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "AddressBarMicrosoftSearchInBingProviderEnabled", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "SearchSuggestEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "edge-background-mode-off",
    category: "browser",
    title: "Don't run Edge in the background",
    description:
      "Stops the 'Continue running background apps when Microsoft Edge is closed' behavior. Frees RAM and stops background telemetry.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "BackgroundModeEnabled", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "StartupBoostEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "edge-shopping-off",
    category: "browser",
    title: "Disable Edge shopping assistant",
    description: "Hides the shopping assistant, price comparison, coupon detector, and discount notifications.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "EdgeShoppingAssistantEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "edge-wallet-off",
    category: "browser",
    title: "Disable Edge wallet & crypto",
    description:
      "Turns off the built-in payments / address autofill nag, the Microsoft Wallet, and the integrated crypto wallet.",
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "WalletDonationEnabled", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "CryptoWalletEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "edge-discover-off",
    category: "browser",
    title: "Disable the Discover button",
    description: "Removes the Bing 'Discover' / Copilot pill in the upper-right of every Edge page.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "DiscoverPageContextEnabled", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "CopilotPageContext", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "edge-ntp-clean",
    category: "browser",
    title: "Clean up the New Tab page",
    description:
      "Disables MSN news feed, Bing 'quick links', sponsored content tiles, and the background-image picker on the New Tab page.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "NewTabPageContentEnabled", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "NewTabPageQuickLinksEnabled", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "NewTabPageAllowedBackgroundTypes", type: "DWORD", value: 3, defaultValue: 0 },
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "ShowRecommendationsEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "edge-rewards-off",
    category: "browser",
    title: "Hide Microsoft Rewards in Edge",
    description: "Removes the Rewards button from Edge and stops the related background syncing.",
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "ShowMicrosoftRewards", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "edge-signin-optional",
    category: "browser",
    title: "Make Edge sign-in optional",
    description:
      "Stops Edge from forcing a Microsoft Account sign-in on first launch. You can still sign in manually if you want to sync.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "BrowserSignin", type: "DWORD", value: 1, defaultValue: 2 },
    ],
  },
  {
    id: "edge-do-not-track",
    category: "browser",
    title: "Send Do Not Track header",
    description: "Configures Edge to send the 'Do Not Track' header on every request. Cosmetic on most sites but harmless.",
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "ConfigureDoNotTrack", type: "DWORD", value: 1, defaultValue: 0 },
    ],
  },
  {
    id: "edge-personalization-off",
    category: "browser",
    title: "Disable Edge personalization reporting",
    description:
      "Stops Edge from reporting browsing/site usage data to Microsoft for personalization and advertising.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "PersonalizationReportingEnabled", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "DiagnosticData", type: "DWORD", value: 0, defaultValue: 2 },
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "EdgeCollectionsEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "edge-default-nag-off",
    category: "browser",
    title: "Stop the 'Make Edge default' nag",
    description: "Suppresses the periodic Edge banner asking you to make Edge your default browser.",
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "DefaultBrowserSettingEnabled", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
  {
    id: "edge-pinning-wizard-off",
    category: "browser",
    title: "Disable the 'install this site as an app' wizard",
    description: "Hides the persistent Edge pop-up suggesting you install the current website as a desktop app.",
    apply: [
      { kind: "reg", hive: "HKLM", path: edgePolicy, name: "PinningWizardAllowed", type: "DWORD", value: 0, defaultValue: 1 },
    ],
  },
];

const asrRoot = "Software\\Policies\\Microsoft\\Windows Defender\\Windows Defender Exploit Guard\\ASR";
const asrRulesPath = `${asrRoot}\\Rules`;

function asrRule(args: {
  id: string;
  guid: string;
  title: string;
  description: string;
  recommended?: boolean;
  warning?: string;
}): Tweak {
  const guid = args.guid.toLowerCase();
  return {
    id: args.id,
    category: "security",
    title: args.title,
    description: args.description,
    recommended: args.recommended,
    warning: args.warning,
    // Master ExploitGuard_ASR_Rules uses defaultValue=1 so auto-revert
    // leaves it enabled — other ASR rules still need it. The per-rule
    // GUID falls back to "0" (= rule disabled) on revert.
    apply: [
      { kind: "reg", hive: "HKLM", path: asrRoot, name: "ExploitGuard_ASR_Rules", type: "DWORD", value: 1, defaultValue: 1 },
      { kind: "reg", hive: "HKLM", path: asrRulesPath, name: guid, type: "SZ", value: "1", defaultValue: "0" },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: asrRulesPath, name: guid, type: "SZ", value: "1" },
    ],
  };
}

export const SECURITY_TWEAKS: Tweak[] = [
  {
    id: "lsa-protection-on",
    category: "security",
    title: "Enable LSA Protection (RunAsPPL)",
    description:
      "Marks lsass.exe as a Protected Process Light so non-protected processes cannot read its memory. Blocks credential-dumping tools like Mimikatz.",
    recommended: true,
    requiresRestart: "system",
    warning:
      "Some older drivers or third-party security/AV software refuse to load alongside PPL lsass and will fail silently. If something stops working after the next boot, revert this.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\Lsa", name: "RunAsPPL", type: "DWORD", value: 1, defaultValue: 0 },
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\Lsa", name: "RunAsPPLBoot", type: "DWORD", value: 1, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\Lsa", name: "RunAsPPL", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "controlled-folder-access-on",
    category: "security",
    title: "Enable Controlled Folder Access",
    description:
      "Defender's ransomware shield. Only trusted apps may write to protected folders (Documents, Pictures, etc.). Blocks unknown processes from encrypting your data.",
    warning:
      "Legitimate apps that touch protected folders (games saving to Documents, backup tools, syncing clients) may get blocked until you whitelist them in Defender > Ransomware protection > Allow an app.",
    apply: [
      { kind: "shell", script: "Set-MpPreference -EnableControlledFolderAccess Enabled" },
    ],
    revert: [
      { kind: "shell", script: "Set-MpPreference -EnableControlledFolderAccess Disabled" },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$v = (Get-MpPreference -ErrorAction SilentlyContinue).EnableControlledFolderAccess; if ($v -eq 1) { exit 0 } else { exit 1 }",
      },
    ],
  },
  asrRule({
    id: "asr-block-email-executable-content",
    guid: "BE9BA2D9-53EA-4CDC-84E5-9B1EEEE46550",
    title: "ASR: Block executable content from email + webmail",
    description:
      "Blocks .exe/.scr/.js etc. when they're opened straight out of an email client or downloaded from webmail. Low compatibility risk.",
    recommended: true,
  }),
  asrRule({
    id: "asr-block-office-child-processes",
    guid: "D4F940AB-401B-4EFC-AADC-AD5F3C50688A",
    title: "ASR: Block Office apps from creating child processes",
    description:
      "Stops Word/Excel/PowerPoint from spawning cmd, powershell, mshta, etc. Single best macro-malware brake.",
    recommended: true,
    warning: "Will block legitimate macros that shell out to PowerShell or cmd.",
  }),
  asrRule({
    id: "asr-block-office-executable-content",
    guid: "3B576869-A4EC-4529-8536-B80A7769E899",
    title: "ASR: Block Office apps from creating executable content",
    description:
      "Office can no longer write .exe/.dll/.scr files to disk. Stops dropper-style macros that stage a binary in %TEMP%.",
    recommended: true,
  }),
  asrRule({
    id: "asr-block-office-code-injection",
    guid: "75668C1F-73B5-4CF0-BB93-3ECF5CB7CC84",
    title: "ASR: Block Office apps from injecting into other processes",
    description:
      "Blocks Office processes from injecting code into other running processes. Defeats a common bypass for the child-process rule.",
    recommended: true,
  }),
  asrRule({
    id: "asr-block-js-vbs-downloads",
    guid: "D3E037E1-3EB8-44C8-A917-57927947596D",
    title: "ASR: Block JS/VBS from launching downloaded executables",
    description:
      "Stops JavaScript and VBScript from launching .exe content they fetched from the internet — common HTA / .js dropper pattern.",
    recommended: true,
  }),
  asrRule({
    id: "asr-block-obfuscated-scripts",
    guid: "5BEB7EFE-FD9A-4556-801D-275E5FFC04CC",
    title: "ASR: Block execution of obfuscated scripts",
    description:
      "Heuristic block on heavily obfuscated PowerShell/JS/VBS. Mostly catches red-team / commodity malware.",
    warning: "Can occasionally false-positive on legitimate minified or packed scripts.",
  }),
  asrRule({
    id: "asr-block-win32-from-office-macro",
    guid: "92E97FA1-2EDF-4476-BDD6-9DD0B4DDDC7B",
    title: "ASR: Block Win32 API calls from Office macros",
    description:
      "VBA macros can no longer call into the Win32 API (Declare statements). Closes one of the oldest macro-to-shellcode paths.",
    recommended: true,
  }),
  asrRule({
    id: "asr-block-untrusted-executables",
    guid: "01443614-CD74-433A-B99E-2ECDC07BFC25",
    title: "ASR: Block untrusted executables (prevalence/age/trust)",
    description:
      "Blocks .exe files unless they're prevalent, old enough, or on Defender's trust list. Strong protection — also breaks niche / new / self-built tools.",
    warning:
      "High compatibility risk. New installers, freshly built dev tools, niche utilities, portable apps — anything Defender hasn't seen often will be blocked.",
  }),
  asrRule({
    id: "asr-block-ransomware",
    guid: "C1DB55AB-C21A-4637-BB3F-A12568109D35",
    title: "ASR: Use advanced ransomware protection",
    description:
      "Defender's ML-based ransomware behavior block. Low false-positive rate.",
    recommended: true,
  }),
  asrRule({
    id: "asr-block-lsass-credential-stealing",
    guid: "9E6C4E1F-7D60-472F-BA1A-A39EF669E4B2",
    title: "ASR: Block credential stealing from lsass.exe",
    description:
      "Blocks processes from opening a handle to lsass with read-memory rights. Complements LSA Protection above.",
    recommended: true,
    warning: "Some endpoint monitoring / EDR / password manager helpers legitimately touch lsass — they may break.",
  }),
  asrRule({
    id: "asr-block-psexec-wmi",
    guid: "D1E49AAC-8F56-4280-B9BA-993A6D77406C",
    title: "ASR: Block process creations from PsExec + WMI",
    description:
      "Blocks remote process creation via PsExec or WMI. Standard lateral-movement vector for ransomware crews.",
    warning:
      "Breaks legitimate remote administration via PsExec / Invoke-WmiMethod. Don't enable on machines you manage with these tools.",
  }),
  asrRule({
    id: "asr-block-usb-untrusted",
    guid: "B2B3F03D-6A65-4F7B-A9C7-1C7EF74A9BA4",
    title: "ASR: Block untrusted/unsigned processes from USB",
    description:
      "Stops unsigned executables on removable media from running. Cheap protection against autorun-style attacks.",
    recommended: true,
  }),
  asrRule({
    id: "asr-block-office-comms-child",
    guid: "26190899-1602-49E8-8B27-EB1D0A1CE869",
    title: "ASR: Block Outlook from creating child processes",
    description:
      "Same idea as the Office child-process rule, but specifically for Outlook + Skype/Teams clients. Stops a popular phishing kill chain.",
    recommended: true,
  }),
  asrRule({
    id: "asr-block-adobe-reader-child",
    guid: "7674BA52-37EB-4A4F-A9A1-F0F9A1619A2C",
    title: "ASR: Block Adobe Reader from creating child processes",
    description:
      "Adobe Reader can no longer spawn other processes. Defeats malicious-PDF kill chains.",
    recommended: true,
  }),
  asrRule({
    id: "asr-block-wmi-persistence",
    guid: "E6DB77E5-3DF2-4CF1-B95A-636979351E5B",
    title: "ASR: Block persistence through WMI event subscription",
    description:
      "Blocks malware from installing WMI permanent event consumers — a stealthy persistence mechanism.",
    recommended: true,
  }),
  asrRule({
    id: "asr-block-vulnerable-signed-drivers",
    guid: "56A863A9-875E-4185-98A7-B882C64B5CE5",
    title: "ASR: Block abuse of vulnerable signed drivers",
    description:
      "Blocks known-vulnerable signed drivers from loading. Defeats 'bring-your-own-driver' kernel attacks.",
    warning: "May block some legitimate kernel-level tools (older anti-cheat, hardware monitoring) that rely on outdated signed drivers.",
  }),
  {
    id: "smb1-off",
    category: "security",
    title: "Disable SMB1 protocol (server + client)",
    description:
      "Disables the SMB version 1 file-sharing protocol on both server (incoming) and client (outgoing) ends. SMB1 is the protocol that WannaCry and NotPetya weaponized — Microsoft has been removing it by default since 2019. On Win11 24H2 it's already gone; this tweak is idempotent.",
    recommended: true,
    check: [
      {
        // On Win11 24H2+ SMB1 is already removed at the image level. We
        // declare "on" when the optional feature is Disabled OR absent AND
        // the server config disables SMB1. Either condition alone is enough
        // because Microsoft can ship images where the feature is removed.
        kind: "shell",
        script:
          "$feat = Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction SilentlyContinue; $srv = Get-SmbServerConfiguration -ErrorAction SilentlyContinue; $featOk = (-not $feat) -or ($feat.State -ne 'Enabled'); $srvOk = (-not $srv) -or (-not $srv.EnableSMB1Protocol); if ($featOk -and $srvOk) { exit 0 } else { exit 1 }",
      },
    ],
    apply: [
      {
        kind: "shell",
        script:
          "Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force -ErrorAction SilentlyContinue; Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart -ErrorAction SilentlyContinue | Out-Null",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Set-SmbServerConfiguration -EnableSMB1Protocol $true -Force -ErrorAction SilentlyContinue; Enable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart -All -ErrorAction SilentlyContinue | Out-Null",
      },
    ],
  },
  {
    id: "remote-assistance-off",
    category: "security",
    title: "Disable Remote Assistance",
    description:
      "Blocks incoming Remote Assistance requests entirely. Closes one of the older built-in remote-control surfaces.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\Remote Assistance", name: "fAllowToGetHelp", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\Remote Assistance", name: "fAllowToGetHelp", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "remote-desktop-off",
    category: "security",
    title: "Disable Remote Desktop",
    description:
      "Sets fDenyTSConnections=1, blocking incoming RDP sessions. Recommended on personal machines that never need to be reached remotely.",
    recommended: true,
    warning:
      "If you actually use RDP to reach this PC, leave this off — there is no other way in once disabled.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\Terminal Server", name: "fDenyTSConnections", type: "DWORD", value: 1, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\Terminal Server", name: "fDenyTSConnections", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "netbios-off",
    category: "security",
    title: "Disable NetBIOS over TCP/IP",
    description:
      "Sets NetbiosOptions=2 on every TCP/IP adapter. Disables the legacy NetBIOS name-resolution layer (NBT-NS) that's a known credential-spoofing vector on hostile LANs (Responder, Inveigh, etc.).",
    warning:
      "Breaks legacy file shares that rely on NetBIOS browser names instead of DNS / mDNS. Modern Windows shares use SMB-over-DNS and are unaffected.",
    apply: [
      {
        kind: "shell",
        script:
          "Get-ChildItem -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces' | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name NetbiosOptions -Value 2 -Type DWord -Force -ErrorAction SilentlyContinue }",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$ifaces = Get-ChildItem -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces' -ErrorAction SilentlyContinue; if (-not $ifaces) { exit 1 }; foreach ($i in $ifaces) { $v = (Get-ItemProperty -Path $i.PSPath -Name NetbiosOptions -ErrorAction SilentlyContinue).NetbiosOptions; if ($v -ne 2) { exit 1 } }; exit 0",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Get-ChildItem -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces' | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name NetbiosOptions -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue }",
      },
    ],
  },
];

const memMgmt = "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management";
const prefetchParams = `${memMgmt}\\PrefetchParameters`;

export const MEMORY_TWEAKS: Tweak[] = [
  {
    id: "memory-compression-off",
    category: "memory",
    title: "Disable RAM compression",
    description:
      "Stops Windows from compressing in-memory pages before paging them out. On systems with 16+ GB RAM this trims a small amount of CPU overhead at the cost of slightly more disk paging.",
    warning:
      "Do not disable on machines with less than 8 GB RAM — paging overhead will spike. Compression is a net win on most modern systems; only flip this off if you have measured a benefit.",
    // Disable-MMAgent / Enable-MMAgent talk to the PS_MMAgent WMI provider
    // that lives inside the SysMain service. If `sysmain-off` was applied
    // first, the cmdlet errors out with "Windows System Error 1058 — service
    // disabled". Both apply and revert temporarily start SysMain to talk to
    // the provider, then restore SysMain's previous startup state.
    apply: [
      {
        kind: "shell",
        script:
          "$svc = Get-Service -Name SysMain -ErrorAction SilentlyContinue; $wasDisabled = $svc -and ($svc.StartType -eq 'Disabled'); if ($wasDisabled) { Set-Service -Name SysMain -StartupType Manual; Start-Service -Name SysMain -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }; try { Disable-MMAgent -MemoryCompression } finally { if ($wasDisabled) { Stop-Service -Name SysMain -Force -ErrorAction SilentlyContinue; Set-Service -Name SysMain -StartupType Disabled } }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "$svc = Get-Service -Name SysMain -ErrorAction SilentlyContinue; $wasDisabled = $svc -and ($svc.StartType -eq 'Disabled'); if ($wasDisabled) { Set-Service -Name SysMain -StartupType Manual; Start-Service -Name SysMain -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }; try { Enable-MMAgent -MemoryCompression } finally { if ($wasDisabled) { Stop-Service -Name SysMain -Force -ErrorAction SilentlyContinue; Set-Service -Name SysMain -StartupType Disabled } }",
      },
    ],
    check: [
      {
        // Get-MMAgent also needs SysMain running; same trick for the probe.
        kind: "shell",
        script:
          "$svc = Get-Service -Name SysMain -ErrorAction SilentlyContinue; $wasDisabled = $svc -and ($svc.StartType -eq 'Disabled'); if ($wasDisabled) { Set-Service -Name SysMain -StartupType Manual; Start-Service -Name SysMain -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }; $on = $false; try { $on = (Get-MMAgent -ErrorAction Stop).MemoryCompression -eq $false } catch { } finally { if ($wasDisabled) { Stop-Service -Name SysMain -Force -ErrorAction SilentlyContinue; Set-Service -Name SysMain -StartupType Disabled } }; if ($on) { exit 0 } else { exit 1 }",
      },
    ],
  },
  {
    id: "sysmain-off",
    category: "memory",
    title: "Disable SysMain (Superfetch)",
    description:
      "Stops the SysMain service that pre-loads frequently used apps into RAM. On SSDs and NVMe drives SysMain provides no measurable benefit and wastes background I/O.",
    recommended: true,
    warning:
      "Re-enable if you boot from a spinning HDD — SysMain measurably speeds up app launches on slow disks.",
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\SysMain", name: "Start", type: "DWORD", value: 4 },
    ],
    apply: [
      {
        kind: "shell",
        script:
          "Set-Service -Name SysMain -StartupType Disabled -ErrorAction SilentlyContinue; Stop-Service -Name SysMain -Force -ErrorAction SilentlyContinue",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Set-Service -Name SysMain -StartupType Automatic -ErrorAction SilentlyContinue; Start-Service -Name SysMain -ErrorAction SilentlyContinue",
      },
    ],
  },
  {
    id: "prefetch-off",
    category: "memory",
    title: "Disable Prefetch and Superfetch hints",
    description:
      "Turns off the kernel's Prefetch and Superfetch boot/app hint files (.pf in C:\\Windows\\Prefetch). Complements disabling SysMain — same idea, different layer. Saves a few MB and a tiny amount of background I/O.",
    apply: [
      { kind: "reg", hive: "HKLM", path: prefetchParams, name: "EnablePrefetcher", type: "DWORD", value: 0, defaultValue: 3 },
      { kind: "reg", hive: "HKLM", path: prefetchParams, name: "EnableSuperfetch", type: "DWORD", value: 0, defaultValue: 3 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: prefetchParams, name: "EnablePrefetcher", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "page-combining-on",
    category: "memory",
    title: "Enable RAM page combining",
    description:
      "Re-enables the kernel's page combining feature (dedupes identical RAM pages, saves a few percent of RAM on busy systems). On by default on Windows 11 Pro and Home — only use this if someone has previously disabled it.",
    // Same SysMain-dependency trick as memory-compression-off.
    apply: [
      {
        kind: "shell",
        script:
          "$svc = Get-Service -Name SysMain -ErrorAction SilentlyContinue; $wasDisabled = $svc -and ($svc.StartType -eq 'Disabled'); if ($wasDisabled) { Set-Service -Name SysMain -StartupType Manual; Start-Service -Name SysMain -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }; try { Enable-MMAgent -PageCombining } finally { if ($wasDisabled) { Stop-Service -Name SysMain -Force -ErrorAction SilentlyContinue; Set-Service -Name SysMain -StartupType Disabled } }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "$svc = Get-Service -Name SysMain -ErrorAction SilentlyContinue; $wasDisabled = $svc -and ($svc.StartType -eq 'Disabled'); if ($wasDisabled) { Set-Service -Name SysMain -StartupType Manual; Start-Service -Name SysMain -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }; try { Disable-MMAgent -PageCombining } finally { if ($wasDisabled) { Stop-Service -Name SysMain -Force -ErrorAction SilentlyContinue; Set-Service -Name SysMain -StartupType Disabled } }",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$svc = Get-Service -Name SysMain -ErrorAction SilentlyContinue; $wasDisabled = $svc -and ($svc.StartType -eq 'Disabled'); if ($wasDisabled) { Set-Service -Name SysMain -StartupType Manual; Start-Service -Name SysMain -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }; $on = $false; try { $on = (Get-MMAgent -ErrorAction Stop).PageCombining -eq $true } catch { } finally { if ($wasDisabled) { Stop-Service -Name SysMain -Force -ErrorAction SilentlyContinue; Set-Service -Name SysMain -StartupType Disabled } }; if ($on) { exit 0 } else { exit 1 }",
      },
    ],
  },
  {
    id: "clear-pagefile-shutdown-on",
    category: "memory",
    title: "Clear pagefile on shutdown",
    description:
      "Wipes pagefile.sys when the system shuts down so swapped-out application data (passwords, decrypted documents, session tokens) doesn't survive to the next boot. Security trade-off — adds 30 s to several minutes of shutdown time depending on pagefile size.",
    warning:
      "Significantly slows down shutdown. Only worth it on shared / mobile machines where someone could pull the disk after power-off.",
    apply: [
      { kind: "reg", hive: "HKLM", path: memMgmt, name: "ClearPageFileAtShutdown", type: "DWORD", value: 1, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: memMgmt, name: "ClearPageFileAtShutdown", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "paging-executive-off",
    category: "memory",
    title: "Keep kernel resident in RAM (disable paging executive)",
    description:
      "Sets DisablePagingExecutive=1, telling the memory manager never to page out kernel-mode drivers or kernel data structures to pagefile.sys. Slightly snappier under memory pressure on RAM-rich systems.",
    requiresRestart: "system",
    warning:
      "Only worth it on systems with 16 GB+ RAM that rarely hit memory pressure. On low-RAM systems it just wastes the headroom the pager would have used.",
    apply: [
      { kind: "reg", hive: "HKLM", path: memMgmt, name: "DisablePagingExecutive", type: "DWORD", value: 1, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: memMgmt, name: "DisablePagingExecutive", type: "DWORD", value: 1 },
    ],
  },
];

const mmSysProfile = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile";
const mmGamesTask = `${mmSysProfile}\\Tasks\\Games`;
const priorityControl = "SYSTEM\\CurrentControlSet\\Control\\PriorityControl";

export const GAMING_TWEAKS: Tweak[] = [
  {
    id: "game-mode-on",
    category: "gaming",
    title: "Enable Game Mode",
    description:
      "Asks the scheduler to prioritize the foreground game over background work (Windows Update, indexing, etc.) and stops some notifications during play. On by default — toggle here if you turned it off and want it back.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\GameBar", name: "AutoGameModeEnabled", type: "DWORD", value: 1 },
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\GameBar", name: "AllowAutoGameMode", type: "DWORD", value: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\GameBar", name: "AutoGameModeEnabled", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "system-responsiveness-gaming",
    category: "gaming",
    title: "Reserve all CPU for multimedia / games",
    description:
      "Sets MMCSS SystemResponsiveness to 0, telling Windows to dedicate the full CPU to multimedia/game threads when they're foreground (default reserves 20 % for background work).",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: mmSysProfile, name: "SystemResponsiveness", type: "DWORD", value: 0, defaultValue: 20 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: mmSysProfile, name: "SystemResponsiveness", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "mmcss-gaming-priority",
    category: "gaming",
    title: "Boost MMCSS Games task scheduling",
    description:
      "Raises the priority of the MMCSS 'Games' task profile — higher CPU priority, high scheduling category, high SFIO priority. Applies to anything registered as a game with the Multimedia Class Scheduler.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: mmGamesTask, name: "GPU Priority", type: "DWORD", value: 8, defaultValue: 8 },
      { kind: "reg", hive: "HKLM", path: mmGamesTask, name: "Priority", type: "DWORD", value: 6, defaultValue: 2 },
      { kind: "reg", hive: "HKLM", path: mmGamesTask, name: "Scheduling Category", type: "SZ", value: "High", defaultValue: "Medium" },
      { kind: "reg", hive: "HKLM", path: mmGamesTask, name: "SFIO Priority", type: "SZ", value: "High", defaultValue: "Normal" },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: mmGamesTask, name: "Priority", type: "DWORD", value: 6 },
    ],
  },
  {
    id: "cpu-priority-foreground-boost",
    category: "gaming",
    title: "Strongly favor foreground app for CPU",
    description:
      "Sets Win32PrioritySeparation to 0x26 — short, variable quantum with a 3:1 boost in favor of the foreground process. Default on Win11 Pro is 0x2 (long, fixed quantum, no boost).",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKLM", path: priorityControl, name: "Win32PrioritySeparation", type: "DWORD", value: 0x26, defaultValue: 0x2 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: priorityControl, name: "Win32PrioritySeparation", type: "DWORD", value: 0x26 },
    ],
  },
  {
    id: "foreground-lock-timeout-off",
    category: "gaming",
    title: "Disable foreground-lock timeout",
    description:
      "Stops Windows from blocking apps that try to grab the foreground while you're playing — fixes 'alt-tabbed and the game lost focus permanently' annoyances.",
    recommended: true,
    apply: [
      { kind: "reg", hive: "HKCU", path: "Control Panel\\Desktop", name: "ForegroundLockTimeout", type: "DWORD", value: 0, defaultValue: 0x30D40 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Control Panel\\Desktop", name: "ForegroundLockTimeout", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "network-throttling-off",
    category: "gaming",
    title: "Disable network throttling",
    description:
      "Removes the MMCSS network packet throttle that limits non-multimedia traffic to ~10 packets/ms while multimedia is playing. Improves throughput for game servers + voice chat at the cost of occasional audio glitching under heavy load.",
    warning:
      "Side effect: voice apps may stutter briefly when downloads peak. Revert if you notice voice artifacts.",
    apply: [
      { kind: "reg", hive: "HKLM", path: mmSysProfile, name: "NetworkThrottlingIndex", type: "DWORD", value: 0xffffffff, defaultValue: 10 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: mmSysProfile, name: "NetworkThrottlingIndex", type: "DWORD", value: 0xffffffff },
    ],
  },
  {
    id: "tcp-ack-and-no-delay",
    category: "gaming",
    title: "Low-latency TCP: ACK + NoDelay on all interfaces",
    description:
      "Sets TcpAckFrequency=1 and TCPNoDelay=1 on every TCP/IP interface. Disables Nagle's algorithm and delayed-ACK coalescing so latency-sensitive game packets ship immediately instead of waiting for batching.",
    warning:
      "Increases packet count and slightly raises CPU load on heavy connections. Revert if you see throughput regressions on large transfers.",
    apply: [
      {
        kind: "shell",
        script:
          "Get-ChildItem -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | ForEach-Object { New-ItemProperty -Path $_.PSPath -Name TcpAckFrequency -PropertyType DWord -Value 1 -Force | Out-Null; New-ItemProperty -Path $_.PSPath -Name TCPNoDelay -PropertyType DWord -Value 1 -Force | Out-Null }",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$ifaces = Get-ChildItem -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' -ErrorAction SilentlyContinue; if (-not $ifaces) { exit 1 }; foreach ($i in $ifaces) { $p = Get-ItemProperty -Path $i.PSPath -ErrorAction SilentlyContinue; if ($p.TcpAckFrequency -ne 1 -or $p.TCPNoDelay -ne 1) { exit 1 } }; exit 0",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Get-ChildItem -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name TcpAckFrequency -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name TCPNoDelay -ErrorAction SilentlyContinue }",
      },
    ],
  },
  {
    id: "hpet-off",
    category: "gaming",
    title: "Disable HPET (use platform clock = off)",
    description:
      "Tells the bootloader to skip the High Precision Event Timer. On some hardware (older Intel chipsets, certain Ryzen boards) HPET adds 1-2 % latency vs the platform's invariant TSC. Almost always neutral on modern systems.",
    requiresRestart: "system",
    warning:
      "Boot-time setting — requires a reboot. If a game has stuttering or audio drops after the next boot, revert this. Some motherboards refuse the change at boot and just keep HPET on (no harm done).",
    check: [
      {
        kind: "shell",
        script:
          "$o = bcdedit /enum '{current}' 2>&1 | Out-String; if ($o -match 'useplatformclock\\s+No' -and $o -match 'disabledynamictick\\s+Yes') { exit 0 } else { exit 1 }",
      },
    ],
    apply: [
      {
        kind: "shell",
        script:
          "bcdedit /set useplatformclock false | Out-Null; bcdedit /set disabledynamictick yes | Out-Null; bcdedit /set useplatformtick yes | Out-Null",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "bcdedit /deletevalue useplatformclock | Out-Null; bcdedit /deletevalue disabledynamictick | Out-Null; bcdedit /deletevalue useplatformtick | Out-Null",
      },
    ],
  },
  {
    id: "mouse-hover-time-fast",
    category: "gaming",
    title: "Reduce mouse hover delay to 1 ms",
    description:
      "Tooltips and hover-driven events fire almost instantly instead of waiting the default 400 ms. Mainly noticeable in older apps and taskbar previews.",
    requiresRestart: "logon",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Control Panel\\Mouse", name: "MouseHoverTime", type: "SZ", value: "1", defaultValue: "400" },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Control Panel\\Mouse", name: "MouseHoverTime", type: "SZ", value: "1" },
    ],
  },
  {
    id: "keyboard-delay-fast",
    category: "gaming",
    title: "Minimum keyboard repeat delay",
    description:
      "Sets the time before key-repeat kicks in to the shortest setting (0 ≈ 250 ms, default 1 ≈ 500 ms).",
    requiresRestart: "logon",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Control Panel\\Keyboard", name: "KeyboardDelay", type: "SZ", value: "0", defaultValue: "1" },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Control Panel\\Keyboard", name: "KeyboardDelay", type: "SZ", value: "0" },
    ],
  },
  {
    id: "keyboard-speed-fast",
    category: "gaming",
    title: "Maximum keyboard repeat rate",
    description:
      "Sets the key-repeat rate to the maximum value (31 ≈ 30 characters per second). Default is usually around 20.",
    requiresRestart: "logon",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Control Panel\\Keyboard", name: "KeyboardSpeed", type: "SZ", value: "31", defaultValue: "31" },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Control Panel\\Keyboard", name: "KeyboardSpeed", type: "SZ", value: "31" },
    ],
  },
  {
    id: "usb-selective-suspend-off-global",
    category: "gaming",
    title: "Disable USB selective suspend (system-wide)",
    description:
      "Tells Windows to never power down USB ports to save energy. Fixes occasional mouse/keyboard disconnects under load or after standby.",
    warning:
      "Slightly higher idle power draw on laptops. Revert if you care about battery life.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\USB", name: "DisableSelectiveSuspend", type: "DWORD", value: 1, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\USB", name: "DisableSelectiveSuspend", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "hid-power-management-off",
    category: "gaming",
    title: "Disable power-saving on HID input devices",
    description:
      "Turns off 'Allow the computer to turn off this device to save power' for every HID device (mice, keyboards, gamepads). Stops 1 kHz polling devices from being throttled when the system thinks they're idle.",
    apply: [
      {
        kind: "shell",
        script:
          "Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\HID' -ErrorAction SilentlyContinue | ForEach-Object { Get-ChildItem $_.PSPath -ErrorAction SilentlyContinue | ForEach-Object { $dp = Join-Path $_.PSPath 'Device Parameters'; if (Test-Path $dp) { Set-ItemProperty -Path $dp -Name 'SelectiveSuspendEnabled' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $dp -Name 'EnhancedPowerManagementEnabled' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue } } }",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$bad = 0; $any = 0; Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\HID' -ErrorAction SilentlyContinue | ForEach-Object { Get-ChildItem $_.PSPath -ErrorAction SilentlyContinue | ForEach-Object { $dp = Join-Path $_.PSPath 'Device Parameters'; if (Test-Path $dp) { $any++; $v = (Get-ItemProperty -Path $dp -Name SelectiveSuspendEnabled -ErrorAction SilentlyContinue).SelectiveSuspendEnabled; if ($null -eq $v -or $v -ne 0) { $bad++ } } } }; if ($any -eq 0) { exit 1 } elseif ($bad -eq 0) { exit 0 } else { exit 1 }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\HID' -ErrorAction SilentlyContinue | ForEach-Object { Get-ChildItem $_.PSPath -ErrorAction SilentlyContinue | ForEach-Object { $dp = Join-Path $_.PSPath 'Device Parameters'; if (Test-Path $dp) { Remove-ItemProperty -Path $dp -Name 'SelectiveSuspendEnabled' -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $dp -Name 'EnhancedPowerManagementEnabled' -ErrorAction SilentlyContinue } } }",
      },
    ],
  },
  {
    id: "tcp-delack-ticks-off",
    category: "gaming",
    title: "Zero out TCP delayed-ACK ticks on all interfaces",
    description:
      "Sets TcpDelAckTicks=0 on every TCP/IP interface. Complements the TcpAckFrequency tweak by killing the second ACK-delay timer Windows uses internally.",
    warning:
      "Slightly higher packet count under load. Revert if you see throughput regressions on large file transfers.",
    apply: [
      {
        kind: "shell",
        script:
          "Get-ChildItem -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | ForEach-Object { New-ItemProperty -Path $_.PSPath -Name TcpDelAckTicks -PropertyType DWord -Value 0 -Force | Out-Null }",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$ifaces = Get-ChildItem -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' -ErrorAction SilentlyContinue; if (-not $ifaces) { exit 1 }; foreach ($i in $ifaces) { $p = Get-ItemProperty -Path $i.PSPath -ErrorAction SilentlyContinue; if ($p.TcpDelAckTicks -ne 0) { exit 1 } }; exit 0",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Get-ChildItem -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name TcpDelAckTicks -ErrorAction SilentlyContinue }",
      },
    ],
  },
  {
    id: "qos-reserved-bandwidth-off",
    category: "gaming",
    title: "Disable QoS reserved bandwidth",
    description:
      "Removes the 20 % bandwidth reservation Windows holds back for QoS-marked traffic. Applies even if no QoS-aware app is running.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\Psched", name: "NonBestEffortLimit", type: "DWORD", value: 0, defaultValue: 20 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "Software\\Policies\\Microsoft\\Windows\\Psched", name: "NonBestEffortLimit", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "nic-energy-efficient-ethernet-off",
    category: "gaming",
    title: "Disable Energy-Efficient Ethernet on all NICs",
    description:
      "Turns off IEEE 802.3az (EEE) on every NIC that exposes it. EEE adds ~100–200 µs of wake-up latency on idle links — bad for low-ping gaming, savings irrelevant on a desktop.",
    apply: [
      {
        kind: "shell",
        script:
          "Get-NetAdapterAdvancedProperty -RegistryKeyword '*EEE' -ErrorAction SilentlyContinue | ForEach-Object { Set-NetAdapterAdvancedProperty -Name $_.Name -RegistryKeyword '*EEE' -RegistryValue 0 -NoRestart -ErrorAction SilentlyContinue }",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$p = Get-NetAdapterAdvancedProperty -RegistryKeyword '*EEE' -ErrorAction SilentlyContinue; if (-not $p) { exit 0 }; foreach ($x in $p) { if ($x.RegistryValue -ne 0) { exit 1 } }; exit 0",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Get-NetAdapterAdvancedProperty -RegistryKeyword '*EEE' -ErrorAction SilentlyContinue | ForEach-Object { Reset-NetAdapterAdvancedProperty -Name $_.Name -DisplayName $_.DisplayName -NoRestart -ErrorAction SilentlyContinue }",
      },
    ],
  },
  {
    id: "nic-flow-control-off",
    category: "gaming",
    title: "Disable NIC flow control",
    description:
      "Turns off Ethernet PAUSE frames on every NIC. Flow control can introduce bursty latency under contention; modern switches handle backpressure better anyway.",
    apply: [
      {
        kind: "shell",
        script:
          "Get-NetAdapterAdvancedProperty -RegistryKeyword '*FlowControl' -ErrorAction SilentlyContinue | ForEach-Object { Set-NetAdapterAdvancedProperty -Name $_.Name -RegistryKeyword '*FlowControl' -RegistryValue 0 -NoRestart -ErrorAction SilentlyContinue }",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$p = Get-NetAdapterAdvancedProperty -RegistryKeyword '*FlowControl' -ErrorAction SilentlyContinue; if (-not $p) { exit 0 }; foreach ($x in $p) { if ($x.RegistryValue -ne 0) { exit 1 } }; exit 0",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Get-NetAdapterAdvancedProperty -RegistryKeyword '*FlowControl' -ErrorAction SilentlyContinue | ForEach-Object { Reset-NetAdapterAdvancedProperty -Name $_.Name -DisplayName $_.DisplayName -NoRestart -ErrorAction SilentlyContinue }",
      },
    ],
  },
  {
    id: "nic-interrupt-moderation-off",
    category: "gaming",
    title: "Disable NIC interrupt moderation",
    description:
      "Forces the NIC to interrupt the CPU on every packet instead of batching. Lower per-packet latency, higher CPU load.",
    warning:
      "Noticeably higher CPU usage under heavy network load. Revert if your CPU is the bottleneck or you see system-wide stutter during big downloads.",
    apply: [
      {
        kind: "shell",
        script:
          "Get-NetAdapterAdvancedProperty -RegistryKeyword '*InterruptModeration' -ErrorAction SilentlyContinue | ForEach-Object { Set-NetAdapterAdvancedProperty -Name $_.Name -RegistryKeyword '*InterruptModeration' -RegistryValue 0 -NoRestart -ErrorAction SilentlyContinue }",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$p = Get-NetAdapterAdvancedProperty -RegistryKeyword '*InterruptModeration' -ErrorAction SilentlyContinue; if (-not $p) { exit 0 }; foreach ($x in $p) { if ($x.RegistryValue -ne 0) { exit 1 } }; exit 0",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Get-NetAdapterAdvancedProperty -RegistryKeyword '*InterruptModeration' -ErrorAction SilentlyContinue | ForEach-Object { Reset-NetAdapterAdvancedProperty -Name $_.Name -DisplayName $_.DisplayName -NoRestart -ErrorAction SilentlyContinue }",
      },
    ],
  },
  {
    id: "afd-receive-window-tune",
    category: "gaming",
    title: "AFD: enlarge socket receive/send windows",
    description:
      "Raises the default per-socket buffer (DefaultReceiveWindow / DefaultSendWindow) to 64 KiB. Helps low-latency game sockets avoid stalls under bursty inbound traffic.",
    requiresRestart: "system",
    apply: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\AFD\\Parameters", name: "DefaultReceiveWindow", type: "DWORD", value: 65536, defaultValue: 8192 },
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\AFD\\Parameters", name: "DefaultSendWindow", type: "DWORD", value: 65536, defaultValue: 8192 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\AFD\\Parameters", name: "DefaultReceiveWindow", type: "DWORD", value: 65536 },
    ],
  },
  {
    id: "hags-on",
    category: "gaming",
    title: "Enable Hardware-Accelerated GPU Scheduling (HAGS)",
    description:
      "Moves GPU scheduling onto the GPU's own processor instead of the CPU. Reduces CPU overhead and unlocks features like NVIDIA Reflex and DirectStorage. Requires a recent driver (NVIDIA Pascal+, AMD RDNA+).",
    recommended: true,
    requiresRestart: "system",
    apply: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", name: "HwSchMode", type: "DWORD", value: 2, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", name: "HwSchMode", type: "DWORD", value: 2 },
    ],
  },
  {
    id: "gpu-tdr-delay-extend",
    category: "gaming",
    title: "Extend GPU timeout (TDR) for heavy shader compilation",
    description:
      "Raises TdrDelay/TdrDdiDelay from the 2 s default to 10 s. Prevents 'Display driver stopped responding' crashes during shader-compile spikes in modern games.",
    requiresRestart: "system",
    apply: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", name: "TdrDelay", type: "DWORD", value: 10, defaultValue: 2 },
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", name: "TdrDdiDelay", type: "DWORD", value: 10, defaultValue: 5 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", name: "TdrDelay", type: "DWORD", value: 10 },
    ],
  },
  {
    id: "nvidia-telemetry-services-off",
    category: "gaming",
    title: "Disable NVIDIA telemetry services & tasks",
    description:
      "Stops the NvTelemetryContainer service and the 'NVIDIA Telemetry' scheduled tasks. No-op on non-NVIDIA systems.",
    apply: [
      {
        kind: "shell",
        script:
          "if (Get-Service NvTelemetryContainer -ErrorAction SilentlyContinue) { Stop-Service NvTelemetryContainer -Force -ErrorAction SilentlyContinue; Set-Service NvTelemetryContainer -StartupType Disabled -ErrorAction SilentlyContinue }; Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like '*NVIDIA*' -and ($_.TaskName -like '*Telemetry*' -or $_.TaskName -like '*Report*') } | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$svc = Get-Service NvTelemetryContainer -ErrorAction SilentlyContinue; if ($svc -and $svc.StartType -ne 'Disabled') { exit 1 }; $bad = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like '*NVIDIA*' -and ($_.TaskName -like '*Telemetry*' -or $_.TaskName -like '*Report*') -and $_.State -ne 'Disabled' }; if ($bad) { exit 1 } else { exit 0 }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "if (Get-Service NvTelemetryContainer -ErrorAction SilentlyContinue) { Set-Service NvTelemetryContainer -StartupType Automatic -ErrorAction SilentlyContinue }; Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like '*NVIDIA*' -and ($_.TaskName -like '*Telemetry*' -or $_.TaskName -like '*Report*') } | Enable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null",
      },
    ],
  },
  {
    id: "amd-ueip-off",
    category: "gaming",
    title: "Disable AMD User Experience Program",
    description:
      "Opts out of AMD's User Experience Improvement Program (anonymous telemetry from Adrenalin). No-op on non-AMD systems.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "SOFTWARE\\AMD\\CN", name: "UserExperienceProgram", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SOFTWARE\\AMD\\CN", name: "UserExperienceProgram", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "power-throttling-off-policy",
    category: "gaming",
    title: "Disable per-process Power Throttling",
    description:
      "Tells Windows to never throttle background processes via EcoQoS. Background apps (Discord, browsers, chat clients) keep full clock when they're not foreground — reduces stutter when alt-tabbing.",
    warning:
      "Higher background power draw. Mostly a concern on laptops.",
    apply: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling", name: "PowerThrottlingOff", type: "DWORD", value: 1, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling", name: "PowerThrottlingOff", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "bcdedit-tscsync-enhanced",
    category: "gaming",
    title: "Set TSC sync policy to Enhanced",
    description:
      "Pins Windows to the 'Enhanced' invariant TSC synchronisation policy across cores. Smoother high-resolution timing on multi-CCD Ryzen and big.LITTLE Intel parts.",
    requiresRestart: "system",
    check: [
      {
        kind: "shell",
        script:
          "$o = bcdedit /enum '{current}' 2>&1 | Out-String; if ($o -match 'tscsyncpolicy\\s+Enhanced') { exit 0 } else { exit 1 }",
      },
    ],
    apply: [
      { kind: "shell", script: "bcdedit /set tscsyncpolicy Enhanced | Out-Null" },
    ],
    revert: [
      { kind: "shell", script: "bcdedit /deletevalue tscsyncpolicy | Out-Null" },
    ],
  },
  {
    id: "core-parking-off-ac",
    category: "gaming",
    title: "Disable CPU core parking (on AC power)",
    description:
      "Forces 100 % of cores to stay un-parked while plugged in. Eliminates wake-up latency when a game thread bursts to a previously parked core.",
    warning:
      "Affects the currently active power plan only. Re-apply if you switch plans.",
    apply: [
      {
        kind: "shell",
        script:
          "powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR 0cc5b647-c1df-4637-891a-dec35c318583 100 | Out-Null; powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR ea062031-0e34-4ff1-9b6d-eb1059334028 100 | Out-Null; powercfg -setactive SCHEME_CURRENT | Out-Null",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$s = powercfg /getactivescheme 2>&1 | Out-String; if ($s -notmatch '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') { exit 1 }; $scheme = $Matches[1]; $p = \"HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes\\$scheme\\54533251-82be-4824-96c1-47b60b740d00\\0cc5b647-c1df-4637-891a-dec35c318583\"; $v = (Get-ItemProperty -Path $p -Name ACSettingIndex -ErrorAction SilentlyContinue).ACSettingIndex; if ($v -eq 100) { exit 0 } else { exit 1 }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR 0cc5b647-c1df-4637-891a-dec35c318583 0 | Out-Null; powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR ea062031-0e34-4ff1-9b6d-eb1059334028 100 | Out-Null; powercfg -setactive SCHEME_CURRENT | Out-Null",
      },
    ],
  },
  {
    id: "processor-perf-boost-aggressive",
    category: "gaming",
    title: "Set CPU boost mode to Aggressive",
    description:
      "Tells the active power plan to use aggressive boost — the CPU climbs to its highest P-state as soon as any work appears, instead of waiting for sustained load.",
    apply: [
      {
        kind: "shell",
        script:
          "powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR be337238-0d82-4146-a960-4f3749d470c7 2 | Out-Null; powercfg -setactive SCHEME_CURRENT | Out-Null",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$s = powercfg /getactivescheme 2>&1 | Out-String; if ($s -notmatch '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') { exit 1 }; $scheme = $Matches[1]; $p = \"HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes\\$scheme\\54533251-82be-4824-96c1-47b60b740d00\\be337238-0d82-4146-a960-4f3749d470c7\"; $v = (Get-ItemProperty -Path $p -Name ACSettingIndex -ErrorAction SilentlyContinue).ACSettingIndex; if ($v -eq 2) { exit 0 } else { exit 1 }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR be337238-0d82-4146-a960-4f3749d470c7 0 | Out-Null; powercfg -setactive SCHEME_CURRENT | Out-Null",
      },
    ],
  },
  {
    id: "fullscreen-optimizations-off-global",
    category: "gaming",
    title: "Disable Fullscreen Optimizations globally",
    description:
      "Forces every game to use real exclusive fullscreen instead of Win10/11's borderless 'optimized' compositor. Tighter frame pacing, lower latency in DX11 titles, no DWM tearing.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "System\\GameConfigStore", name: "GameDVR_FSEBehavior", type: "DWORD", value: 2, defaultValue: 0 },
      { kind: "reg", hive: "HKCU", path: "System\\GameConfigStore", name: "GameDVR_FSEBehaviorMode", type: "DWORD", value: 2, defaultValue: 2 },
      { kind: "reg", hive: "HKCU", path: "System\\GameConfigStore", name: "GameDVR_HonorUserFSEBehaviorMode", type: "DWORD", value: 1, defaultValue: 0 },
      { kind: "reg", hive: "HKCU", path: "System\\GameConfigStore", name: "GameDVR_DXGIHonorFSEWindowsCompatible", type: "DWORD", value: 1, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "System\\GameConfigStore", name: "GameDVR_FSEBehavior", type: "DWORD", value: 2 },
    ],
  },
  {
    id: "game-bar-fully-off",
    category: "gaming",
    title: "Disable Game Bar UI completely",
    description:
      "Stronger than the existing Game DVR tweak — also kills the Game Bar overlay UI (Win+G) and its startup tip. Independent of GameDVR recording.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\GameBar", name: "UseNexusForGameBarEnabled", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\GameBar", name: "ShowStartupPanel", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\GameBar", name: "ShowStartupPanel", type: "DWORD", value: 0, defaultValue: 1 },
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\GameBar", name: "GamePanelStartupTipIndex", type: "DWORD", value: 3, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\GameBar", name: "UseNexusForGameBarEnabled", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "xbox-game-monitoring-off",
    category: "gaming",
    title: "Disable Xbox Game Monitoring service",
    description:
      "Stops the 'xbgm' service that watches for game launches to inject the Game Bar. Independent from the Xbox Live services bundle in the Performance category.",
    apply: [
      {
        kind: "shell",
        script:
          "if (Get-Service xbgm -ErrorAction SilentlyContinue) { Stop-Service xbgm -Force -ErrorAction SilentlyContinue; Set-Service xbgm -StartupType Disabled -ErrorAction SilentlyContinue }",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$svc = Get-Service xbgm -ErrorAction SilentlyContinue; if (-not $svc -or $svc.StartType -eq 'Disabled') { exit 0 } else { exit 1 }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "if (Get-Service xbgm -ErrorAction SilentlyContinue) { Set-Service xbgm -StartupType Manual -ErrorAction SilentlyContinue }",
      },
    ],
  },
  {
    id: "game-bar-presence-writer-off",
    category: "gaming",
    title: "Disable GamePresenceWriter task",
    description:
      "Stops the scheduled task that writes 'currently playing' state into the registry for Game Bar / Xbox app. Safe to disable on every system.",
    apply: [
      {
        kind: "shell",
        script:
          "Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like '*GamePresenceWriter*' } | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$t = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like '*GamePresenceWriter*' }; if (-not $t -or ($t | Where-Object State -ne 'Disabled' | Measure-Object).Count -eq 0) { exit 0 } else { exit 1 }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like '*GamePresenceWriter*' } | Enable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null",
      },
    ],
  },
  {
    id: "ntfs-8dot3-off",
    category: "gaming",
    title: "Disable 8.3 short-name generation",
    description:
      "Stops NTFS from maintaining legacy 8.3 short filenames on every write. Small overhead reduction on folder-heavy workloads, irrelevant for modern apps.",
    apply: [
      { kind: "shell", script: "fsutil.exe behavior set disable8dot3 1 | Out-Null" },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$v = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name NtfsDisable8dot3NameCreation -ErrorAction SilentlyContinue).NtfsDisable8dot3NameCreation; if ($v -eq 1) { exit 0 } else { exit 1 }",
      },
    ],
    revert: [
      { kind: "shell", script: "fsutil.exe behavior set disable8dot3 2 | Out-Null" },
    ],
  },
  {
    id: "ntfs-mft-zone-large",
    category: "gaming",
    title: "Enlarge NTFS MFT zone reservation",
    description:
      "Raises the MFT zone reservation from the default (12.5 % of volume) to 25 %. Helps drives with millions of small files (asset libraries, dev folders) keep the MFT contiguous.",
    requiresRestart: "system",
    apply: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\FileSystem", name: "NtfsMftZoneReservation", type: "DWORD", value: 2, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Control\\FileSystem", name: "NtfsMftZoneReservation", type: "DWORD", value: 2 },
    ],
  },
  {
    id: "transparency-effects-off",
    category: "gaming",
    title: "Disable transparency effects (Mica / Acrylic)",
    description:
      "Turns off Mica/Acrylic blur on Start, Taskbar and Action Center. Modest GPU/DWM win — visible on integrated graphics, marginal on a dedicated GPU.",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", name: "EnableTransparency", type: "DWORD", value: 0, defaultValue: 1 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", name: "EnableTransparency", type: "DWORD", value: 0 },
    ],
  },
  {
    id: "dwm-input-io-completion-on",
    category: "gaming",
    title: "DWM: use I/O completion ports for input",
    description:
      "Tells the Desktop Window Manager to route input via I/O completion ports (lower-overhead async queue) instead of a window-message pump. Small win for cursor/input latency under heavy compositor load.",
    requiresRestart: "logon",
    apply: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\Dwm", name: "InputUsesIoCompletionPort", type: "DWORD", value: 1, defaultValue: 0 },
    ],
    check: [
      { kind: "reg", hive: "HKCU", path: "Software\\Microsoft\\Windows\\Dwm", name: "InputUsesIoCompletionPort", type: "DWORD", value: 1 },
    ],
  },
  {
    id: "audio-enhancements-off",
    category: "gaming",
    title: "Disable audio enhancements on all output devices",
    description:
      "Sets PKEY_AudioEndpoint_Disable_SysFx = 1 on every active render endpoint so the platform skips the SFX/MFX chain (Loudness Equalization, Bass Boost, Virtual Surround, …). Often shaves a few ms off audio latency and reduces phasing artefacts in games.",
    apply: [
      {
        kind: "shell",
        script:
          "$prop = '{1da5d803-d492-4edd-8c23-e0c0ffee7f0e},5'; Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render' -ErrorAction SilentlyContinue | ForEach-Object { $fx = Join-Path $_.PSPath 'FxProperties'; if (-not (Test-Path $fx)) { New-Item -Path $fx -Force | Out-Null }; Set-ItemProperty -Path $fx -Name $prop -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue }",
      },
    ],
    check: [
      {
        kind: "shell",
        script:
          "$prop = '{1da5d803-d492-4edd-8c23-e0c0ffee7f0e},5'; $devs = Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render' -ErrorAction SilentlyContinue; if (-not $devs) { exit 1 }; $anyOff = $false; foreach ($d in $devs) { $fx = Join-Path $d.PSPath 'FxProperties'; if (-not (Test-Path $fx)) { continue }; $item = Get-ItemProperty -Path $fx -ErrorAction SilentlyContinue; if (-not $item) { continue }; $p = $item.PSObject.Properties | Where-Object Name -eq $prop; if ($p -and [int]$p.Value -eq 1) { $anyOff = $true } else { exit 1 } }; if ($anyOff) { exit 0 } else { exit 1 }",
      },
    ],
    revert: [
      {
        kind: "shell",
        script:
          "$prop = '{1da5d803-d492-4edd-8c23-e0c0ffee7f0e},5'; Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render' -ErrorAction SilentlyContinue | ForEach-Object { $fx = Join-Path $_.PSPath 'FxProperties'; if (Test-Path $fx) { Remove-ItemProperty -Path $fx -Name $prop -ErrorAction SilentlyContinue } }",
      },
    ],
  },
];

export const ALL_TWEAKS: Tweak[] = [
  ...PRIVACY_TWEAKS,
  ...AI_TWEAKS,
  ...SEARCH_TWEAKS,
  ...EXPLORER_TWEAKS,
  ...TASKBAR_TWEAKS,
  ...PERFORMANCE_TWEAKS,
  ...UPDATE_TWEAKS,
  ...NOTIFICATION_TWEAKS,
  ...BROWSER_TWEAKS,
  ...SECURITY_TWEAKS,
  ...MEMORY_TWEAKS,
  ...GAMING_TWEAKS,
];

export function getTweaksByCategory(category: TweakCategory): Tweak[] {
  return ALL_TWEAKS.filter((t) => t.category === category);
}
