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
    "Strips telemetry, removes 60+ AppX bundles, blocks sponsored apps before first network connect.",
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
    "Performance + gaming tweaks, light debloat. Pre-installs Discord and Steam via winget.",
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
    "office",
    "Office Workstation",
    "Productivity-focused: minimal debloat, pre-installs Office 365, browsers, PDF tools.",
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
    "Just bypasses and OOBE skips. No debloat, no apps, no tweaks. For when you only want hands-free install.",
    [makeStep("meta"), makeStep("bypass"), makeStep("edition"), makeStep("oobe-skip")],
  ),

  sequenceFromSteps(
    "fully-automated",
    "Fully Automated (zero clicks)",
    "Plug in stick, boot, walk away. Wipes Disk 0 automatically, installs Pro, creates 'User' admin with password 'Reclaim!', skips every OOBE screen. Privacy-Maximum debloat included. DANGER: irreversibly wipes the first disk.",
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
