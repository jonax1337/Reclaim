import type { Tweak } from "./catalog";
import { ALL_TWEAKS } from "./catalog";

export type Profile = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  tweakIds: string[];
  gradient: string;
  bloatwarePatterns?: string[];
  custom?: boolean;
  createdAt?: number;
};

/** Versioned JSON envelope written by Export and accepted by Import. */
export type ProfileV1 = {
  schemaVersion: 1;
  id: string;
  name: string;
  tagline: string;
  description: string;
  gradient: string;
  tweakIds: string[];
  bloatwarePatterns?: string[];
  custom?: true;
  createdAt?: number;
};

/** Icon choices for profile cards. The Profile.gradient field stores the
 *  `value` from this list; legacy profiles with old Tailwind gradient strings
 *  fall back to "sparkles" at render time. */
export const ICON_PRESETS: { label: string; value: string }[] = [
  { label: "Sparkles", value: "sparkles" },
  { label: "Shield", value: "shield" },
  { label: "Bolt", value: "bolt" },
  { label: "Gauge", value: "gauge" },
  { label: "Wand", value: "wand" },
  { label: "Cpu", value: "cpu" },
  { label: "Lock", value: "lock" },
  { label: "Compass", value: "compass" },
];

/** Back-compat alias — old code referenced GRADIENT_PRESETS. */
export const GRADIENT_PRESETS = ICON_PRESETS;

const ICON_VALUES = new Set(ICON_PRESETS.map((p) => p.value));

/** Resolve a profile's `gradient` field to a stable icon-name string.
 *  Legacy gradient strings ("from-violet-500 via-fuchsia-500 to-pink-500")
 *  fall back to "sparkles" so old JSON profiles keep rendering. */
export function profileIconName(profile: { gradient?: string }): string {
  const v = profile.gradient;
  if (v && ICON_VALUES.has(v)) return v;
  return "sparkles";
}

export const PROFILES: Profile[] = [
  {
    id: "gaming",
    name: "Gaming",
    tagline: "Free up resources for games",
    description:
      "Disables Game DVR background recording, background apps, telemetry and Cortana — everything that competes with your GPU and CPU during gameplay. Adds MMCSS gaming scheduling, foreground-priority boost and a couple of safe latency tweaks on top.",
    gradient: "bolt",
    tweakIds: [
      "game-dvr-off",
      "background-apps-off",
      "mouse-accel-off",
      "telemetry-off",
      "cortana-off",
      "search-highlights-off",
      "fast-startup-off",
      "no-auto-restart",
      "diagtrack-service-off",
      "power-plan-high-performance",
      "visual-effects-best-performance",
      "auto-restart-presentation-off",
      "game-mode-on",
      "system-responsiveness-gaming",
      "mmcss-gaming-priority",
      "cpu-priority-foreground-boost",
      "foreground-lock-timeout-off",
      "sysmain-off",
    ],
  },
  {
    id: "privacy-max",
    name: "Privacy Maximum",
    tagline: "Lock down telemetry & tracking",
    description:
      "Turns off every telemetry, AI snapshot, ad ID, location and feedback hook. Kills the DiagTrack service and the matching scheduled tasks. Also blocks nearby sharing, Office cloud content, lock-screen Spotlight and the Win11 'restore my apps on sign-in' feature.",
    gradient: "lock",
    tweakIds: [
      "telemetry-off",
      "advertising-id-off",
      "activity-history-off",
      "location-tracking-off",
      "feedback-nag-off",
      "tailored-experiences-off",
      "find-my-device-off",
      "error-reporting-off",
      "ceip-off",
      "wifi-sense-off",
      "clipboard-cloud-sync-off",
      "shared-experiences-off",
      "spotlight-desktop-off",
      "suggested-actions-off",
      "copilot-off",
      "recall-off",
      "click-to-do-off",
      "edge-ai-off",
      "notepad-copilot-off",
      "bing-search-off",
      "cortana-off",
      "web-search-off",
      "search-highlights-off",
      "hide-sponsored-recommendations",
      "lockscreen-tips-off",
      "diagtrack-service-off",
      "diagtrack-tasks-off",
      "onedrive-sync-ads-off",
      "delivery-optimization-off",
      "inking-typing-personalization-off",
      "app-account-info-off",
      "app-contacts-access-off",
      "app-calendar-access-off",
      "app-call-history-off",
      "app-messaging-access-off",
      "app-diagnostics-access-off",
      "compat-telemetry-task-off",
      "program-data-updater-off",
      "clipboard-history-off",
      "app-launch-tracking-off",
      "windows-ai-policy-off",
      "edge-hub-sidebar-off",
      "office-ai-feedback-off",
      "safe-search-off",
      "search-history-off",
      "msa-cloud-search-off",
      "aad-cloud-search-off",
      "tips-tricks-off",
      "welcome-experience-off",
      "app-suggestions-start-off",
      "nearby-share-off",
      "office-content-download-off",
      "spotlight-lockscreen-off",
      "restart-apps-on-signin-off",
    ],
  },
  {
    id: "performance",
    name: "Performance",
    tagline: "Free up RAM & disk",
    description:
      "Disables background apps, Storage Sense, Fast Startup, Game DVR, SysMain (Superfetch) and hibernation — reclaims gigabytes of RAM and disk space. Trims a few extra background services that buy nothing on modern SSDs.",
    gradient: "gauge",
    tweakIds: [
      "background-apps-off",
      "storage-sense-off",
      "fast-startup-off",
      "game-dvr-off",
      "mouse-accel-off",
      "diagtrack-service-off",
      "diagtrack-tasks-off",
      "sticky-keys-prompt-off",
      "hibernation-off",
      "reserved-storage-off",
      "ntfs-last-access-off",
      "ssd-scheduled-defrag-off",
      "ndu-off",
      "power-plan-high-performance",
      "menu-show-delay-zero",
      "visual-effects-best-performance",
      "ipv6-teredo-off",
      "sysmain-off",
      "prefetch-off",
      "maps-broker-off",
      "retail-demo-off",
      "wmp-network-sharing-off",
      "dmwap-push-off",
    ],
  },
  {
    id: "basics",
    name: "Reclaim Basics",
    tagline: "Just the safe essentials",
    description:
      "The full set of 'Recommended' tweaks — safe, reversible improvements that everyone benefits from.",
    gradient: "wand",
    tweakIds: ALL_TWEAKS.filter((t) => t.recommended).map((t) => t.id),
  },
];

