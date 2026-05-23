/**
 * Central registry for route-level data caches.
 *
 * - Each route's heavy fetches are defined here once (key + fetcher).
 * - Components consume them via the `*Resource()` helpers.
 * - Sidebar `onmouseenter` calls `preloadRoute(path)` to warm the cache
 *   before the user clicks the nav item.
 */

import { cachedResource, type Resource } from "./cache.svelte";
import {
  listInstalledAppx,
  getAppxIcons,
  listStartupApps,
  resolveCommands,
  getFileIcons,
  listServices,
  listPowerPlans,
  getHardwareInfo,
  getSystemInfo,
  readHosts,
  hasHostsBackup,
  listActiveBlocklists,
  getDnsServers,
  contextMenuList,
  defenderStatus,
  defenderListExclusions,
  listScheduledTasks,
  recallStatus,
  firewallListBlocks,
  onedriveDetect,
  wingetAvailable,
  wingetVersion,
  wingetListInstalled,
  wingetListUpgradable,
  searchWindowsUpdates,
  lookupNvidiaDriver,
  regReadMany,
  type RegLocator,
  type AppxPackage,
  type StartupApp,
  type ServiceEntry,
  type PowerPlan,
  type HostsBlock,
  type AdapterDns,
  type ContextMenuEntry,
  type DefenderStatus,
  type DefenderExclusions,
  type ScheduledTask,
  type RecallStatus,
  type FirewallBlock,
  type OneDriveStatus,
  type SystemInfo,
  type WingetVersion,
  type WuUpdate,
  type NvidiaDriverInfo,
} from "./tweaks/bridge";
import { BLOATWARE } from "./tweaks/bloatware";
import { ALL_TWEAKS, type RegOp } from "./tweaks/catalog";
import { type TweakState } from "./tweaks/executor";

const SHORT = 30_000;
const MEDIUM = 60_000;
const LONG = 5 * 60_000;
const VERY_LONG = 30 * 60_000;

// ─── Bloatware ───────────────────────────────────────────────────────────────

export const K_BLOAT_INSTALLED = "bloatware.installed";
export const K_BLOAT_ICONS = "bloatware.icons";

function patternMatches(pattern: string, name: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$", "i");
  return re.test(name);
}

async function fetchBloatwareIcons(
  installed: AppxPackage[],
): Promise<Record<string, string>> {
  const patterns = BLOATWARE.filter((b) =>
    installed.some((p) => patternMatches(b.pattern, p.name)),
  ).map((b) => b.pattern);
  if (patterns.length === 0) return {};
  try {
    const fetched = await getAppxIcons(patterns);
    const out: Record<string, string> = {};
    for (const [pat, b64] of Object.entries(fetched)) {
      out[pat] = `data:image/png;base64,${b64}`;
    }
    return out;
  } catch {
    return {};
  }
}

export function bloatwareInstalledResource(): Resource<AppxPackage[]> {
  return cachedResource<AppxPackage[]>(K_BLOAT_INSTALLED, listInstalledAppx, {
    ttl: MEDIUM,
  });
}

export function bloatwareIconsResource(
  installed: AppxPackage[] | undefined,
): Resource<Record<string, string>> {
  const version = installed
    ? installed
        .map((p) => p.name)
        .sort()
        .join("|")
    : "__pending__";
  return cachedResource<Record<string, string>>(
    K_BLOAT_ICONS,
    () => fetchBloatwareIcons(installed ?? []),
    { ttl: LONG, version },
  );
}

export const BLOATWARE_KEYS = [K_BLOAT_INSTALLED, K_BLOAT_ICONS] as const;

// ─── Startup ─────────────────────────────────────────────────────────────────

export const K_STARTUP_APPS = "startup.apps";
export const K_STARTUP_PATHS = "startup.paths";
export const K_STARTUP_ICONS = "startup.icons";

export function startupAppsResource(): Resource<StartupApp[]> {
  return cachedResource<StartupApp[]>(K_STARTUP_APPS, listStartupApps, { ttl: MEDIUM });
}

function startupVersion(apps: StartupApp[] | undefined): string {
  if (!apps) return "__pending__";
  return apps
    .map((a) => a.id + ":" + a.command)
    .sort()
    .join("|");
}

export function startupPathsResource(
  apps: StartupApp[] | undefined,
): Resource<Record<string, string>> {
  return cachedResource<Record<string, string>>(
    K_STARTUP_PATHS,
    async () => {
      const cmds = (apps ?? []).map((a) => a.command).filter((c) => !c.startsWith("appx:"));
      if (cmds.length === 0) return {};
      try {
        return await resolveCommands(cmds);
      } catch {
        return {};
      }
    },
    { ttl: LONG, version: startupVersion(apps) },
  );
}

