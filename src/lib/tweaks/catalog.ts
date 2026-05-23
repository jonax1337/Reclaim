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
  | "browser";

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
  check?: RegOp[];
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
    apply: [{ kind: "shell", script: "Disable-ScheduledTask -TaskName 'Microsoft Compatibility Appraiser' -TaskPath '\\Microsoft\\Windows\\Application Experience\\' | Out-Null" }],
    revert: [{ kind: "shell", script: "Enable-ScheduledTask -TaskName 'Microsoft Compatibility Appraiser' -TaskPath '\\Microsoft\\Windows\\Application Experience\\' | Out-Null" }],
  },
  {
    id: "program-data-updater-off",
    category: "privacy",
    title: "Disable ProgramDataUpdater task",
    description:
      "Disables the Application Experience task that updates AIT (Application Impact Telemetry) data.",
    apply: [{ kind: "shell", script: "Disable-ScheduledTask -TaskName 'ProgramDataUpdater' -TaskPath '\\Microsoft\\Windows\\Application Experience\\' | Out-Null" }],
    revert: [{ kind: "shell", script: "Enable-ScheduledTask -TaskName 'ProgramDataUpdater' -TaskPath '\\Microsoft\\Windows\\Application Experience\\' | Out-Null" }],
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
    apply: [
      {
        kind: "reg",
        hive: "HKCU",
        path: explorerAdv,
        name: "TaskbarDa",
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
        name: "TaskbarDa",
        type: "DWORD",
        value: 0,
      },
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
  },
  {
    id: "hibernation-off",
    category: "performance",
    title: "Disable hibernation",
    description:
      "Removes hiberfil.sys (frees gigabytes of disk space). Also disables Fast Startup as a side-effect.",
    requiresRestart: "system",
    apply: [{ kind: "shell", script: "powercfg -h off" }],
    revert: [{ kind: "shell", script: "powercfg -h on" }],
  },
  {
    id: "reserved-storage-off",
    category: "performance",
    title: "Disable Reserved Storage",
    description:
      "Frees roughly 7 GB by removing the storage Windows reserves for updates. Updates still install, just without the pre-allocated buffer.",
    recommended: true,
    requiresRestart: "system",
    apply: [{ kind: "shell", script: "DISM /Online /Set-ReservedStorageState /State:Disabled | Out-Null" }],
    revert: [{ kind: "shell", script: "DISM /Online /Set-ReservedStorageState /State:Enabled | Out-Null" }],
  },
  {
    id: "ntfs-last-access-off",
    category: "performance",
    title: "Disable NTFS last access timestamp",
    description:
      "Stops NTFS from updating the 'last accessed' timestamp on every file read. Tiny IO win, mostly relevant on HDDs.",
    apply: [{ kind: "shell", script: "fsutil behavior set DisableLastAccess 1 | Out-Null" }],
    revert: [{ kind: "shell", script: "fsutil behavior set DisableLastAccess 2 | Out-Null" }],
  },
  {
    id: "ssd-scheduled-defrag-off",
    category: "performance",
    title: "Disable scheduled defrag",
    description:
      "Disables the weekly ScheduledDefrag task. Win11 only runs ReTrim on SSDs anyway, but if you prefer manual control.",
    apply: [{ kind: "shell", script: "Disable-ScheduledTask -TaskName 'ScheduledDefrag' -TaskPath '\\Microsoft\\Windows\\Defrag\\' | Out-Null" }],
    revert: [{ kind: "shell", script: "Enable-ScheduledTask -TaskName 'ScheduledDefrag' -TaskPath '\\Microsoft\\Windows\\Defrag\\' | Out-Null" }],
  },
  {
    id: "ipv6-teredo-off",
    category: "performance",
    title: "Disable IPv6 Teredo tunneling",
    description: "Disables the legacy Teredo IPv6-over-IPv4 transition tunnel.",
    apply: [{ kind: "shell", script: "netsh interface teredo set state disabled | Out-Null" }],
    revert: [{ kind: "shell", script: "netsh interface teredo set state default | Out-Null" }],
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
];

export function getTweaksByCategory(category: TweakCategory): Tweak[] {
  return ALL_TWEAKS.filter((t) => t.category === category);
}
