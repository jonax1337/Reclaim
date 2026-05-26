/**
 * Built-in TaskSequence templates. Selected from the dropdown at the top of
 * /install-media. Each template pre-populates the step list with sensible
 * enabled-states and configs; the user is free to edit, reorder, or disable
 * anything after picking one.
 */

import { PROFILES, type Profile } from "$lib/tweaks/profiles";
import { BLOATWARE } from "$lib/tweaks/bloatware";
import { ALL_TWEAKS } from "$lib/tweaks/catalog";
import { defaultConfig, makeStep, type MetaConfig, type TaskSequence, type TaskStep } from "./types";

const sequenceFromSteps = (
  id: string,
  name: string,
  description: string,
  steps: TaskStep[],
): TaskSequence => ({ id, name, description, templateId: id, steps });

function profileById(id: string): Profile | undefined {
  return PROFILES.find((p) => p.id === id);
}

/** All `recommended: true` bloatware patterns. */
function recommendedAppx(): string[] {
  return BLOATWARE.filter((b) => b.recommended).map((b) => b.pattern);
}

/** Pull profile tweak IDs that have at least one reg op (shell-only tweaks
 *  can't be applied via autounattend.xml). */
function profileRegTweakIds(profileId: string): string[] {
  const p = profileById(profileId);
  if (!p) return [];
  const byId = new Map(ALL_TWEAKS.map((t) => [t.id, t]));
  return p.tweakIds.filter((id) => {
    const t = byId.get(id);
    return t && t.apply.some((op) => op.kind === "reg");
  });
}

function basePreamble(): TaskStep[] {
  return [
    makeStep("meta"),
    makeStep("bypass"),
    makeStep("edition"),
    makeStep("oobe-skip"),
    makeStep("privacy"),
  ];
}

export const TEMPLATES: TaskSequence[] = [
  sequenceFromSteps(
    "privacy-max",
    "Privacy Maximum",
    "Strips telemetry, removes 60+ AppX, blocks sponsored apps.",
    [
      ...basePreamble(),
      makeStep("debloat-appx", {
        config: { patterns: recommendedAppx() },
      }),
      makeStep("reg-tweaks", {
        config: { tweakIds: profileRegTweakIds("privacy-max") },
      }),
    ],
  ),

  sequenceFromSteps(
    "gaming",
    "Gaming Rig",
    "Performance + gaming tweaks. Pre-installs Discord and Steam.",
    [
      ...basePreamble(),
      makeStep("debloat-appx", {
        // Only the most-bloat patterns; keep Xbox + GameBar + Edge.
        config: {
          patterns: [
            "Microsoft.BingNews",
            "Microsoft.BingWeather",
            "Microsoft.GetHelp",
            "Microsoft.Getstarted",
            "Microsoft.MicrosoftOfficeHub",
            "Microsoft.MicrosoftSolitaireCollection",
            "Microsoft.WindowsFeedbackHub",
            "MicrosoftTeams",
            "MSTeams",
            "Microsoft.YourPhone",
            "*WhatsApp*",
            "*Spotify*",
            "*TikTok*",
            "*Netflix*",
          ],
        },
      }),
      makeStep("reg-tweaks", {
        config: { tweakIds: profileRegTweakIds("gaming") },
      }),
      makeStep("apps-install", {
        config: { wingetIds: ["Discord.Discord", "Valve.Steam"] },
      }),
    ],
  ),

  sequenceFromSteps(
    "esports",
    "Esports Rig",
    "Aggressive latency profile (NIC interrupt-moderation off, core parking off, HPET off, TSC enhanced). Pre-installs Steam, Discord, NVIDIA-cleaned drivers stack.",
    [
      ...basePreamble(),
      makeStep("debloat-appx", {
        // Same minimal-keep set as Gaming Rig — Xbox + GameBar stay, only the
        // worst preinstalled noise goes.
        config: {
          patterns: [
            "Microsoft.BingNews",
            "Microsoft.BingWeather",
            "Microsoft.GetHelp",
            "Microsoft.Getstarted",
            "Microsoft.MicrosoftOfficeHub",
            "Microsoft.MicrosoftSolitaireCollection",
            "Microsoft.WindowsFeedbackHub",
            "MicrosoftTeams",
            "MSTeams",
            "Microsoft.YourPhone",
            "*WhatsApp*",
            "*Spotify*",
            "*TikTok*",
            "*Netflix*",
            "*Disney*",
            "*Facebook*",
            "*Instagram*",
          ],
        },
      }),
      makeStep("reg-tweaks", {
        config: { tweakIds: profileRegTweakIds("gaming-esports") },
      }),
      makeStep("apps-install", {
        config: {
          wingetIds: [
            "Valve.Steam",
            "Discord.Discord",
            "EpicGames.EpicGamesLauncher",
            "Mozilla.Firefox",
          ],
        },
      }),
    ],
  ),

  sequenceFromSteps(
    "office",
    "Office Workstation",
    "Minimal debloat. Pre-installs Office 365, Firefox, PDF tools.",
    [
      ...basePreamble(),
      makeStep("debloat-appx", {
        config: {
          patterns: [
            "Microsoft.BingNews",
            "Microsoft.BingWeather",
            "Microsoft.MicrosoftSolitaireCollection",
            "Microsoft.XboxGamingOverlay",
            "Microsoft.XboxApp",
            "Microsoft.GamingApp",
            "*Spotify*",
            "*Disney*",
            "*Netflix*",
            "*TikTok*",
            "*WhatsApp*",
            "*CandyCrush*",
            "Microsoft.YourPhone",
          ],
        },
      }),
      makeStep("apps-install", {
        config: {
          wingetIds: [
            "Microsoft.Office",
            "Mozilla.Firefox",
            "Microsoft.PowerToys",
            "7zip.7zip",
            "SumatraPDF.SumatraPDF",
          ],
        },
      }),
    ],
  ),

  sequenceFromSteps(
    "bare",
    "Bare Minimum",
    "Bypasses and OOBE skips only. No debloat, apps, or tweaks.",
    [makeStep("meta"), makeStep("bypass"), makeStep("edition"), makeStep("oobe-skip")],
  ),

  sequenceFromSteps(
    "fully-automated",
    "Fully Automated (zero clicks)",
    "Wipes Disk 0, auto-creates admin, full Privacy-Maximum debloat. Destroys all data on Disk 0.",
    [
      makeStep("meta", {
        config: {
          ...(defaultConfig("meta") as MetaConfig),
          password: "Reclaim!",
          autologon: true,
        },
      }),
      makeStep("bypass"),
      makeStep("edition"),
      makeStep("oobe-skip"),
      makeStep("privacy"),
      makeStep("disk-setup", {
        title: "Auto disk wipe (Disk 0)",
        config: { diskNumber: 0, layout: "uefi-gpt", confirmed: true },
      }),
      makeStep("debloat-appx", {
        config: { patterns: recommendedAppx() },
      }),
      makeStep("reg-tweaks", {
        config: { tweakIds: profileRegTweakIds("privacy-max") },
      }),
    ],
  ),

  sequenceFromSteps(
    "blank",
    "Blank Slate",
    "Empty sequence. Add steps yourself.",
    [],
  ),
];

export const TEMPLATE_MAP: Record<string, TaskSequence> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
);

/** Deep-clone a template so the store can mutate without touching the source. */
export function cloneTemplate(id: string): TaskSequence {
  const tpl = TEMPLATE_MAP[id] ?? TEMPLATE_MAP.blank;
  return structuredClone(tpl);
}