export function startupIconsResource(
  apps: StartupApp[] | undefined,
): Resource<Record<string, string>> {
  return cachedResource<Record<string, string>>(
    K_STARTUP_ICONS,
    async () => {
      const list = apps ?? [];
      const fileCmds = list.map((a) => a.command).filter((c) => !c.startsWith("appx:"));
      const appxPkgs = Array.from(
        new Set(
          list
            .map((a) => a.command)
            .filter((c) => c.startsWith("appx:"))
            .map((c) => c.slice(5).split("!")[0].split("_")[0])
            .filter(Boolean),
        ),
      );
      const out: Record<string, string> = {};
      if (fileCmds.length > 0) {
        try {
          const fileIcons = await getFileIcons(fileCmds);
          for (const [cmd, b64] of Object.entries(fileIcons)) {
            out[cmd] = `data:image/png;base64,${b64}`;
          }
        } catch {
          /* ignore */
        }
      }
      if (appxPkgs.length > 0) {
        try {
          const appxIcons = await getAppxIcons(appxPkgs);
          for (const [pkg, b64] of Object.entries(appxIcons)) {
            out[`appx:${pkg}`] = `data:image/png;base64,${b64}`;
          }
        } catch {
          /* ignore */
        }
      }
      return out;
    },
    { ttl: LONG, version: startupVersion(apps) },
  );
}

// ─── Services ────────────────────────────────────────────────────────────────

export const K_SERVICES = "services.list";
export function servicesResource(): Resource<ServiceEntry[]> {
  return cachedResource<ServiceEntry[]>(K_SERVICES, listServices, { ttl: SHORT });
}

// ─── Specs ───────────────────────────────────────────────────────────────────

export const K_HW = "specs.hardware";
export const K_SYSINFO = "specs.systeminfo";
export function hardwareResource(): Resource<unknown> {
  return cachedResource<unknown>(K_HW, getHardwareInfo, { ttl: LONG });
}
export function systemInfoResource(): Resource<SystemInfo> {
  return cachedResource<SystemInfo>(K_SYSINFO, getSystemInfo, { ttl: LONG });
}

// ─── Hosts ───────────────────────────────────────────────────────────────────

export const K_HOSTS_CONTENT = "hosts.content";
export const K_HOSTS_BACKUP = "hosts.backup";
export const K_HOSTS_ACTIVE = "hosts.active";
export function hostsContentResource(): Resource<string> {
  return cachedResource<string>(K_HOSTS_CONTENT, readHosts, { ttl: SHORT });
}
export function hostsBackupResource(): Resource<boolean> {
  return cachedResource<boolean>(K_HOSTS_BACKUP, hasHostsBackup, { ttl: SHORT });
}
export function hostsActiveResource(): Resource<HostsBlock[]> {
  return cachedResource<HostsBlock[]>(K_HOSTS_ACTIVE, listActiveBlocklists, { ttl: SHORT });
}

// ─── Network ─────────────────────────────────────────────────────────────────

export const K_DNS = "network.dns";
export function dnsResource(): Resource<AdapterDns[]> {
  return cachedResource<AdapterDns[]>(K_DNS, getDnsServers, { ttl: SHORT });
}

// ─── Context Menu ────────────────────────────────────────────────────────────

export const K_CTXMENU = "context-menu.list";
export function contextMenuResource(): Resource<ContextMenuEntry[]> {
  return cachedResource<ContextMenuEntry[]>(K_CTXMENU, contextMenuList, { ttl: MEDIUM });
}

// ─── Defender ────────────────────────────────────────────────────────────────

export const K_DEFENDER_STATUS = "defender.status";
export const K_DEFENDER_EXCLUSIONS = "defender.exclusions";
export function defenderStatusResource(): Resource<DefenderStatus> {
  return cachedResource<DefenderStatus>(K_DEFENDER_STATUS, defenderStatus, { ttl: SHORT });
}
export function defenderExclusionsResource(): Resource<DefenderExclusions> {
  return cachedResource<DefenderExclusions>(K_DEFENDER_EXCLUSIONS, defenderListExclusions, {
    ttl: SHORT,
  });
}

// ─── Scheduled tasks ─────────────────────────────────────────────────────────

export const K_SCHTASKS = "schtasks.list";
export function scheduledTasksResource(): Resource<ScheduledTask[]> {
  return cachedResource<ScheduledTask[]>(K_SCHTASKS, listScheduledTasks, { ttl: MEDIUM });
}

// ─── Recall ──────────────────────────────────────────────────────────────────

export const K_RECALL_STATUS = "recall.status";
export function recallStatusResource(): Resource<RecallStatus> {
  return cachedResource<RecallStatus>(K_RECALL_STATUS, recallStatus, { ttl: SHORT });
}

// ─── Firewall blocks ─────────────────────────────────────────────────────────

export const K_FIREWALL_BLOCKS = "firewall.blocks";
export function firewallBlocksResource(): Resource<FirewallBlock[]> {
  return cachedResource<FirewallBlock[]>(K_FIREWALL_BLOCKS, firewallListBlocks, {
    ttl: SHORT,
  });
}

