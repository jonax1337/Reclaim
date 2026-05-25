/**
 * Simple-mode state for Install Media — profile dropdown + a handful of
 * toggles. Independent from the SequenceStore (advanced mode). Both modes
 * can coexist; switching from advanced→simple just hides the step editor.
 */

import { PROFILES, type Profile } from "$lib/tweaks/profiles";
import { BLOATWARE } from "$lib/tweaks/bloatware";
import { ALL_TWEAKS } from "$lib/tweaks/catalog";
import type { UnattendConfig } from "$lib/tweaks/bridge";

export type SimpleLocale = {
  id: string;
  label: string;
  language: string;
  keyboard: string;
  systemLocale: string;
  userLocale: string;
  timezone: string;
  geoId: string;
};

export const SIMPLE_LOCALES: SimpleLocale[] = [
  { id: "de-de", label: "Deutsch (Deutschland)", language: "de-DE", keyboard: "0407:00000407", systemLocale: "de-DE", userLocale: "de-DE", timezone: "W. Europe Standard Time", geoId: "94" },
  { id: "en-us", label: "English (US)", language: "en-US", keyboard: "0409:00000409", systemLocale: "en-US", userLocale: "en-US", timezone: "Pacific Standard Time", geoId: "244" },
  { id: "en-gb", label: "English (UK)", language: "en-GB", keyboard: "0809:00000809", systemLocale: "en-GB", userLocale: "en-GB", timezone: "GMT Standard Time", geoId: "242" },
  { id: "fr-fr", label: "Français (France)", language: "fr-FR", keyboard: "040C:0000040C", systemLocale: "fr-FR", userLocale: "fr-FR", timezone: "Romance Standard Time", geoId: "84" },
  { id: "es-es", label: "Español (España)", language: "es-ES", keyboard: "040A:0000040A", systemLocale: "es-ES", userLocale: "es-ES", timezone: "Romance Standard Time", geoId: "217" },
];

export type SimpleState = {
  profileId: string;       // built-in or custom profile id, or "none"
  localeId: string;
  username: string;
  password: string;
  fullyAutomated: boolean; // wipe disk + autologon
  targetDiskNumber: number;
  mode: "simple" | "advanced";
};

const STORAGE_KEY = "reclaim.install-media-simple";

function loadInitial(): SimpleState {
  const fallback: SimpleState = {
    profileId: "privacy-max",
    localeId: "de-de",
    username: "User",
    password: "",
    fullyAutomated: false,
    targetDiskNumber: 0,
    mode: "simple",
  };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

class SimpleStore {
  state = $state<SimpleState>(loadInitial());

  constructor() {
    if (typeof localStorage !== "undefined") {
      $effect.root(() => {
        $effect(() => {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
          } catch {}
        });
      });
    }
  }

  update(patch: Partial<SimpleState>) {
    this.state = { ...this.state, ...patch };
  }
}

export const simple = new SimpleStore();

/**
 * Build an `UnattendConfig` from the simple-mode state + the resolved Profile.
 * Customs profiles passed in by caller via `allProfiles` since this is a pure
 * function — the caller knows about customProfiles.
 */
export function buildSimpleConfig(
  state: SimpleState,
  allProfiles: Profile[],
): UnattendConfig {
  const locale = SIMPLE_LOCALES.find((l) => l.id === state.localeId) ?? SIMPLE_LOCALES[0];
  const profile = allProfiles.find((p) => p.id === state.profileId);

  // Resolve profile → reg tweaks + appx patterns (same logic as
  // mapProfileToUnattend but inline so we don't share with the old code path).
  const tweakById = new Map(ALL_TWEAKS.map((t) => [t.id, t]));
  const registryTweaks: UnattendConfig["registry_tweaks"] = [];
  if (profile) {
    for (const id of profile.tweakIds) {
      const t = tweakById.get(id);
      if (!t) continue;
      for (const op of t.apply) {
        if (op.kind === "reg") {
          registryTweaks.push({
            hive: op.hive,
            path: op.path,
            name: op.name,
            type: op.type,
            value: op.value,
          });
        }
      }
    }
  }

  // Simple-mode debloat is uniform across all profiles — the curated set of
  // bloatware patterns we recommend killing (BLOATWARE entries marked
  // recommended:true). Profiles control TWEAKS only. Users who want a
  // different cut switch to advanced mode and edit the debloat-appx step.
  const appxPatterns = BLOATWARE.filter((b) => b.recommended).map((b) => b.pattern);

  const password = state.password || (state.fullyAutomated ? "Reclaim!" : "");

  return {
    language: locale.language,
    keyboard: locale.keyboard,
    system_locale: locale.systemLocale,
    user_locale: locale.userLocale,
    timezone: locale.timezone,
    geo_id: locale.geoId,
    username: state.username || "User",
    password: password || null,
    autologon: state.fullyAutomated && password.length > 0,
    computer_name: "RECLAIM-PC",
    organization: "Reclaim",
    edition: "Windows 11 Pro",
    product_key: "W269N-WFGWX-YVC9B-4J6C9-T83GX",
    bypass_tpm_check: true,
    bypass_secure_boot_check: true,
    bypass_ram_check: true,
    bypass_storage_check: true,
    bypass_cpu_check: true,
    bypass_network_requirement: true,
    skip_ms_account: true,
    skip_eula: true,
    skip_oobe_privacy: true,
    disable_telemetry: true,
    disable_advertising_id: true,
    disable_location: true,
    disable_tailored_experiences: true,
    disable_find_my_device: true,
    disable_inking_typing: true,
    disable_diagnostic_data: true,
    disable_cortana: true,
    debloat_appx_patterns: appxPatterns,
    registry_tweaks: registryTweaks,
    custom_commands: [],
    winget_apps: [],
    disk_auto_setup: state.fullyAutomated ? { disk_number: state.targetDiskNumber } : null,
  };
}
