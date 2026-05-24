// Background WU + NVIDIA driver-update push checkers. Skip when on battery
// below 30% (network-heavy). Throttle so we don't re-notify about the same
// update within 24h. Click → opens Reclaim on the relevant route.
//
// AMD/Intel driver lookups are out of scope for v1 (no programmatic API). We
// detect them in the hardware list and just don't poll.

import { log } from "../log.svelte";
import { hashString, notify } from "../notify";
import { service } from "../service.svelte";
import {
  getHardwareInfo,
  getPowerState,
  lookupNvidiaDriver,
  searchWindowsUpdates,
} from "../tweaks/bridge";

const WU_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h
const DRIVER_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const LOW_BATTERY_PERCENT = 30;

/** True if we should skip network-heavy checks because the user is on
 *  battery and low. Desktop systems (no battery) always return false. */
async function isLowPower(): Promise<boolean> {
  try {
    const p = await getPowerState();
    if (!p.hasBattery) return false;
    return p.onBattery && p.percent < LOW_BATTERY_PERCENT;
  } catch {
    return false;
  }
}

export async function maybeCheckWindowsUpdates(force = false): Promise<void> {
  const sinceLast = Date.now() - service.config.lastWuCheck;
  if (!force && sinceLast < WU_CHECK_INTERVAL_MS) return;
  if (await isLowPower()) return;

  let updates: Awaited<ReturnType<typeof searchWindowsUpdates>> = [];
  try {
    updates = await searchWindowsUpdates(false);
  } catch (e) {
    log.warn("winupdate.found", "Windows Update", "Background check failed", String(e));
    return;
  }
  await service.recordWuCheck(Date.now());
  if (updates.length === 0) return;

  // De-dupe key: sorted set of update IDs. Same set within 24h → throttled.
  const ids = updates
    .map((u) => u.id)
    .sort()
    .join("|");
  const hash = hashString(ids);
  const top = updates[0];
  const titlePreview = top?.title ?? "Update available";
  const body =
    updates.length === 1
      ? `${titlePreview}`
      : `${updates.length} updates — top: ${titlePreview}`;
  await notify({
    channel: "windowsUpdateAvailable",
    title:
      updates.length === 1
        ? "Windows update available"
        : `${updates.length} Windows updates available`,
    body,
    hash,
    route: "/windows-update",
  });
  log.info(
    "winupdate.found",
    "Windows Update",
    `${updates.length} update(s) detected in background check`,
  );
}

type HardwareInfoShape = {
  gpu?: Array<{ Name?: string; DriverVersion?: string }>;
};

function extractNvidiaGpus(hw: unknown): Array<{ name: string; driverVersion: string }> {
  const out: Array<{ name: string; driverVersion: string }> = [];
  if (!hw || typeof hw !== "object") return out;
  const arr = (hw as HardwareInfoShape).gpu ?? [];
  for (const g of arr) {
    const name = (g?.Name ?? "").toString();
    if (!name) continue;
    if (!/nvidia|geforce|rtx|gtx|quadro/i.test(name)) continue;
    out.push({ name, driverVersion: (g?.DriverVersion ?? "").toString() });
  }
  return out;
}

/** Compare a Windows DriverVersion ("32.0.15.6094") to NVIDIA's marketing
 *  version ("560.94"). The last 5 digits of the Windows version mirror the
 *  marketing version: AAB.CD → ...AABCD. Naive substring check is enough to
 *  detect equality; anything else we treat as "newer available". */
function isNvidiaNewer(installed: string, marketing: string): boolean {
  const m = marketing.replace(/\./g, "");
  const installedDigits = installed.replace(/\D/g, "");
  if (!m || !installedDigits) return true;
  // The latest 5 digits of installedDigits should equal `m` if the version matches.
  const tail = installedDigits.slice(-m.length);
  return tail !== m;
}

export async function maybeCheckDriverUpdates(force = false): Promise<void> {
  const sinceLast = Date.now() - service.config.lastDriverCheck;
  if (!force && sinceLast < DRIVER_CHECK_INTERVAL_MS) return;
  if (await isLowPower()) return;

  let hw: unknown;
  try {
    hw = await getHardwareInfo();
  } catch {
    return;
  }
  await service.recordDriverCheck(Date.now());
  const gpus = extractNvidiaGpus(hw);
  if (gpus.length === 0) return;

  for (const gpu of gpus) {
    let info: Awaited<ReturnType<typeof lookupNvidiaDriver>>;
    try {
      info = await lookupNvidiaDriver(gpu.name);
    } catch {
      continue;
    }
    if (!info?.version) continue;
    if (!isNvidiaNewer(gpu.driverVersion, info.version)) continue;
    const hash = hashString(`nvidia:${gpu.name}:${info.version}`);
    await notify({
      channel: "driverUpdateAvailable",
      title: `New NVIDIA driver: ${info.version}`,
      body: `${gpu.name} — installed ${gpu.driverVersion || "?"}, latest ${info.version}`,
      hash,
      route: "/drivers",
    });
    log.info(
      "driver.update.found",
      gpu.name,
      `NVIDIA ${info.version} available (installed: ${gpu.driverVersion || "?"})`,
    );
  }
}
