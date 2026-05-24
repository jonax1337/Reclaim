// Frontend store for the background-service state (tray, autostart, interval,
// auto-persisted tweaks, notification prefs). Mirrors to localStorage for
// synchronous first paint and to <app_data_dir>/service.json for durability.
//
// The Rust-side Tokio timer in service.rs emits a `service.tick` event every
// N hours. We subscribe to it once at app boot and fan out to the persistence
// + update checkers.
//
// Persistence model (v0.15.2+): instead of the user selecting which profiles
// to "keep applied", a single global `persist.enabled` toggle auto-tracks any
// tweak the user applies (executor.ts adds the id on apply, removes on revert).
// The drift loop iterates `persist.tweakIds` directly — no profile lookup.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  isTauri,
  readAppFile,
  writeAppFile,
  serviceSetInterval,
  serviceSetKeepInTray,
} from "./tweaks/bridge";

const STORAGE_KEY = "reclaim.service";
const FILE_NAME = "service.json";

export type PersistenceMode = "strict" | "update-only";

export type PersistState = {
  enabled: boolean;
  mode: PersistenceMode;
  tweakIds: string[];
  systemTaskEnabled: boolean;
  lastCheck: number;
  lastDriftCount: number;
  totalDriftsFixed: number;
};

export type NotificationChannel =
  | "driftDetected"
  | "windowsUpdateAvailable"
  | "driverUpdateAvailable";

export type NotificationPrefs = Record<NotificationChannel, boolean>;

type ThrottleEntry = { hash: string; at: number };

export type ServiceConfig = {
  intervalHours: number;
  startInTray: boolean;
  keepInTray: boolean;
  hasShownTrayHint: boolean;
  lastTick: number;
  lastWuCheck: number;
  lastDriverCheck: number;
  persist: PersistState;
  notificationPrefs: NotificationPrefs;
  throttle: Record<NotificationChannel, ThrottleEntry | null>;
};

// Legacy v0.15.1 shape — kept around so we can migrate the user's existing
// per-profile persistence config on first boot into the new flat tweakIds set.
type LegacyPersistedProfile = {
  profileId: string;
  mode: PersistenceMode;
  lastCheck: number;
  lastDriftCount: number;
  totalDriftsFixed: number;
};

const DEFAULT_PERSIST: PersistState = {
  enabled: false,
  mode: "update-only",
  tweakIds: [],
  systemTaskEnabled: false,
  lastCheck: 0,
  lastDriftCount: 0,
  totalDriftsFixed: 0,
};

const DEFAULT_CONFIG: ServiceConfig = {
  intervalHours: 6,
  startInTray: true,
  keepInTray: true,
  hasShownTrayHint: false,
  lastTick: 0,
  lastWuCheck: 0,
  lastDriverCheck: 0,
  persist: structuredClone(DEFAULT_PERSIST),
  notificationPrefs: {
    driftDetected: true,
    windowsUpdateAvailable: true,
    driverUpdateAvailable: true,
  },
  throttle: {
    driftDetected: null,
    windowsUpdateAvailable: null,
    driverUpdateAvailable: null,
  },
};

