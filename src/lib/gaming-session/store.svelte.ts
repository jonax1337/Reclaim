import {
  isTauri,
  sessionSnapshot,
  sessionKillProcesses,
  sessionSetPowerPlan,
  sessionSetDefenderRealtime,
  sessionStopServices,
  sessionRestoreServices,
  type SessionSnapshot,
} from "$lib/tweaks/bridge";
import { log } from "$lib/log.svelte";

const STORAGE_KEY = "reclaim.gaming-session";

export type SessionOptions = {
  /** GUID of the power plan to switch to during the session. */
  targetPowerPlan: string;
  /** Pause Defender real-time scanning for the duration of the session. */
  pauseDefender: boolean;
  /** Stop these services for the duration of the session. */
  stopServices: string[];
  /** Terminate these processes when the session starts. */
  killProcesses: string[];
};

export type ActiveSession = {
  startedAt: number;
  snapshot: SessionSnapshot;
  options: SessionOptions;
};

type Persisted = { active: ActiveSession | null };

function loadPersisted(): Persisted {
  if (typeof localStorage === "undefined") return { active: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { active: null };
    const data = JSON.parse(raw) as Persisted;
    if (data && typeof data === "object" && "active" in data) return data;
    return { active: null };
  } catch {
    return { active: null };
  }
}

function persist(state: Persisted) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

class GamingSessionStore {
  /** The currently-active session, or null when no session is running. */
  active = $state<ActiveSession | null>(null);
  /** True while start/end is in flight. */
  busy = $state<boolean>(false);
  /** Most recent error from start/end — surfaced as a toast by the route. */
  lastError = $state<string | null>(null);

  constructor() {
    this.active = loadPersisted().active;
  }

  get isActive() {
    return this.active !== null;
  }

  /** Starts a gaming session: snapshot first, then apply changes. */
  async start(options: SessionOptions): Promise<void> {
    if (!isTauri()) {
      this.lastError = "Gaming Session needs the built app — browser preview is read-only.";
      return;
    }
    if (this.busy || this.active) return;
    this.busy = true;
    this.lastError = null;
    try {
      log.info("gaming-session.start", "Gaming Session", "Capturing system snapshot");
      const snap = await sessionSnapshot();

      // Switch power plan first — gives the user a visible signal something is
      // happening even if the rest stalls.
      if (options.targetPowerPlan && options.targetPowerPlan !== snap.powerPlanGuid) {
        try {
          await sessionSetPowerPlan(options.targetPowerPlan);
        } catch (e) {
          log.warn("gaming-session.start", "Power plan", `Skipped: ${(e as Error).message}`);
        }
      }

      if (options.pauseDefender && snap.defenderRealtime) {
        try {
          await sessionSetDefenderRealtime(false);
        } catch (e) {
          log.warn("gaming-session.start", "Defender", `Skipped: ${(e as Error).message}`);
        }
      }

      if (options.stopServices.length > 0) {
        const results = await sessionStopServices(options.stopServices);
        const failed = results.filter((r) => !r.success);
        if (failed.length > 0) {
          log.warn(
            "gaming-session.start",
            "Services",
            `${failed.length} service(s) failed to stop`,
            failed.map((f) => `${f.name}: ${f.stderr}`).join("\n"),
          );
        }
      }

      if (options.killProcesses.length > 0) {
        const results = await sessionKillProcesses(options.killProcesses);
        const killed = results.filter((r) => r.success).length;
        log.info(
          "gaming-session.start",
          "Processes",
          `${killed}/${options.killProcesses.length} processes terminated`,
        );
      }

      this.active = {
        startedAt: Date.now(),
        snapshot: snap,
        options,
      };
      persist({ active: this.active });
      log.success("gaming-session.start", "Gaming Session", "Session active");
    } catch (e) {
      this.lastError = (e as Error).message ?? String(e);
      log.error("gaming-session.start", "Gaming Session", "Failed", this.lastError);
      throw e;
    } finally {
      this.busy = false;
    }
  }

  /** Ends the active session: reverse everything from the snapshot. */
  async end(): Promise<void> {
    if (!isTauri()) return;
    if (this.busy || !this.active) return;
    const snap = this.active.snapshot;
    this.busy = true;
    this.lastError = null;
    try {
      log.info("gaming-session.end", "Gaming Session", "Restoring previous state");

      if (snap.powerPlanGuid) {
        try {
          await sessionSetPowerPlan(snap.powerPlanGuid);
        } catch (e) {
          log.warn("gaming-session.end", "Power plan", `Skipped: ${(e as Error).message}`);
        }
      }

      if (snap.defenderRealtime) {
        try {
          await sessionSetDefenderRealtime(true);
        } catch (e) {
          log.warn("gaming-session.end", "Defender", `Skipped: ${(e as Error).message}`);
        }
      }

      const touched = this.active.options.stopServices;
      const restoreItems = snap.services.filter((s) => touched.includes(s.name));
      if (restoreItems.length > 0) {
        const results = await sessionRestoreServices(restoreItems);
        const failed = results.filter((r) => !r.success);
        if (failed.length > 0) {
          log.warn(
            "gaming-session.end",
            "Services",
            `${failed.length} service(s) failed to restore`,
            failed.map((f) => `${f.name}: ${f.stderr}`).join("\n"),
          );
        }
      }

      this.active = null;
      persist({ active: null });
      log.success("gaming-session.end", "Gaming Session", "Session ended");
    } catch (e) {
      this.lastError = (e as Error).message ?? String(e);
      log.error("gaming-session.end", "Gaming Session", "Failed", this.lastError);
      throw e;
    } finally {
      this.busy = false;
    }
  }

  /** Manually drop the persisted session record without doing any restore.
   *  Used by the crash-recovery offer: "I already cleaned up manually, drop this". */
  discardActive() {
    this.active = null;
    persist({ active: null });
  }
}

export const gamingSession = new GamingSessionStore();