// ─── OneDrive ────────────────────────────────────────────────────────────────

export const K_ONEDRIVE = "onedrive.status";
export function oneDriveResource(): Resource<OneDriveStatus> {
  return cachedResource<OneDriveStatus>(K_ONEDRIVE, onedriveDetect, { ttl: SHORT });
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

export const K_POWER_PLANS = "maintenance.powerplans";
export function powerPlansResource(): Resource<PowerPlan[]> {
  return cachedResource<PowerPlan[]>(K_POWER_PLANS, listPowerPlans, { ttl: MEDIUM });
}

// ─── Apps (winget) ───────────────────────────────────────────────────────────

export const K_WINGET_AVAIL = "apps.winget.available";
export const K_WINGET_VER = "apps.winget.version";
export const K_WINGET_INSTALLED = "apps.winget.installed";
export const K_WINGET_UPGRADABLE = "apps.winget.upgradable";

export function wingetAvailableResource(): Resource<boolean> {
  return cachedResource<boolean>(K_WINGET_AVAIL, wingetAvailable, { ttl: LONG });
}
export function wingetVersionResource(): Resource<WingetVersion> {
  return cachedResource<WingetVersion>(K_WINGET_VER, wingetVersion, { ttl: LONG });
}
export function wingetInstalledResource(): Resource<string> {
  return cachedResource<string>(K_WINGET_INSTALLED, wingetListInstalled, { ttl: MEDIUM });
}
export function wingetUpgradableResource(): Resource<string> {
  return cachedResource<string>(K_WINGET_UPGRADABLE, wingetListUpgradable, { ttl: MEDIUM });
}

// ─── Tweak states (shared by Dashboard + every tweak page) ───────────────────

export const K_TWEAK_STATES = "tweaks.all-states";

/**
 * Read every tweak's state in a single Rust round-trip.
 *
 * The previous implementation fired ~300 individual reg_read invokes which —
 * because reg_read was a sync Tauri command — serialized through the IPC main
 * thread and froze the UI for ~1 second while it drained. The bulk path here
 * sends one `reg_read_many` call; Rust runs the actual registry I/O on a
 * blocking task pool and returns all results at once.
 */
export async function fetchAllTweakStates(): Promise<Record<string, TweakState>> {
  // Flatten every reg check from every tweak into one locator list, remembering
  // the (tweak, expected-value) for each slot so we can reassemble the per-tweak
  // verdict after the bulk read returns.
  const locators: RegLocator[] = [];
  const expected: Array<number | string> = [];
  const checkCount: number[] = new Array(ALL_TWEAKS.length).fill(0);

  for (let i = 0; i < ALL_TWEAKS.length; i++) {
    const t = ALL_TWEAKS[i];
    const checks = (t.check ?? t.apply).filter((o): o is RegOp => o.kind === "reg");
    for (const c of checks) {
      locators.push({ hive: c.hive, path: c.path, name: c.name });
      expected.push(c.value);
      checkCount[i]++;
    }
  }

  let values: Array<string | number | null> = [];
  try {
    values = await regReadMany(locators);
  } catch {
    // If the bulk call fails entirely, mark every tweak as unknown.
    const fallback: Record<string, TweakState> = {};
    for (const t of ALL_TWEAKS) fallback[t.id] = "unknown";
    return fallback;
  }

  const states: Record<string, TweakState> = {};
  let cursor = 0;
  for (let i = 0; i < ALL_TWEAKS.length; i++) {
    const count = checkCount[i];
    if (count === 0) {
      states[ALL_TWEAKS[i].id] = "unknown";
      continue;
    }
    let on = true;
    for (let j = 0; j < count; j++) {
      const v = values[cursor + j];
      if (v === null || v !== expected[cursor + j]) {
        on = false;
        break;
      }
    }
    states[ALL_TWEAKS[i].id] = on ? "on" : "off";
    cursor += count;
  }
  return states;
}

export function tweakStatesResource(): Resource<Record<string, TweakState>> {
  return cachedResource<Record<string, TweakState>>(K_TWEAK_STATES, fetchAllTweakStates, {
    ttl: MEDIUM,
  });
}

// ─── Windows Update ──────────────────────────────────────────────────────────

export const K_WU_UPDATES = "wu.updates";
export function wuUpdatesResource(): Resource<WuUpdate[]> {
  return cachedResource<WuUpdate[]>(
    K_WU_UPDATES,
    () => searchWindowsUpdates(false),
    { ttl: VERY_LONG },
  );
}

// ─── GPU drivers (NVIDIA) ────────────────────────────────────────────────────

export const K_NVIDIA_DRIVER = "drivers.nvidia.latest";
export function nvidiaDriverResource(gpuName: string): Resource<NvidiaDriverInfo> {
  return cachedResource<NvidiaDriverInfo>(
    K_NVIDIA_DRIVER,
    () => lookupNvidiaDriver(gpuName),
    { ttl: VERY_LONG, version: gpuName },
  );
}

