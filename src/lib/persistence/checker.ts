// HKCU-only drift detection + reapply, invoked from the service tick.
//
// For each persisted profile:
//   1) Resolve its tweaks (built-in PROFILES + customProfiles)
//   2) Drop admin-required tweaks (HKLM / shell ops — those need a SYSTEM
//      Scheduled Task; deferred to a later release per docs/PLAN.md)
//   3) Drop tweaks without check[] (no reliable way to detect drift on them)
//   4) In "update-only" mode, gate the whole pass on a recent Windows hotfix
//   5) For every remaining tweak, getTweakState — re-apply if it reads as "off"
//   6) Log a drift.fixed entry per fixed tweak, emit one toast per profile,
//      record per-profile lastCheck + totalDriftsFixed in service.json

import { log } from "../log.svelte";
import { service, type PersistedProfile } from "../service.svelte";
import { recentHotfixInstalledSince } from "../tweaks/bridge";
import { applyTweak, getTweakState, tweakRequiresAdmin } from "../tweaks/executor";
import type { Tweak } from "../tweaks/catalog";
import { PROFILES, resolveProfileTweaks } from "../tweaks/profiles";
import { customProfiles } from "../tweaks/customProfiles.svelte";
import { hashString, notify } from "../notify";

const UPDATE_ONLY_WINDOW_HOURS = 48;

function resolveProfileById(id: string) {
  const builtin = PROFILES.find((p) => p.id === id);
  if (builtin) return builtin;
  return customProfiles.get(id);
}

/** A tweak is eligible for drift re-application if it has check coverage AND
 *  doesn't require admin (HKCU only — HKLM/shell deferred to v0.16+). */
function isEligible(tweak: Tweak): boolean {
  if (tweakRequiresAdmin(tweak)) return false;
  // Without check[] we can't detect drift — re-applying on every tick would
  // be a no-op write storm. Skip silently.
  if (!tweak.check || tweak.check.length === 0) return false;
  return true;
}

export type ProfileCheckResult = {
  profileId: string;
  driftCount: number;
  reappliedTitles: string[];
  skippedAdmin: number;
  skippedShell: number;
  skippedReason?: "no-update" | "profile-missing";
};

async function checkProfile(p: PersistedProfile): Promise<ProfileCheckResult> {
  const profile = resolveProfileById(p.profileId);
  if (!profile) {
    return {
      profileId: p.profileId,
      driftCount: 0,
      reappliedTitles: [],
      skippedAdmin: 0,
      skippedShell: 0,
      skippedReason: "profile-missing",
    };
  }

  // Update-only mode: only re-apply if Windows has likely just reset things.
  if (p.mode === "update-only") {
    try {
      const recent = await recentHotfixInstalledSince(UPDATE_ONLY_WINDOW_HOURS);
      if (!recent) {
        return {
          profileId: p.profileId,
          driftCount: 0,
          reappliedTitles: [],
          skippedAdmin: 0,
          skippedShell: 0,
          skippedReason: "no-update",
        };
      }
    } catch {
      // If we can't query hotfixes, fall through and check anyway — better to
      // re-apply once than to silently miss drift.
    }
  }

  const tweaks = resolveProfileTweaks(profile);
  let skippedAdmin = 0;
  let skippedShell = 0;
  const candidates: Tweak[] = [];
  for (const t of tweaks) {
    if (tweakRequiresAdmin(t)) {
      skippedAdmin++;
      continue;
    }
    if (!t.check || t.check.length === 0) {
      skippedShell++;
      continue;
    }
    candidates.push(t);
  }

  const reappliedTitles: string[] = [];
  for (const t of candidates) {
    let state: "on" | "off" | "unknown";
    try {
      state = await getTweakState(t);
    } catch {
      continue;
    }
    if (state !== "off") continue;
    try {
      await applyTweak(t);
      reappliedTitles.push(t.title);
      log.success(
        "persistence.drift.fixed",
        t.title,
        `Re-applied '${t.title}' (drift from '${profile.name}')`,
      );
    } catch (e) {
      log.error(
        "persistence.reapply.failed",
        t.title,
        `Failed to re-apply '${t.title}'`,
        String(e),
      );
    }
  }

  return {
    profileId: p.profileId,
    driftCount: reappliedTitles.length,
    reappliedTitles,
    skippedAdmin,
    skippedShell,
  };
}

/** Run the persistence check for one profile (Run-now button) or all (tick). */
export async function runPersistenceCheck(opts: {
  profileId?: string;
}): Promise<ProfileCheckResult[]> {
  const persisted = service.config.persistedProfiles;
  const targets = opts.profileId
    ? persisted.filter((p) => p.profileId === opts.profileId)
    : persisted;

  const results: ProfileCheckResult[] = [];
  for (const p of targets) {
    const r = await checkProfile(p);
    results.push(r);
    await service.recordPersistedRun(p.profileId, r.driftCount);
    if (r.skippedReason) continue;
    log.info(
      "persistence.check.completed",
      resolveProfileById(p.profileId)?.name ?? p.profileId,
      `Drift check: ${r.driftCount} re-applied, ${r.skippedAdmin} admin skipped, ${r.skippedShell} unchecked skipped`,
    );
    if (r.driftCount > 0) {
      const profileName = resolveProfileById(p.profileId)?.name ?? p.profileId;
      const titlesPreview = r.reappliedTitles.slice(0, 3).join(", ");
      const more = r.reappliedTitles.length > 3 ? `, +${r.reappliedTitles.length - 3} more` : "";
      await notify({
        channel: "driftDetected",
        title: `Reclaim re-applied ${r.driftCount} tweak${r.driftCount === 1 ? "" : "s"}`,
        body: `${profileName} drifted — restored: ${titlesPreview}${more}`,
        hash: hashString(`drift:${p.profileId}:${r.reappliedTitles.join(",")}`),
        route: "/profiles",
      });
    }
  }
  return results;
}
