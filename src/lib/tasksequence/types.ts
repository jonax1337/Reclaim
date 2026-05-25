/**
 * Task Sequence — typed model for Reclaim's Install-Media pipeline editor.
 *
 * A TaskSequence is an ordered list of TaskSteps. Each step represents one
 * customization the user wants applied during Windows Setup; steps can be
 * toggled off without being deleted (skipped at generation time).
 *
 * The model maps onto Windows Setup's 5 hooks (windowsPE, specialize,
 * oobeSystem, setupcomplete.cmd, FirstLogonCommands), but the user sees a
 * logical flow ("debloat apps", "install drivers") not the underlying pass.
 */

import type { UnattendRegistryTweak } from "$lib/tweaks/bridge";

export type Hook =
  | "windowsPE"
  | "specialize"
  | "oobeSystem"
  | "setupcomplete"
  | "firstlogon";

export const HOOK_LABELS: Record<Hook, string> = {
  windowsPE: "windowsPE — boot phase, before WIM apply",
  specialize: "specialize — after WIM apply, before OOBE (SYSTEM)",
  oobeSystem: "oobeSystem — during OOBE screens (SYSTEM)",
  setupcomplete: "setupcomplete.cmd — after OOBE, before first login (SYSTEM)",
  firstlogon: "FirstLogonCommands — when the new user first signs in (user)",
};

// ─── Step configs ──────────────────────────────────────────────────────────

export type MetaConfig = {
  language: string;
  keyboard: string;
  systemLocale: string;
  userLocale: string;
  timezone: string;
  geoId: string;
  username: string;
  password: string;
  autologon: boolean;
  computerName: string;
  organization: string;
};

export type BypassConfig = {
  bypassTpm: boolean;
  bypassSecureBoot: boolean;
  bypassRam: boolean;
  bypassStorage: boolean;
  bypassCpu: boolean;
  bypassNro: boolean;
};

export type EditionConfig = {
  selectedKey: string;
  useCustomKey: boolean;
  customKey: string;
  editionName: string | null; // display label, used to set /IMAGE/NAME
};

export type OobeSkipConfig = {
  skipMsAccount: boolean;
  skipEula: boolean;
  skipOobePrivacy: boolean;
};

export type DiskSetupConfig = {
  /** Wipe the disk at this number. Default 0 = system. */
  diskNumber: number;
  /** UEFI/GPT default layout (ESP+MSR+OS+Recovery). */
  layout: "uefi-gpt";
  confirmed: boolean; // user must explicitly opt in
};

export type DriverInjectConfig = {
  /** Absolute path to a folder containing .inf driver packages. */
  folderPath: string;
};

export type DebloatAppxConfig = {
  /** Wildcard patterns matched against DisplayName via Get-AppxProvisionedPackage. */
  patterns: string[];
};

export type RegTweaksConfig = {
  /** Tweak IDs from the live catalog. Resolved at generation time. */
  tweakIds: string[];
};

export type AppsInstallConfig = {
  /** Winget IDs, installed silently via setupcomplete.cmd. */
  wingetIds: string[];
};

export type CustomCmdConfig = {
  hook: Hook;
  /** Shell command line. Plain text — no escaping helpers here. */
  command: string;
  description: string;
};

export type PrivacyConfig = {
  disableTelemetry: boolean;
  disableAdvertisingId: boolean;
  disableLocation: boolean;
  disableTailoredExperiences: boolean;
  disableFindMyDevice: boolean;
  disableInkingTyping: boolean;
  disableDiagnosticData: boolean;
  disableCortana: boolean;
};

// ─── Step (discriminated union) ────────────────────────────────────────────

export type TaskStep =
  | { id: string; type: "meta"; enabled: boolean; title: string; config: MetaConfig }
  | { id: string; type: "bypass"; enabled: boolean; title: string; config: BypassConfig }
  | { id: string; type: "edition"; enabled: boolean; title: string; config: EditionConfig }
  | { id: string; type: "oobe-skip"; enabled: boolean; title: string; config: OobeSkipConfig }
  | { id: string; type: "privacy"; enabled: boolean; title: string; config: PrivacyConfig }
  | { id: string; type: "disk-setup"; enabled: boolean; title: string; config: DiskSetupConfig }
  | { id: string; type: "driver-inject"; enabled: boolean; title: string; config: DriverInjectConfig }
  | { id: string; type: "debloat-appx"; enabled: boolean; title: string; config: DebloatAppxConfig }
  | { id: string; type: "reg-tweaks"; enabled: boolean; title: string; config: RegTweaksConfig }
  | { id: string; type: "apps-install"; enabled: boolean; title: string; config: AppsInstallConfig }
  | { id: string; type: "custom-cmd"; enabled: boolean; title: string; config: CustomCmdConfig };

export type StepType = TaskStep["type"];

export type TaskSequence = {
  id: string;
  name: string;
  description: string;
  templateId?: string;
  steps: TaskStep[];
};

export const STEP_ICONS: Record<StepType, string> = {
  meta: "Settings2",
  bypass: "Shield",
  edition: "Tag",
  "oobe-skip": "SkipForward",
  privacy: "Eye",
  "disk-setup": "HardDrive",
  "driver-inject": "Cpu",
  "debloat-appx": "Trash2",
  "reg-tweaks": "Wrench",
  "apps-install": "Package",
  "custom-cmd": "Terminal",
};