export function resolveProfileTweaks(profile: Profile): Tweak[] {
  const map = new Map(ALL_TWEAKS.map((t) => [t.id, t]));
  return profile.tweakIds.map((id) => map.get(id)).filter((t): t is Tweak => !!t);
}

export type ProfileStats = {
  total: number;
  applied: number;
  percent: number;
};

/** Count how many of a profile's tweaks are currently in the "on" state.
 *  Unknown states are treated as not-applied so the percentage doesn't
 *  flicker upward just because a check failed. */
export function profileAppliedStats(
  profile: Profile,
  states: Record<string, "on" | "off" | "unknown">,
): ProfileStats {
  const tweaks = resolveProfileTweaks(profile);
  const total = tweaks.length;
  if (total === 0) return { total: 0, applied: 0, percent: 0 };
  const applied = tweaks.filter((t) => states[t.id] === "on").length;
  return { total, applied, percent: Math.round((applied / total) * 100) };
}

/* ------------------------------------------------------------------------- */
/* JSON envelope I/O.                                                         */
/* ------------------------------------------------------------------------- */

export function toEnvelope(p: Profile): ProfileV1 {
  // bloatwarePatterns is intentionally not serialized — debloat is a
  // standardized step in the ISO builder, not per-profile data. The field
  // stays on the Profile type for backwards compat with old .reclaim imports.
  return {
    schemaVersion: 1,
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    gradient: p.gradient,
    tweakIds: p.tweakIds,
    custom: true,
    createdAt: p.createdAt,
  };
}

export type ImportResult = {
  profile: Profile;
  unknownTweakIds: string[];
};

export function parseEnvelope(raw: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Not valid JSON: ${(e as Error).message}`);
  }
  if (!data || typeof data !== "object") {
    throw new Error("Profile JSON must be an object.");
  }
  const env = data as Partial<ProfileV1>;
  if (env.schemaVersion !== 1) {
    throw new Error(`Unsupported schemaVersion: ${env.schemaVersion}`);
  }
  for (const field of ["name", "tagline", "description", "gradient"] as const) {
    if (typeof env[field] !== "string" || !env[field]) {
      throw new Error(`Missing or empty field: ${field}`);
    }
  }
  if (!Array.isArray(env.tweakIds) || !env.tweakIds.every((x) => typeof x === "string")) {
    throw new Error("tweakIds must be an array of strings.");
  }
  if (
    env.bloatwarePatterns != null &&
    (!Array.isArray(env.bloatwarePatterns) ||
      !env.bloatwarePatterns.every((x) => typeof x === "string"))
  ) {
    throw new Error("bloatwarePatterns must be an array of strings if present.");
  }

  const knownIds = new Set(ALL_TWEAKS.map((t) => t.id));
  const unknownTweakIds: string[] = [];
  const tweakIds: string[] = [];
  for (const id of env.tweakIds!) {
    if (knownIds.has(id)) tweakIds.push(id);
    else unknownTweakIds.push(id);
  }

  // Old .reclaim files may include bloatwarePatterns; we accept the field
  // (validation above) but silently drop it — debloat is now ISO-wide, not
  // profile-bound.
  const profile: Profile = {
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: env.name!,
    tagline: env.tagline!,
    description: env.description!,
    gradient: env.gradient!,
    tweakIds,
    custom: true,
    createdAt: Date.now(),
  };
  return { profile, unknownTweakIds };
}