function readLocal(): ServiceConfig {
  if (typeof localStorage === "undefined") return structuredClone(DEFAULT_CONFIG);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

function writeLocal(data: ServiceConfig) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function mergePersist(input: unknown, legacy: LegacyPersistedProfile[]): PersistState {
  const incoming = (input ?? {}) as Partial<PersistState>;
  const ids = Array.isArray(incoming.tweakIds)
    ? incoming.tweakIds.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  return {
    enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : legacy.length > 0,
    mode:
      incoming.mode === "strict" || incoming.mode === "update-only"
        ? incoming.mode
        : legacy[0]?.mode ?? DEFAULT_PERSIST.mode,
    tweakIds: ids,
    systemTaskEnabled:
      typeof incoming.systemTaskEnabled === "boolean"
        ? incoming.systemTaskEnabled
        : false,
    lastCheck:
      typeof incoming.lastCheck === "number"
        ? incoming.lastCheck
        : legacy.reduce((m, p) => Math.max(m, p.lastCheck), 0),
    lastDriftCount:
      typeof incoming.lastDriftCount === "number"
        ? incoming.lastDriftCount
        : legacy.reduce((m, p) => m + p.lastDriftCount, 0),
    totalDriftsFixed:
      typeof incoming.totalDriftsFixed === "number"
        ? incoming.totalDriftsFixed
        : legacy.reduce((m, p) => m + p.totalDriftsFixed, 0),
  };
}

function mergeWithDefaults(parsed: unknown): ServiceConfig {
  if (!parsed || typeof parsed !== "object") return structuredClone(DEFAULT_CONFIG);
  const p = parsed as Partial<ServiceConfig> & {
    persistedProfiles?: unknown;
  };
  const legacyProfiles = Array.isArray(p.persistedProfiles)
    ? (p.persistedProfiles as unknown[]).filter(
        (x): x is LegacyPersistedProfile =>
          !!x &&
          typeof x === "object" &&
          typeof (x as LegacyPersistedProfile).profileId === "string" &&
          ((x as LegacyPersistedProfile).mode === "strict" ||
            (x as LegacyPersistedProfile).mode === "update-only"),
      )
    : [];
  return {
    intervalHours:
      typeof p.intervalHours === "number" && p.intervalHours > 0
        ? Math.min(168, Math.max(1, Math.round(p.intervalHours)))
        : DEFAULT_CONFIG.intervalHours,
    startInTray: p.startInTray ?? DEFAULT_CONFIG.startInTray,
    keepInTray: p.keepInTray ?? DEFAULT_CONFIG.keepInTray,
    hasShownTrayHint: p.hasShownTrayHint ?? false,
    lastTick: typeof p.lastTick === "number" ? p.lastTick : 0,
    lastWuCheck: typeof p.lastWuCheck === "number" ? p.lastWuCheck : 0,
    lastDriverCheck: typeof p.lastDriverCheck === "number" ? p.lastDriverCheck : 0,
    persist: mergePersist(p.persist, legacyProfiles),
    notificationPrefs: { ...DEFAULT_CONFIG.notificationPrefs, ...(p.notificationPrefs ?? {}) },
    throttle: { ...DEFAULT_CONFIG.throttle, ...(p.throttle ?? {}) },
  };
}

type TickHandler = (source: "auto" | "manual", ts: number) => void;

class ServiceStore {
  config = $state<ServiceConfig>(readLocal());
  loaded = $state(false);
  ready: Promise<void>;
  /** Set true once the v0.15.1→v0.15.2 migration has been processed at runtime
   *  so consumers (BackgroundServiceCard) can decide whether to ask the user
   *  about cleaning up legacy `\Reclaim\Persist-<profile-id>` scheduled tasks. */
  legacyProfilesMigrated = $state(false);

  #tickHandlers: TickHandler[] = [];
  #unlistenTick: UnlistenFn | null = null;
  #unlistenTrigger: UnlistenFn | null = null;
  #unlistenNavigate: UnlistenFn | null = null;
  #navigateHandler: ((route: string) => void) | null = null;

  constructor() {
    this.ready = this.#hydrate();
  }

  async #hydrate() {
    if (!isTauri()) {
      this.loaded = true;
      return;
    }
    let rawHadLegacy = false;
    try {
      const raw = await readAppFile(FILE_NAME);
      if (raw) {
        const parsed = JSON.parse(raw);
        rawHadLegacy =
          parsed && typeof parsed === "object" && Array.isArray((parsed as { persistedProfiles?: unknown }).persistedProfiles);
        this.config = mergeWithDefaults(parsed);
        writeLocal(this.config);
      } else {
        await this.#persist();
      }
    } catch {
      // file unreadable — keep localStorage values
    }
    // If the file had v0.15.1's persistedProfiles, the merge already resolved
    // them into persist.{enabled,mode,...} headers. The tweak-id flattening
    // happens lazily once the catalog is in memory — done by migrateLegacyProfiles
    // below, kicked off from App.svelte after the catalog is available.
    if (rawHadLegacy && this.config.persist.tweakIds.length === 0) {
      // No tweakIds yet; defer to migrateLegacyProfiles. Mark not-yet-migrated.
      this.legacyProfilesMigrated = false;
    } else {
      this.legacyProfilesMigrated = true;
    }
    // Sync Rust-side state with the loaded config so the tick loop and the
    // close handler honor the user's last-saved choices.
    try {
      await serviceSetInterval(this.config.intervalHours);
    } catch {}
    try {
      await serviceSetKeepInTray(this.config.keepInTray);
    } catch {}
    // Persist back so the new shape (without persistedProfiles) replaces the
    // legacy on-disk format on first run.
    if (rawHadLegacy) {
      await this.#persist();
    }
    this.loaded = true;
  }

  async #persist() {
    writeLocal(this.config);
    if (isTauri()) {
      try {
        await writeAppFile(FILE_NAME, JSON.stringify(this.config, null, 2));
      } catch {}
    }
  }

  /** Mutator helper — runs the updater, then persists. */
  async update(mut: (c: ServiceConfig) => void): Promise<void> {
    mut(this.config);
    await this.#persist();
  }

  /** Subscribe to ticks. Returns an unsubscribe fn. */
  onTick(handler: TickHandler): () => void {
    this.#tickHandlers.push(handler);
    return () => {
      this.#tickHandlers = this.#tickHandlers.filter((h) => h !== handler);
    };
  }

  /** Set a single navigation handler (used by Layout to push routes from
   *  tray-menu events). Only one consumer makes sense here. */
  setNavigateHandler(handler: (route: string) => void) {
    this.#navigateHandler = handler;
  }

  async setIntervalHours(hours: number) {
    await this.update((c) => {
      c.intervalHours = Math.max(1, Math.min(168, Math.round(hours)));
    });
    if (isTauri()) {
      try {
        await serviceSetInterval(this.config.intervalHours);
      } catch {}
    }
  }

  async setKeepInTray(enabled: boolean) {
    await this.update((c) => {
      c.keepInTray = enabled;
    });
    if (isTauri()) {
      try {
        await serviceSetKeepInTray(enabled);
      } catch {}
    }
  }

  async setStartInTray(enabled: boolean) {
    await this.update((c) => {
      c.startInTray = enabled;
    });
  }

  async setNotificationPref(channel: NotificationChannel, enabled: boolean) {
    await this.update((c) => {
      c.notificationPrefs[channel] = enabled;
    });
  }

  async markTrayHintShown() {
    if (this.config.hasShownTrayHint) return;
    await this.update((c) => {
      c.hasShownTrayHint = true;
    });
  }

  // ── Persistence-set helpers ────────────────────────────────────────────

  async setPersistEnabled(enabled: boolean) {
    await this.update((c) => {
      c.persist.enabled = enabled;
    });
  }

  async setPersistMode(mode: PersistenceMode) {
    await this.update((c) => {
      c.persist.mode = mode;
    });
  }

  async setPersistSystemTaskEnabled(enabled: boolean) {
    await this.update((c) => {
      c.persist.systemTaskEnabled = enabled;
    });
  }

  isPersistedTweak(id: string): boolean {
    return this.config.persist.tweakIds.includes(id);
  }

  /** Add a tweak id to the persistence set. No-op if persist is disabled OR
   *  the id is already there. The auto-tracking in `executor.ts` calls this
   *  on every applyTweak. */
  async addPersistedTweak(id: string) {
    if (!this.config.persist.enabled) return;
    if (this.config.persist.tweakIds.includes(id)) return;
    await this.update((c) => {
      c.persist.tweakIds = [...c.persist.tweakIds, id];
    });
  }

  async removePersistedTweak(id: string) {
    if (!this.config.persist.tweakIds.includes(id)) return;
    await this.update((c) => {
      c.persist.tweakIds = c.persist.tweakIds.filter((x) => x !== id);
    });
  }

  /** Replace the entire persistence set. Used by:
   *   - the "snapshot all currently-on tweaks" import on first enable
   *   - the v0.15.1 → v0.15.2 legacy migration after profile-id resolution */
  async setPersistedTweakIds(ids: string[]) {
    await this.update((c) => {
      c.persist.tweakIds = [...new Set(ids)];
    });
  }

  async recordPersistRun(driftCount: number): Promise<void> {
    await this.update((c) => {
      c.persist.lastCheck = Date.now();
      c.persist.lastDriftCount = driftCount;
      c.persist.totalDriftsFixed += driftCount;
    });
  }

  /** Mark the v0.15.1 legacy migration as done — call after the consumer has
   *  resolved persistedProfiles to flat tweak ids and committed them via
   *  setPersistedTweakIds. */
  markLegacyMigrated() {
    this.legacyProfilesMigrated = true;
  }

  async recordWuCheck(ts: number) {
    await this.update((c) => {
      c.lastWuCheck = ts;
    });
  }

  async recordDriverCheck(ts: number) {
    await this.update((c) => {
      c.lastDriverCheck = ts;
    });
  }

  async recordTick(ts: number) {
    await this.update((c) => {
      c.lastTick = ts;
    });
  }

  /** Throttle helper: returns true if the notification for this channel and
   *  hash should be suppressed (already sent within 24h). */
  shouldThrottle(channel: NotificationChannel, hash: string): boolean {
    const entry = this.config.throttle[channel];
    if (!entry) return false;
    const ageHours = (Date.now() - entry.at) / 3_600_000;
    return entry.hash === hash && ageHours < 24;
  }

  async recordThrottle(channel: NotificationChannel, hash: string) {
    await this.update((c) => {
      c.throttle[channel] = { hash, at: Date.now() };
    });
  }

  /** Attach to the Rust-emitted events. Called once at app boot. */
  async attach() {
    if (!isTauri()) return;
    if (this.#unlistenTick) return; // already attached
    this.#unlistenTick = await listen<{ ts: number; source: "auto" | "manual" }>(
      "service.tick",
      (e) => {
        const { ts, source } = e.payload;
        for (const h of this.#tickHandlers) {
          try {
            h(source, ts);
          } catch {}
        }
        void this.recordTick(ts);
      },
    );
    this.#unlistenTrigger = await listen("service.trigger-check", () => {
      const ts = Date.now();
      for (const h of this.#tickHandlers) {
        try {
          h("manual", ts);
        } catch {}
      }
    });
    this.#unlistenNavigate = await listen<string>("service.navigate", (e) => {
      const route = e.payload;
      if (this.#navigateHandler) this.#navigateHandler(route);
    });
  }

  detach() {
    this.#unlistenTick?.();
    this.#unlistenTrigger?.();
    this.#unlistenNavigate?.();
    this.#unlistenTick = null;
    this.#unlistenTrigger = null;
    this.#unlistenNavigate = null;
  }
}

export const service = new ServiceStore();
