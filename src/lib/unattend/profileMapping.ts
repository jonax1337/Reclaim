import { ALL_TWEAKS, type RegOp } from "$lib/tweaks/catalog";
import { BLOATWARE } from "$lib/tweaks/bloatware";
import type { Profile } from "$lib/tweaks/profiles";
import type { UnattendRegistryTweak } from "$lib/tweaks/bridge";

export type ProfileMappingResult = {
  /** RegOps that translate cleanly into `reg add` commands. */
  registryTweaks: UnattendRegistryTweak[];
  /** AppX wildcards from the profile (explicit) or — if none specified — the
   *  recommended bloatware patterns. */
  appxPatterns: string[];
  /** Tweak ids that were skipped because their `apply` step relies on a
   *  PowerShell script. The UI surfaces these so the user knows what won't
   *  be ported into the autounattend.xml. */
  skippedShellTweaks: string[];
};

/**
 * Translate a Reclaim profile into the inputs the autounattend.xml generator
 * needs. Pure function — derives everything from the live catalog so adding
 * a new tweak automatically flows into the install-media generator.
 */
export function mapProfileToUnattend(profile: Profile): ProfileMappingResult {
  const tweakById = new Map(ALL_TWEAKS.map((t) => [t.id, t]));
  const registryTweaks: UnattendRegistryTweak[] = [];
  const skippedShellTweaks: string[] = [];

  for (const id of profile.tweakIds) {
    const t = tweakById.get(id);
    if (!t) continue;
    let hasShell = false;
    for (const op of t.apply) {
      if (op.kind === "reg") {
        registryTweaks.push(regOpToUnattend(op));
      } else if (op.kind === "shell") {
        hasShell = true;
      }
    }
    if (hasShell) skippedShellTweaks.push(id);
  }

  let appxPatterns: string[];
  if (profile.bloatwarePatterns && profile.bloatwarePatterns.length > 0) {
    appxPatterns = [...profile.bloatwarePatterns];
  } else {
    appxPatterns = BLOATWARE.filter((b) => b.recommended).map((b) => b.pattern);
  }

  return { registryTweaks, appxPatterns, skippedShellTweaks };
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
