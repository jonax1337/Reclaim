/**
 * Background watchers — pure lazy-load model.
 *
 * Pages are kept alive in App.svelte, so first visits trigger their own fetch
 * (and stay loaded forever), and re-visits restore component state. We don't
 * preload anything heavy at boot — that creates a CPU spike for data the user
 * may never look at.
 *
 * Two exceptions, both background-only, no UI gate:
 *   1. Windows Update search runs once a few seconds after boot. The toast
 *      watcher fires when it returns updates and the user isn't already on
 *      /windows-update.
 *   2. The NVIDIA driver lookup happens whenever hardware data first lands in
 *      the cache (which is whenever the user first visits /specs or /drivers).
 *      The toast fires if a newer version is available and the user isn't on
 *      /drivers at that moment.
 */

import { router, push } from "svelte-spa-router";
import { isTauri, searchWindowsUpdates } from "./tweaks/bridge";
import type { WuUpdate, NvidiaDriverInfo } from "./tweaks/bridge";
import { toast } from "./ui";
import { preloadResource } from "./cache.svelte";
import {
  wuUpdatesResource,
  nvidiaDriverResource,
  hardwareResource,
  K_WU_UPDATES,
} from "./route-cache.svelte";

let started = false;

function idle(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: timeoutMs });
    else setTimeout(resolve, 500);
  });
}

type GpuRow = { Name?: string; DriverVersion?: string };

function detectVendor(name: string | undefined): "nvidia" | "amd" | "intel" | "unknown" {
  if (!name) return "unknown";
  const n = name.toLowerCase();
  if (n.includes("nvidia") || n.includes("geforce") || n.includes("rtx") || n.includes("gtx")) {
    return "nvidia";
  }
  if (n.includes("amd") || n.includes("radeon") || n.includes("vega")) return "amd";
  if (n.includes("intel") || n.includes("uhd") || n.includes("iris") || n.includes("arc")) {
    return "intel";
  }
  return "unknown";
}

function nvidiaShortVersion(driverVersion: string | undefined): string {
  if (!driverVersion) return "";
  const parts = driverVersion.split(".");
  if (parts.length >= 4) {
    const last = parts[parts.length - 1] ?? "";
    const prev = parts[parts.length - 2] ?? "";
    const combined = `${prev.slice(-1)}${last}`;
    if (combined.length >= 5 && /^\d+$/.test(combined)) {
      const major = combined.slice(0, combined.length - 2);
      const minor = combined.slice(-2);
      return `${major}.${minor}`;
    }
  }
  return driverVersion;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-]/).map((s) => parseInt(s, 10) || 0);
  const pb = b.split(/[.\-]/).map((s) => parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

export function kickoffStartupPreloads(): void {
  if (started || !isTauri()) return;
  started = true;

  attachBackgroundWatchers();

  // Single background fetch: Windows Update. Wait for the browser to be idle
  // first so it doesn't compete with the user's initial interactions.
  void (async () => {
    await idle();
    await preloadResource(K_WU_UPDATES, () => searchWindowsUpdates(false), {
      ttl: 30 * 60_000,
    });
  })();
}

function attachBackgroundWatchers(): void {
  $effect.root(() => {
    // Windows Update — toast when data lands and user isn't on /windows-update.
    const wu = wuUpdatesResource();
    let wuToasted = false;
    $effect(() => {
      const data = wu.data as WuUpdate[] | undefined;
      if (!data || wuToasted) return;
      wuToasted = true;
      if (router.location === "/windows-update") return;
      if (data.length === 0) return;
      const count = data.length;
      const security = data.filter(
        (u) => /security/i.test(u.categories) || /security/i.test(u.severity),
      ).length;
      toast.action(
        `${count} Windows update${count === 1 ? "" : "s"} available`,
        { label: "View", onClick: () => push("/windows-update") },
        {
          description:
            security > 0
              ? `${security} security · click to review and install`
              : "Click to review and install",
          variant: "warning",
          duration: 8000,
        },
      );
    });

    // NVIDIA driver — fires whenever hardware data appears in the cache (the
    // first time the user visits /specs or /drivers). Looks up the latest
    // driver and toasts if a newer version is available.
    const hw = hardwareResource();
    let nvFired = false;
    let nvToasted = false;
    let nvGpuName: string | null = null;
    let nvInstalledVersion: string | undefined;
    $effect(() => {
      if (nvFired) return;
      const data = hw.data as { gpu?: GpuRow | GpuRow[] } | undefined;
      if (!data?.gpu) return;
      const raw = data.gpu;
      const gpus: GpuRow[] = Array.isArray(raw) ? raw : [raw];
      const nv = gpus.find((g) => detectVendor(g.Name) === "nvidia" && g.Name);
      if (!nv) {
        nvFired = true;
        return;
      }
      nvFired = true;
      nvGpuName = nv.Name!;
      nvInstalledVersion = nv.DriverVersion;
      nvidiaDriverResource(nvGpuName);
    });

    $effect(() => {
      if (nvToasted || !nvGpuName) return;
      const res = nvidiaDriverResource(nvGpuName);
      const latest = res.data as NvidiaDriverInfo | undefined;
      if (!latest) return;
      nvToasted = true;
      if (router.location === "/drivers") return;
      const installedShort = nvidiaShortVersion(nvInstalledVersion);
      if (!installedShort || compareVersions(latest.version, installedShort) <= 0) return;
      toast.action(
        `NVIDIA driver ${latest.version} available`,
        { label: "View", onClick: () => push("/drivers") },
        {
          description: `Installed: ${installedShort} · click to download`,
          variant: "warning",
          duration: 10_000,
        },
      );
    });
  });
}
