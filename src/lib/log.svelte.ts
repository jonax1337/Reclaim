import { isTauri, logAppend } from "./tweaks/bridge";

export type LogLevel = "info" | "success" | "warn" | "error";

export type LogAction =
  | "tweak.apply"
  | "tweak.revert"
  | "appx.remove"
  | "system.restore_point"
  | "system.explorer_restart"
  | "system.boot"
  | "network.blocklist_apply"
  | "network.blocklist_remove"
  | "network.hosts_edit"
  | "network.hosts_restore"
  | "network.dns_set"
  | "network.dns_reset"
  | "network.doh_set"
  | "app.install"
  | "app.uninstall"
  | "app.upgrade"
  | "maintenance.run"
  | "power.set"
  | "power.unlock"
  | "onedrive.backup"
  | "onedrive.uninstall"
  | "context_menu.toggle"
  | "defender.toggle"
  | "defender.exclusion.add"
  | "defender.exclusion.remove"
  | "schtasks.toggle"
  | "schtasks.run"
  | "schtasks.delete"
  | "recall.wipe"
  | "driver.rollback"
  | "activation.launch"
  | "app.update"
  | "iso.unattend.save"
  | "service.tick"
  | "persistence.profile.added"
  | "persistence.profile.removed"
  | "persistence.check.completed"
  | "persistence.drift.fixed"
  | "persistence.reapply.failed"
  | "persistence.migrate"
  | "notification.sent"
  | "winupdate.found"
  | "driver.update.found";

export type LogEntry = {
  id: number;
  ts: number;
  level: LogLevel;
  action: LogAction;
  target: string;
  message: string;
  details?: string;
};

const STORAGE_KEY = "reclaim.activity-log";
const MAX_ENTRIES = 500;
let nextId = 1;

function load(): LogEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as LogEntry[];
    if (!Array.isArray(arr)) return [];
    if (arr.length > 0) nextId = Math.max(...arr.map((e) => e.id)) + 1;
    return arr;
  } catch {
    return [];
  }
}

function persist(entries: LogEntry[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

class LogStore {
  entries = $state<LogEntry[]>(load());

  push(entry: Omit<LogEntry, "id" | "ts">) {
    const full: LogEntry = {
      id: nextId++,
      ts: Date.now(),
      ...entry,
    };
    const next = [full, ...this.entries].slice(0, MAX_ENTRIES);
    this.entries = next;
    persist(next);
    // Crash-safe backup: append to %APPDATA%/Reclaim/activity.log (or
    // <exe-dir>/data in portable mode). Fire-and-forget — never blocks.
    if (isTauri()) {
      logAppend({
        ts: full.ts,
        level: full.level,
        action: full.action,
        target: full.target,
        message: full.message,
        details: full.details,
      }).catch(() => {});
    }
  }

  info(action: LogAction, target: string, message: string, details?: string) {
    this.push({ level: "info", action, target, message, details });
  }
  success(action: LogAction, target: string, message: string, details?: string) {
    this.push({ level: "success", action, target, message, details });
  }
  warn(action: LogAction, target: string, message: string, details?: string) {
    this.push({ level: "warn", action, target, message, details });
  }
  error(action: LogAction, target: string, message: string, details?: string) {
    this.push({ level: "error", action, target, message, details });
  }

  clear() {
    this.entries = [];
    persist([]);
  }
}

export const log = new LogStore();

export const ACTION_LABELS: Record<LogAction, string> = {
  "tweak.apply": "Tweak applied",
  "tweak.revert": "Tweak reverted",
  "appx.remove": "App removed",
  "system.restore_point": "Restore point",
  "system.explorer_restart": "Explorer restarted",
  "system.boot": "Session started",
  "network.blocklist_apply": "Blocklist applied",
  "network.blocklist_remove": "Blocklist removed",
  "network.hosts_edit": "Hosts edited",
  "network.hosts_restore": "Hosts restored",
  "network.dns_set": "DNS changed",
  "network.dns_reset": "DNS reset",
  "network.doh_set": "DoH configured",
  "app.install": "App installed",
  "app.uninstall": "App uninstalled",
  "app.upgrade": "App upgraded",
  "maintenance.run": "Maintenance",
  "power.set": "Power plan",
  "power.unlock": "Power plan unlocked",
  "onedrive.backup": "OneDrive backup",
  "onedrive.uninstall": "OneDrive removed",
  "context_menu.toggle": "Shell extension toggled",
  "defender.toggle": "Defender setting toggled",
  "defender.exclusion.add": "Defender exclusion added",
  "defender.exclusion.remove": "Defender exclusion removed",
  "schtasks.toggle": "Scheduled task toggled",
  "schtasks.run": "Scheduled task run",
  "schtasks.delete": "Scheduled task deleted",
  "recall.wipe": "Recall data wiped",
  "driver.rollback": "Driver rolled back",
  "activation.launch": "Activation script launched",
  "app.update": "App updated",
  "iso.unattend.save": "autounattend.xml saved",
  "service.tick": "Background check",
  "persistence.profile.added": "Profile persistence enabled",
  "persistence.profile.removed": "Profile persistence disabled",
  "persistence.check.completed": "Persistence check",
  "persistence.drift.fixed": "Drift re-applied",
  "persistence.reapply.failed": "Re-apply failed",
  "persistence.migrate": "Persistence migrated",
  "notification.sent": "Notification sent",
  "winupdate.found": "Windows updates available",
  "driver.update.found": "Driver update available",
};
