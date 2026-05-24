// v0.15.1 → v0.15.2 migration: the old per-profile persistence config has
// been collapsed to a single flat persist.tweakIds set. This module reads
// the legacy `persistedProfiles` field that mergeWithDefaults left dangling
// in localStorage's raw form, resolves every referenced profile id to its
// tweak ids (built-in + custom), and writes the flattened set back via the
// service store. Also tears down legacy `\Reclaim\Persist-<profile-id>`
// scheduled tasks the previous version installed.

import { service } from "../service.svelte";
import { PROFILES, resolveProfileTweaks } from "../tweaks/profiles";
import { customProfiles } from "../tweaks/customProfiles.svelte";
import { isTauri, persistenceCleanupLegacyTasks } from "../tweaks/bridge";
import { log } from "../log.svelte";

const STORAGE_KEY = "reclaim.service";

type LegacyShape = {
  persistedProfiles?: Array<{ profileId: string }>;
};

function readLegacyProfileIds(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LegacyShape;
    if (!Array.isArray(parsed.persistedProfiles)) return [];
    return parsed.persistedProfiles
      .map((p) => p?.profileId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

function resolveProfileById(id: string) {
  return PROFILES.find((p) => p.id === id) ?? customProfiles.get(id);
}

/** Resolve legacy profile ids → flat tweak ids set, persist via service store,
 *  and remove the leftover `\Reclaim\Persist-<id>` scheduled tasks. Idempotent
 *  via service.legacyProfilesMigrated guard. */
export async function migrateLegacyProfiles(): Promise<void> {
  if (service.legacyProfilesMigrated) return;
  const legacyIds = readLegacyProfileIds();
  if (legacyIds.length === 0) {
    service.markLegacyMigrated();
    return;
  }

  const tweakIds = new Set<string>(service.config.persist.tweakIds);
  for (const profileId of legacyIds) {
    const profile = resolveProfileById(profileId);
    if (!profile) continue;
    for (const t of resolveProfileTweaks(profile)) {
      tweakIds.add(t.id);
    }
  }
  await service.setPersistedTweakIds([...tweakIds]);
  // Migration also forces persistence enabled — the user previously opted in
  // per-profile, dropping that to "off" silently would surprise them.
  if (!service.config.persist.enabled) {
    await service.setPersistEnabled(true);
  }

  log.info(
    "persistence.migrate",
    "v0.15.1 → v0.15.2",
    `Migrated ${legacyIds.length} persisted profile(s) → ${tweakIds.size} tweak ids`,
  );

  if (isTauri()) {
    try {
      const removed = await persistenceCleanupLegacyTasks();
      if (removed > 0) {
        log.info(
          "persistence.migrate",
          "Legacy scheduled tasks",
          `Removed ${removed} legacy \\Reclaim\\Persist-<id> task(s)`,
        );
      }
    } catch (e) {
      // Likely not elevated — leave the legacy tasks for the user to clean up.
      log.warn(
        "persistence.migrate",
        "Legacy scheduled tasks",
        "Could not remove legacy tasks (admin required)",
        String(e),
      );
    }
  }

  service.markLegacyMigrated();
}
