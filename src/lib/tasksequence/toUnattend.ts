/**
 * TaskSequence → UnattendConfig converter. Walks the enabled steps in order
 * and folds their configs into the wire-format the existing Rust generator
 * already knows. New step types (custom-cmd, apps-install, driver-inject)
 * surface through extension fields on UnattendConfig.
 */

import { ALL_TWEAKS, type RegOp } from "$lib/tweaks/catalog";
import type { UnattendConfig, UnattendRegistryTweak } from "$lib/tweaks/bridge";
import type {
  TaskSequence,
  TaskStep,
  MetaConfig,
  BypassConfig,
  EditionConfig,
  OobeSkipConfig,
  PrivacyConfig,
  DebloatAppxConfig,
  RegTweaksConfig,
  AppsInstallConfig,
  CustomCmdConfig,
  DriverInjectConfig,
  DiskSetupConfig,
} from "./types";

export type ConvertResult = {
  config: UnattendConfig;
  /** Driver folder, absolute path. Caller decides whether to copy it to $OEM$. */
  driverFolder: string | null;
  /** Disk-wipe target if the user opted in. Else null. */
  disk: DiskSetupConfig | null;
  /** Tweak IDs that were referenced but had only shell ops (skipped). */
  skippedShellTweaks: string[];
};

function findStep<T extends TaskStep["type"]>(
  seq: TaskSequence,
  type: T,
): Extract<TaskStep, { type: T }> | undefined {
  return seq.steps.find((s) => s.enabled && s.type === type) as
    | Extract<TaskStep, { type: T }>
    | undefined;
}

function findAllSteps<T extends TaskStep["type"]>(
  seq: TaskSequence,
  type: T,
): Array<Extract<TaskStep, { type: T }>> {
  return seq.steps.filter((s) => s.enabled && s.type === type) as Array<
    Extract<TaskStep, { type: T }>
  >;
}

function defaultMeta(): MetaConfig {
  return {
    language: "en-US",
    keyboard: "0409:00000409",
    systemLocale: "en-US",
    userLocale: "en-US",
    timezone: "UTC",
    geoId: "244",
    username: "User",
    password: "",
    autologon: false,
    computerName: "RECLAIM-PC",
    organization: "Reclaim",
  };
}

function regOpToUnattend(op: RegOp): UnattendRegistryTweak {
  return {
    hive: op.hive,
    path: op.path,
    name: op.name,
    type: op.type,
    value: op.value,
  };
}

export function convertSequence(seq: TaskSequence): ConvertResult {
  const meta = (findStep(seq, "meta")?.config as MetaConfig | undefined) ?? defaultMeta();
  const bypass = findStep(seq, "bypass")?.config as BypassConfig | undefined;
  const edition = findStep(seq, "edition")?.config as EditionConfig | undefined;
  const oobeSkip = findStep(seq, "oobe-skip")?.config as OobeSkipConfig | undefined;
  const privacy = findStep(seq, "privacy")?.config as PrivacyConfig | undefined;
  const debloat = findStep(seq, "debloat-appx")?.config as DebloatAppxConfig | undefined;
  const tweaks = findStep(seq, "reg-tweaks")?.config as RegTweaksConfig | undefined;
  const apps = findStep(seq, "apps-install")?.config as AppsInstallConfig | undefined;
  const customs = findAllSteps(seq, "custom-cmd").map(
    (s) => s.config as CustomCmdConfig,
  );
  const driver = findStep(seq, "driver-inject")?.config as DriverInjectConfig | undefined;
  const disk = findStep(seq, "disk-setup")?.config as DiskSetupConfig | undefined;

  // ── Resolve reg-tweaks step into registry_tweaks[] ───────────────────────
  const tweakById = new Map(ALL_TWEAKS.map((t) => [t.id, t]));
  const registryTweaks: UnattendRegistryTweak[] = [];
  const skippedShellTweaks: string[] = [];
  if (tweaks) {
    for (const id of tweaks.tweakIds) {
      const t = tweakById.get(id);
      if (!t) continue;
      let hasShell = false;
      for (const op of t.apply) {
        if (op.kind === "reg") registryTweaks.push(regOpToUnattend(op));
        else if (op.kind === "shell") hasShell = true;
      }
      if (hasShell) skippedShellTweaks.push(id);
    }
  }

  // Edition: use customKey or selectedKey
  const productKey = edition
    ? edition.useCustomKey
      ? edition.customKey || null
      : edition.selectedKey || null
    : null;

  const config: UnattendConfig = {
    language: meta.language,
    keyboard: meta.keyboard,
    system_locale: meta.systemLocale,
    user_locale: meta.userLocale,
    timezone: meta.timezone,
    geo_id: meta.geoId,
    username: meta.username,
    password: meta.password === "" ? null : meta.password,
    autologon: meta.autologon,
    computer_name: meta.computerName,
    organization: meta.organization,
    edition: edition?.editionName ?? null,
    product_key: productKey,
    bypass_tpm_check: bypass?.bypassTpm ?? false,
    bypass_secure_boot_check: bypass?.bypassSecureBoot ?? false,
    bypass_ram_check: bypass?.bypassRam ?? false,
    bypass_storage_check: bypass?.bypassStorage ?? false,
    bypass_cpu_check: bypass?.bypassCpu ?? false,
    bypass_network_requirement: bypass?.bypassNro ?? false,
    skip_ms_account: oobeSkip?.skipMsAccount ?? false,
    skip_eula: oobeSkip?.skipEula ?? false,
    skip_oobe_privacy: oobeSkip?.skipOobePrivacy ?? false,
    disable_telemetry: privacy?.disableTelemetry ?? false,
    disable_advertising_id: privacy?.disableAdvertisingId ?? false,
    disable_location: privacy?.disableLocation ?? false,
    disable_tailored_experiences: privacy?.disableTailoredExperiences ?? false,
    disable_find_my_device: privacy?.disableFindMyDevice ?? false,
    disable_inking_typing: privacy?.disableInkingTyping ?? false,
    disable_diagnostic_data: privacy?.disableDiagnosticData ?? false,
    disable_cortana: privacy?.disableCortana ?? false,
    debloat_appx_patterns: debloat?.patterns ?? [],
    registry_tweaks: registryTweaks,
    custom_commands: customs.map((c) => ({
      hook: c.hook,
      command: c.command,
      description: c.description,
    })),
    winget_apps: apps?.wingetIds ?? [],
    disk_auto_setup:
      disk && disk.confirmed ? { disk_number: disk.diskNumber } : null,
  };

  return {
    config,
    driverFolder: driver?.folderPath || null,
    disk: disk && disk.confirmed ? disk : null,
    skippedShellTweaks,
  };
}
