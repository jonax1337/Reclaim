// Frontend store for the background-service state (tray, autostart, interval,
// persisted profiles, notification prefs). Mirrors to localStorage for
// synchronous first paint and to <app_data_dir>/service.json for durability.
//
// The Rust-side Tokio timer in service.rs emits a `service.tick` event every
// N hours. We subscribe to it once at app boot and fan out to the persistence
// + update checkers. The store is the single source of truth for which
// profiles are persisted and which notifications are enabled.

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

export type PersistedProfile = {
  profileId: string;
  mode: PersistenceMode;
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
  persistedProfiles: PersistedProfile[];
  notificationPrefs: NotificationPrefs;
  throttle: Record<NotificationChannel, ThrottleEntry | null>;
};

const DEFAULT_CONFIG: ServiceConfig = {
  intervalHours: 6,
  startInTray: true,
  keepInTray: true,
  hasShownTrayHint: false,
  lastTick: 0,
  lastWuCheck: 0,
  lastDriverCheck: 0,
  persistedProfiles: [],
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

function mergeWithDefaults(parsed: unknown): ServiceConfig {
  if (!parsed || typeof parsed !== "object") return structuredClone(DEFAULT_CONFIG);
  const p = parsed as Partial<ServiceConfig>;
  const persistedProfiles = Array.isArray(p.persistedProfiles)
    ? p.persistedProfiles.filter(
        (x): x is PersistedProfile =>
          !!x &&
          typeof x === "object" &&
          typeof (x as PersistedProfile).profileId === "string" &&
          ((x as PersistedProfile).mode === "strict" ||
            (x as PersistedProfile).mode === "update-only"),
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
    persistedProfiles,
    notificationPrefs: { ...DEFAULT_CONFIG.notificationPrefs, ...(p.notificationPrefs ?? {}) },
    throttle: { ...DEFAULT_CONFIG.throttle, ...(p.throttle ?? {}) },
  };
}

type TickHandler = (source: "auto" | "manual", ts: number) => void;

class ServiceStore {
  config = $state<ServiceConfig>(readLocal());
  loaded = $state(false);
  ready: Promise<void>;

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
    try {
      const raw = await readAppFile(FILE_NAME);
      if (raw) {
        this.config = mergeWithDefaults(JSON.parse(raw));
        writeLocal(this.config);
      } else {
        await this.#persist();
      }
    } catch {
      // file unreadable — keep localStorage values
    }
    // Sync Rust-side state with the loaded config so the tick loop and the
    // close handler honor the user's last-saved choices.
    try {
      await serviceSetInterval(this.config.intervalHours);
    } catch {}
    try {
      await serviceSetKeepInTray(this.config.keepInTray);
    } catch {}
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

  isPersisted(profileId: string): boolean {
    return this.config.persistedProfiles.some((p) => p.profileId === profileId);
  }

  getPersisted(profileId: string): PersistedProfile | undefined {
    return this.config.persistedProfiles.find((p) => p.profileId === profileId);
  }

  async addPersisted(profileId: string, mode: PersistenceMode = "update-only") {
    if (this.isPersisted(profileId)) return;
    await this.update((c) => {
      c.persistedProfiles = [
        ...c.persistedProfiles,
        { profileId, mode, lastCheck: 0, lastDriftCount: 0, totalDriftsFixed: 0 },
      ];
    });
  }

  async removePersisted(profileId: string) {
    await this.update((c) => {
      c.persistedProfiles = c.persistedProfiles.filter((p) => p.profileId !== profileId);
    });
  }

  async setPersistedMode(profileId: string, mode: PersistenceMode) {
    await this.update((c) => {
      const p = c.persistedProfiles.find((x) => x.profileId === profileId);
      if (p) p.mode = mode;
    });
  }

  async recordPersistedRun(
    profileId: string,
    driftCount: number,
  ): Promise<void> {
    await this.update((c) => {
      const p = c.persistedProfiles.find((x) => x.profileId === profileId);
      if (p) {
        p.lastCheck = Date.now();
        p.lastDriftCount = driftCount;
        p.totalDriftsFixed += driftCount;
      }
    });
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
