// Flat-set drift detection + reapply, invoked from the service tick.
//
// v0.15.2 model: instead of iterating per-profile, the loop walks
// `service.config.persist.tweakIds` directly. That set is auto-managed by
// the tweak executor (applyTweak adds, revertTweak removes), so "what gets
// persisted" mirrors "what the user has actively turned on" without ever
// asking the user to pick a profile for persistence.
//
// For each id in the set:
//   1) Look up the Tweak in ALL_TWEAKS — drop unknown ids silently (catalog
//      changed since the user enabled persistence; cleaned up next save).
//   2) Skip admin-required tweaks (HKLM / shell ops). They're handled by the
//      SYSTEM-running `\Reclaim\Persist-Current` scheduled task installed via
//      persistence.rs, which runs reclaim.exe with --admin-only.
//   3) Skip tweaks without check[] arrays — no reliable way to detect drift.
//   4) In "update-only" mode, gate the whole pass on a recent Windows hotfix.
//   5) For remaining tweaks: getTweakState → re-apply on "off".
//   6) Log + emit one drift toast per run, record stats on the service store.

import { log } from "../log.svelte";
import { service } from "../service.svelte";
import { recentHotfixInstalledSince } from "../tweaks/bridge";
import { applyTweak, getTweakState, tweakRequiresAdmin } from "../tweaks/executor";
import { ALL_TWEAKS, type Tweak } from "../tweaks/catalog";
import { hashString, notify } from "../notify";

const UPDATE_ONLY_WINDOW_HOURS = 48;

/** Returns true if the tweak's state can be read back from the registry —
 *  either via an explicit `check[]` array, or by inspecting the apply ops for
 *  any registry write (getTweakState falls back to those). Tweaks composed
 *  entirely of shell ops (e.g. `Set-Service X -StartupType Disabled`) have no
 *  cheap drift-detection path and are skipped by the loop — re-applying them
 *  unconditionally would mean running PowerShell every tick. */
export function isDriftCheckable(tweak: Tweak): boolean {
  if (tweak.check && tweak.check.some((c) => c.kind === "reg")) return true;
  return tweak.apply.some((o) => o.kind === "reg");
}

export type PersistenceCheckResult = {
  driftCount: number;
  reappliedTitles: string[];
  scanned: number;
  skippedAdmin: number;
  skippedUncheckable: number;
  skippedUnknown: number;
  skippedReason?: "disabled" | "empty" | "no-update";
};

const tweakById = new Map<string, Tweak>(ALL_TWEAKS.map((t) => [t.id, t] as const));

export async function runPersistenceCheck(): Promise<PersistenceCheckResult> {
  const persist = service.config.persist;
  const base: PersistenceCheckResult = {
    driftCount: 0,
    reappliedTitles: [],
    scanned: 0,
    skippedAdmin: 0,
    skippedUncheckable: 0,
    skippedUnknown: 0,
  };

  if (!persist.enabled) {
    return { ...base, skippedReason: "disabled" };
  }
  if (persist.tweakIds.length === 0) {
    return { ...base, skippedReason: "empty" };
  }

  if (persist.mode === "update-only") {
    try {
      const recent = await recentHotfixInstalledSince(UPDATE_ONLY_WINDOW_HOURS);
      if (!recent) {
        return { ...base, skippedReason: "no-update" };
      }
    } catch {
      // If we can't query hotfix install dates (PS failure, locale weirdness),
      // fall through and re-apply once — better than silently never running.
    }
  }

  const reappliedTitles: string[] = [];
  let skippedAdmin = 0;
  let skippedUncheckable = 0;
  let skippedUnknown = 0;
  let scanned = 0;

  for (const id of persist.tweakIds) {
    const tweak = tweakById.get(id);
    if (!tweak) {
      skippedUnknown++;
      continue;
    }
    if (tweakRequiresAdmin(tweak)) {
      skippedAdmin++;
      continue;
    }
    if (!isDriftCheckable(tweak)) {
      // Pure shell-based tweak with no check[] — can't drift-detect without
      // executing PowerShell every tick. Still allowed in the persistence set
      // (the user asked for it), just not auto-re-applied.
      skippedUncheckable++;
      continue;
    }
    scanned++;
    let state: "on" | "off" | "unknown";
    try {
      state = await getTweakState(tweak);
    } catch {
      continue;
    }
    if (state !== "off") continue;
    try {
      await applyTweak(tweak);
      reappliedTitles.push(tweak.title);
      log.success(
        "persistence.drift.fixed",
        tweak.title,
        `Re-applied '${tweak.title}' (drift detected)`,
      );
    } catch (e) {
      log.error(
        "persistence.reapply.failed",
        tweak.title,
        `Failed to re-apply '${tweak.title}'`,
        String(e),
      );
    }
  }

  await service.recordPersistRun(reappliedTitles.length);

  log.info(
    "persistence.check.completed",
    "Auto-persist",
    `Drift check: ${reappliedTitles.length} re-applied, ${scanned} scanned, ${skippedAdmin} admin (SYSTEM task), ${skippedUncheckable} uncheckable, ${skippedUnknown} unknown ids`,
  );

  if (reappliedTitles.length > 0) {
    const preview = reappliedTitles.slice(0, 3).join(", ");
    const more =
      reappliedTitles.length > 3 ? `, +${reappliedTitles.length - 3} more` : "";
    await notify({
      channel: "driftDetected",
      title: `Reclaim re-applied ${reappliedTitles.length} tweak${reappliedTitles.length === 1 ? "" : "s"}`,
      body: `${preview}${more}`,
      hash: hashString(`drift:${reappliedTitles.join(",")}`),
      route: "/settings",
    });
  }

  return {
    driftCount: reappliedTitles.length,
    reappliedTitles,
    scanned,
    skippedAdmin,
    skippedUncheckable,
    skippedUnknown,
  };
}