export const STEP_LABELS: Record<StepType, string> = {
  meta: "Locale & account",
  bypass: "Hardware-check bypasses",
  edition: "Windows edition",
  "oobe-skip": "OOBE skips",
  privacy: "OOBE privacy defaults",
  "disk-setup": "Auto disk setup",
  "driver-inject": "Inject drivers",
  "debloat-appx": "Remove bloatware (AppX)",
  "reg-tweaks": "Apply Reclaim tweaks",
  "apps-install": "Install apps (winget)",
  "custom-cmd": "Custom command",
};

export const STEP_DESCRIPTIONS: Record<StepType, string> = {
  meta: "Username, computer name, language, keyboard, timezone.",
  bypass: "Skip Win11's TPM / Secure Boot / RAM / CPU / storage requirements.",
  edition: "Pick which Win11 SKU Setup installs (KMS client key picker).",
  "oobe-skip":
    "Hide OOBE screens — EULA, Microsoft-account prompts, network requirement.",
  privacy:
    "Pre-answer OOBE privacy defaults to off — telemetry, location, ad ID, etc.",
  "disk-setup":
    "Auto-wipe and partition a specific disk during install. Risky — opt in explicitly.",
  "driver-inject":
    "Copy a folder of .inf drivers into $OEM$\\$1\\Drivers; Setup auto-installs.",
  "debloat-appx":
    "AppX provisioned-package removal patterns. Runs in setupcomplete.cmd as SYSTEM.",
  "reg-tweaks":
    "Reclaim catalog tweaks, dispatched to the right hook based on hive.",
  "apps-install":
    "Winget IDs installed silently via setupcomplete.cmd after OOBE.",
  "custom-cmd":
    "Freeform shell command attached to a Setup hook of your choice.",
};

/**
 * Default config for each step type. Used when adding a fresh step OR when a
 * template doesn't override the config.
 */
export function defaultConfig(type: StepType): TaskStep["config"] {
  switch (type) {
    case "meta":
      return {
        language: "de-DE",
        keyboard: "0407:00000407",
        systemLocale: "de-DE",
        userLocale: "de-DE",
        timezone: "W. Europe Standard Time",
        geoId: "94",
        username: "User",
        password: "",
        autologon: false,
        computerName: "RECLAIM-PC",
        organization: "Reclaim",
      };
    case "bypass":
      return {
        bypassTpm: true,
        bypassSecureBoot: true,
        bypassRam: true,
        bypassStorage: true,
        bypassCpu: true,
        bypassNro: true,
      };
    case "edition":
      return {
        selectedKey: "W269N-WFGWX-YVC9B-4J6C9-T83GX",
        useCustomKey: false,
        customKey: "",
        editionName: "Windows 11 Pro",
      };
    case "oobe-skip":
      return { skipMsAccount: true, skipEula: true, skipOobePrivacy: true };
    case "privacy":
      return {
        disableTelemetry: true,
        disableAdvertisingId: true,
        disableLocation: true,
        disableTailoredExperiences: true,
        disableFindMyDevice: true,
        disableInkingTyping: true,
        disableDiagnosticData: true,
        disableCortana: true,
      };
    case "disk-setup":
      return { diskNumber: 0, layout: "uefi-gpt", confirmed: false };
    case "driver-inject":
      return { folderPath: "" };
    case "debloat-appx":
      return { patterns: [] };
    case "reg-tweaks":
      return { tweakIds: [] };
    case "apps-install":
      return { wingetIds: [] };
    case "custom-cmd":
      return { hook: "setupcomplete", command: "", description: "" };
  }
}

/**
 * Canonical Setup-phase order. Each step routes to the right Windows Setup
 * hook at generation time regardless of sequence position, but we still insert
 * steps in this order so the visible flow reads top-to-bottom like Setup
 * actually runs: locale + identity → hardware bypasses → SKU selection →
 * OOBE skips → privacy → disk wipe → drivers → AppX cleanup → reg tweaks →
 * winget apps → custom commands.
 */
export const STEP_ORDER: Record<StepType, number> = {
  meta: 0,
  bypass: 10,
  edition: 20,
  "oobe-skip": 30,
  privacy: 40,
  "disk-setup": 50,
  "driver-inject": 60,
  "debloat-appx": 70,
  "reg-tweaks": 80,
  "apps-install": 90,
  "custom-cmd": 100,
};

/**
 * Step types that legitimately make sense to add more than once. Only
 * `custom-cmd` qualifies — different hooks, different commands. Every other
 * type aggregates its inputs into a single list inside one step.
 */
export const MULTI_STEP_TYPES: ReadonlySet<StepType> = new Set(["custom-cmd"]);

export function isSingletonType(type: StepType): boolean {
  return !MULTI_STEP_TYPES.has(type);
}

export function makeStep(type: StepType, overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: `step-${Math.random().toString(36).slice(2, 10)}`,
    type,
    enabled: true,
    title: STEP_LABELS[type],
    config: defaultConfig(type),
    ...overrides,
  } as TaskStep;
}

/** Aggregate type emitted into UnattendConfig + new custom-command sidecars. */
export type GenerationOutput = {
  config: import("$lib/tweaks/bridge").UnattendConfig;
  customCommands: Array<{ hook: Hook; command: string; description: string }>;
  wingetIds: string[];
  driverFolder: string | null;
  diskWipe: DiskSetupConfig | null;
  /** Registry tweak shape feeding into `registry_tweaks`. */
  registryTweaks: UnattendRegistryTweak[];
};
