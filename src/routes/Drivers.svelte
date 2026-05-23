<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Dialog, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    MonitorSmartphone,
    ExternalLink,
    Shield,
    Download,
    Search,
    FolderOpen,
    Play,
    CheckCircle2,
    AlertTriangle,
    Wand2,
    Trash2,
    Package,
    Filter,
  } from "@lucide/svelte";
  import {
    isTauri,
    downloadDriver,
    launchInstaller,
    revealInExplorer,
    openDriverSearch,
    listDriverPackages,
    deleteDriverPackage,
    type NvidiaDriverInfo,
    type DriverPackage,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import { log } from "$lib/log.svelte";
  import {
    hardwareResource,
    systemInfoResource,
    nvidiaDriverResource,
    K_NVIDIA_DRIVER,
  } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  type GpuRow = {
    Name?: string;
    DriverVersion?: string;
    DriverDate?: string | { value?: string };
    AdapterRAM?: number;
    CurrentHorizontalResolution?: number;
    CurrentVerticalResolution?: number;
    CurrentRefreshRate?: number;
  };

  type Vendor = "nvidia" | "amd" | "intel" | "unknown";

  type GpuState = {
    gpu: GpuRow;
    vendor: Vendor;
    latest?: NvidiaDriverInfo;
    checking: boolean;
    checkError?: string;
    downloading: boolean;
    downloadProgress: number;
    downloadTotal: number;
    downloadedPath?: string;
  };

  const hwRes = hardwareResource();
  const sysRes = systemInfoResource();

  const gpus = $derived.by<GpuRow[]>(() => {
    const data = hwRes.data as { gpu?: GpuRow | GpuRow[] } | undefined;
    const raw = data?.gpu;
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  });

  const loading = $derived(hwRes.loading && !hwRes.data);
  const error = $derived<string | null>(hwRes.error ? String(hwRes.error) : null);

  const osLabel = $derived.by(() => {
    if (!sysRes.data) return "Windows 11";
    const buildNum = parseInt(sysRes.data.build.split(".")[0] ?? "0", 10);
    return buildNum >= 22000 ? "Windows 11" : "Windows 10 64-bit";
  });

  // Component-local UI state (selection, download progress) merged on top of
  // the derived gpu list. NVIDIA "latest" lookups live in the cache.
  type LocalState = {
    checking: boolean;
    checkError?: string;
    downloading: boolean;
    downloadProgress: number;
    downloadTotal: number;
    downloadedPath?: string;
  };
  let local = $state<LocalState[]>([]);

  // Keep local state aligned with the GPU list length.
  $effect(() => {
    const n = gpus.length;
    if (local.length !== n) {
      const next: LocalState[] = [];
      for (let i = 0; i < n; i++) {
        next.push(
          local[i] ?? {
            checking: false,
            downloading: false,
            downloadProgress: 0,
            downloadTotal: 0,
          },
        );
      }
      local = next;
    }
  });

  const gpuStates = $derived<GpuState[]>(
    gpus.map((gpu, i) => {
      const vendor = detectVendor(gpu.Name);
      const cached =
        vendor === "nvidia" && gpu.Name
          ? nvidiaDriverResource(gpu.Name).data
          : undefined;
      const l =
        local[i] ?? {
          checking: false,
          downloading: false,
          downloadProgress: 0,
          downloadTotal: 0,
        };
      return {
        gpu,
        vendor,
        latest: cached,
        checking: l.checking,
        checkError: l.checkError,
        downloading: l.downloading,
        downloadProgress: l.downloadProgress,
        downloadTotal: l.downloadTotal,
        downloadedPath: l.downloadedPath,
      };
    }),
  );

  let unlisteners: UnlistenFn[] = [];

  function patchLocal(i: number, patch: Partial<LocalState>) {
    const next = [...local];
    next[i] = { ...next[i], ...patch };
    local = next;
  }

  function detectVendor(name: string | undefined): Vendor {
    if (!name) return "unknown";
    const n = name.toLowerCase();
    if (
      n.includes("nvidia") ||
      n.includes("geforce") ||
      n.includes("quadro") ||
      n.includes("rtx") ||
      n.includes("gtx")
    )
      return "nvidia";
    if (n.includes("amd") || n.includes("radeon") || n.includes("vega")) return "amd";
    if (
      n.includes("intel") ||
      n.includes("uhd") ||
      n.includes("iris") ||
      n.includes("arc")
    )
      return "intel";
    return "unknown";
  }

  function vendorUrl(v: Vendor): string {
    switch (v) {
      case "nvidia":
        return "https://www.nvidia.com/Download/index.aspx";
      case "amd":
        return "https://www.amd.com/en/support";
      case "intel":
        return "https://www.intel.com/content/www/us/en/download-center/home.html";
      default:
        return "";
    }
  }

  function vendorLabel(v: Vendor): string {
    switch (v) {
      case "nvidia":
        return "NVIDIA";
      case "amd":
        return "AMD";
      case "intel":
        return "Intel";
      default:
        return "Vendor";
    }
  }

  function formatBytes(bytes: number | undefined): string {
    if (!bytes || bytes <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
  }

  function formatPsDate(v: string | { value?: string } | undefined): string {
    if (!v) return "—";
    const raw = typeof v === "string" ? v : v.value;
    if (!raw) return "—";
    const match = raw.match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if (match) return `${match[3]}.${match[2]}.${match[1]}`;
    return raw;
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

  async function load() {
    invalidate("specs.hardware");
    invalidate("specs.systeminfo");
    invalidate(K_NVIDIA_DRIVER);
    await Promise.all([hwRes.refresh(), sysRes.refresh()]);
  }

  async function checkLatest(i: number) {
    const s = gpuStates[i];
    if (!s || s.checking) return;
    if (s.vendor !== "nvidia") {
      toast.show("Auto-check only for NVIDIA", {
        description: "AMD / Intel updates: use Windows Update or the vendor page.",
      });
      return;
    }
    if (!s.gpu.Name) return;
    patchLocal(i, { checking: true, checkError: undefined });
    try {
      // Force a fresh lookup (invalidate so the cached value is replaced).
      invalidate(K_NVIDIA_DRIVER);
      const res = nvidiaDriverResource(s.gpu.Name);
      const latest = await res.refresh();
      if (latest) {
        log.info(
          "system.boot",
          s.gpu.Name,
          `NVIDIA latest driver ${latest.version} (${latest.releaseDate})`,
        );
      }
      patchLocal(i, { checking: false });
    } catch (e) {
      patchLocal(i, { checking: false, checkError: String(e) });
      toast.error("Driver lookup failed", String(e));
    }
  }

  async function downloadAndPrepare(i: number) {
    const s = gpuStates[i];
    if (!s || !s.latest || s.downloading) return;
    const url = s.latest.downloadUrl;
    if (!url) {
      toast.error("No download URL");
      return;
    }
    const filename = `${vendorLabel(s.vendor)}-${s.latest.version}-${osLabel.replace(/\s+/g, "_")}.exe`;
    patchLocal(i, {
      downloading: true,
      downloadProgress: 0,
      downloadTotal: 0,
      downloadedPath: undefined,
    });
    try {
      const result = await downloadDriver(url, filename);
      patchLocal(i, { downloading: false, downloadedPath: result.path });
      log.success(
        "system.boot",
        s.gpu.Name ?? "GPU",
        `Downloaded ${vendorLabel(s.vendor)} driver ${s.latest.version}`,
        result.path,
      );
      toast.success(`Driver ${s.latest.version} downloaded`, "Click Launch installer to install.");
    } catch (e) {
      patchLocal(i, { downloading: false });
      toast.error("Download failed", String(e));
      log.error("system.boot", s.gpu.Name ?? "GPU", "Driver download failed", String(e));
    }
  }

  async function runInstaller(i: number) {
    const s = gpuStates[i];
    if (!s?.downloadedPath) return;
    try {
      await launchInstaller(s.downloadedPath);
      toast.success("Installer launched", "Accept the UAC prompt to continue.");
    } catch (e) {
      toast.error("Could not launch installer", String(e));
    }
  }

  async function showInFolder(i: number) {
    const s = gpuStates[i];
    if (!s?.downloadedPath) return;
    try {
      await revealInExplorer(s.downloadedPath);
    } catch (e) {
      toast.error("Could not open folder", String(e));
    }
  }

  async function openVendor(v: Vendor) {
    const url = vendorUrl(v);
    if (!url) return;
    try {
      await openUrl(url);
    } catch {
      toast.error("Could not open browser", url);
    }
  }

  async function openVendorSearch(v: Vendor, gpuName: string | undefined) {
    if (!gpuName) return openVendor(v);
    if (v === "amd" || v === "intel" || v === "nvidia") {
      try {
        await openDriverSearch(v, gpuName, osLabel);
        return;
      } catch (e) {
        toast.error("Could not open vendor search", String(e));
      }
    }
    const q = encodeURIComponent(gpuName);
    const url =
      v === "amd"
        ? `https://www.amd.com/en/search?keyword=${q}`
        : v === "intel"
          ? `https://www.intel.com/content/www/us/en/search.html?ws=text&q=${q}`
          : "";
    if (!url) return openVendor(v);
    try {
      await openUrl(url);
    } catch {
      toast.error("Could not open browser", url);
    }
  }

  onMount(async () => {
    const startUn = await listen<{ total: number; path: string }>(
      "driver-download:start",
      (e) => {
        for (let i = 0; i < local.length; i++) {
          if (local[i].downloading) {
            patchLocal(i, { downloadTotal: e.payload.total });
            break;
          }
        }
      },
    );
    const progUn = await listen<{ downloaded: number; total: number }>(
      "driver-download:progress",
      (e) => {
        for (let i = 0; i < local.length; i++) {
          if (local[i].downloading) {
            patchLocal(i, {
              downloadProgress: e.payload.downloaded,
              downloadTotal: e.payload.total || local[i].downloadTotal,
            });
            break;
          }
        }
      },
    );
    unlisteners.push(startUn, progUn);
  });

  onDestroy(() => {
    for (const un of unlisteners) un();
  });

  function updateAvailable(s: GpuState): boolean {
    if (!s.latest || !s.gpu.DriverVersion) return false;
    const current = nvidiaShortVersion(s.gpu.DriverVersion);
    return compareVersions(s.latest.version, current) > 0;
  }

  // ---- Installed driver packages (pnputil-backed rollback) ----
  type ClassFilter = "Display" | "Net" | "Sound, video and game controllers" | "all";
  let packageClass = $state<ClassFilter>("Display");
  let packages = $state<DriverPackage[]>([]);
  let packagesLoading = $state(false);
  let packagesLoaded = $state(false);
  let packageBusy = $state<Set<string>>(new Set());
  let rollbackOpen = $state(false);
  let rollbackTarget = $state<DriverPackage | null>(null);

  async function loadPackages() {
    if (!isTauri()) return;
    packagesLoading = true;
    try {
      const filter = packageClass === "all" ? undefined : packageClass;
      packages = await listDriverPackages(filter);
      packagesLoaded = true;
    } catch (e) {
      toast.error("pnputil failed", String(e));
    } finally {
      packagesLoading = false;
    }
  }

  function askRollback(p: DriverPackage) {
    rollbackTarget = p;
    rollbackOpen = true;
  }

  async function confirmRollback() {
    if (!rollbackTarget) return;
    const p = rollbackTarget;
    rollbackOpen = false;
    rollbackTarget = null;
    if (packageBusy.has(p.publishedName)) return;
    packageBusy = new Set(packageBusy).add(p.publishedName);
    try {
      await deleteDriverPackage(p.publishedName, true);
      log.success("driver.rollback", `${p.provider} ${p.version}`, `Deleted ${p.publishedName}`);
      toast.success(`${p.publishedName} removed`, "Windows will fall back to the previous driver or its default.");
      await loadPackages();
    } catch (e) {
      toast.error("Rollback failed", String(e));
      log.error("driver.rollback", p.publishedName, "Failed", String(e));
    } finally {
      const after = new Set(packageBusy);
      after.delete(p.publishedName);
      packageBusy = after;
    }
  }

  $effect(() => {
    // Refetch when class filter changes (after first load).
    packageClass;
    if (packagesLoaded) void loadPackages();
  });
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Graphics drivers</h1>
    <p class="text-sm text-muted-foreground mt-1">
      NVIDIA: direct API lookup + download + launch — no GeForce Experience, no browser detour.
    </p>
  </div>
  <Button variant="outline" onclick={load} disabled={loading}>
    <RefreshCw class={loading ? "animate-spin" : ""} />
    Refresh
  </Button>
</header>

{#if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — hardware queries need the built app.
    </div>
  </Card>
{:else if loading}
  <div class="grid place-items-center py-16 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Detecting graphics hardware…
  </div>
{:else if error}
  <Card class="card-inset border-destructive/40">
    <CardContent>
      <p class="text-sm text-destructive">{error}</p>
    </CardContent>
  </Card>
{:else if gpuStates.length === 0}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">No graphics adapters found.</div>
  </Card>
{:else}
  <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
    Graphics adapters
  </h2>
  <div class="flex flex-col gap-4">
    {#each gpuStates as s, i (i)}
      {@const gpu = s.gpu}
      {@const hasUpdate = updateAvailable(s)}
      {@const downloadPct =
        s.downloadTotal > 0 ? Math.round((s.downloadProgress / s.downloadTotal) * 100) : 0}
      <Card class="card-inset">
        <CardHeader>
          <div class="flex items-center gap-2 flex-wrap">
            <MonitorSmartphone class="size-4 text-primary" />
            <CardTitle>{gpu.Name ?? "Unknown GPU"}</CardTitle>
            {#if s.vendor !== "unknown"}
              <Badge variant="outline">{vendorLabel(s.vendor)}</Badge>
            {/if}
            {#if s.latest && !hasUpdate}
              <Badge variant="success">
                <CheckCircle2 class="size-2.5" />
                Up to date
              </Badge>
            {:else if hasUpdate}
              <Badge variant="warning">
                <AlertTriangle class="size-2.5" />
                Update available
              </Badge>
            {/if}
          </div>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
            <div>
              <div class="text-[10px] uppercase tracking-wider text-muted-foreground">
                Installed
              </div>
              <div class="font-medium font-mono text-xs">
                {gpu.DriverVersion ?? "—"}
                {#if s.vendor === "nvidia" && gpu.DriverVersion}
                  <span class="text-muted-foreground">({nvidiaShortVersion(gpu.DriverVersion)})</span>
                {/if}
              </div>
            </div>
            <div>
              <div class="text-[10px] uppercase tracking-wider text-muted-foreground">
                Driver date
              </div>
              <div class="font-medium tabular-nums">{formatPsDate(gpu.DriverDate)}</div>
            </div>
            <div>
              <div class="text-[10px] uppercase tracking-wider text-muted-foreground">
                {s.latest ? "Latest available" : "VRAM"}
              </div>
              <div class="font-medium {s.latest ? 'font-mono text-xs' : 'tabular-nums'}">
                {#if s.latest}
                  {s.latest.version}
                  <span class="text-muted-foreground">({s.latest.releaseDate})</span>
                {:else}
                  {formatBytes(gpu.AdapterRAM)}
                {/if}
              </div>
            </div>
            <div>
              <div class="text-[10px] uppercase tracking-wider text-muted-foreground">
                {s.latest ? "Driver type" : "Current mode"}
              </div>
              <div class="font-medium text-xs">
                {#if s.latest}
                  {s.latest.name}
                {:else if gpu.CurrentHorizontalResolution && gpu.CurrentVerticalResolution}
                  {gpu.CurrentHorizontalResolution}×{gpu.CurrentVerticalResolution}
                  {#if gpu.CurrentRefreshRate}@ {gpu.CurrentRefreshRate} Hz{/if}
                {:else}
                  —
                {/if}
              </div>
            </div>
          </div>

          {#if s.checkError}
            <p class="text-xs text-destructive mb-3">{s.checkError}</p>
          {/if}

          {#if s.downloading}
            <div class="mb-3">
              <div class="flex items-baseline justify-between text-xs mb-1.5">
                <span class="text-muted-foreground">
                  Downloading {s.latest?.version}…
                </span>
                <span class="tabular-nums">
                  {formatBytes(s.downloadProgress)} / {formatBytes(s.downloadTotal)}
                  <span class="text-muted-foreground">({downloadPct}%)</span>
                </span>
              </div>
              <div class="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  class="h-full rounded-full bg-primary transition-all duration-200"
                  style="width: {downloadPct}%"
                ></div>
              </div>
            </div>
          {:else if s.downloadedPath}
            <div class="mb-3 p-2 rounded-md bg-success/10 border border-success/30 text-xs">
              <div class="font-medium text-success mb-0.5">Installer downloaded</div>
              <div class="font-mono text-muted-foreground break-all">{s.downloadedPath}</div>
            </div>
          {/if}

          <div class="flex flex-wrap gap-2">
            {#if s.vendor === "nvidia"}
              {#if !s.latest}
                <Button size="sm" onclick={() => checkLatest(i)} disabled={s.checking}>
                  {#if s.checking}
                    <Loader2 class="animate-spin" />
                    Checking…
                  {:else}
                    <Search />
                    Check for latest
                  {/if}
                </Button>
              {:else if !s.downloadedPath}
                {#if hasUpdate}
                  <Button size="sm" onclick={() => downloadAndPrepare(i)} disabled={s.downloading}>
                    {#if s.downloading}
                      <Loader2 class="animate-spin" />
                      Downloading…
                    {:else}
                      <Download />
                      Download {s.latest.version}
                    {/if}
                  </Button>
                {:else}
                  <Button size="sm" variant="outline" onclick={() => checkLatest(i)} disabled={s.checking}>
                    <RefreshCw class={s.checking ? "animate-spin" : ""} />
                    Re-check
                  </Button>
                {/if}
              {:else}
                <Button size="sm" onclick={() => runInstaller(i)}>
                  <Play />
                  Launch installer
                </Button>
                <Button size="sm" variant="outline" onclick={() => showInFolder(i)}>
                  <FolderOpen />
                  Show in folder
                </Button>
              {/if}
            {/if}
            {#if s.vendor === "amd" || s.vendor === "intel"}
              <Button size="sm" onclick={() => openVendorSearch(s.vendor, gpu.Name)}>
                <Wand2 />
                Auto-find {vendorLabel(s.vendor)} drivers
              </Button>
            {/if}
            {#if s.vendor !== "unknown"}
              <Button size="sm" variant="ghost" onclick={() => openVendor(s.vendor)}>
                <ExternalLink />
                {vendorLabel(s.vendor)} site
              </Button>
            {/if}
          </div>

          {#if s.vendor === "nvidia"}
            <p class="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              <Shield class="size-3 inline-block align-text-bottom mr-1" />
              When the NVIDIA installer opens, pick <em>Custom install</em> → uncheck GeForce
              Experience for a clean DCH driver-only install.
            </p>
          {:else if s.vendor === "amd"}
            <p class="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              <Shield class="size-3 inline-block align-text-bottom mr-1" />
              On AMD's site, pick the <strong>Adrenalin Edition</strong> driver and choose
              <em>Minimal Setup</em> during install to skip Adrenalin's bloat.
            </p>
          {:else if s.vendor === "intel"}
            <p class="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              <Shield class="size-3 inline-block align-text-bottom mr-1" />
              Use the standalone <code class="font-mono">.zip</code> or <code class="font-mono">.exe</code>
              driver, not the Driver &amp; Support Assistant.
            </p>
          {/if}
        </CardContent>
      </Card>
    {/each}
  </div>

  <!-- Installed driver packages (rollback) -->
  <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2 mt-8">
    Installed driver packages
  </h2>
  {#if isTauri() && admin.checked && !admin.elevated}
    <AdminBanner
      title="Driver rollback needs administrator"
      description="Removing driver packages with pnputil requires elevated rights. Click here to relaunch with UAC."
      declinedToast="Driver rollback requires admin."
    />
  {:else}
    <Card class="card-inset">
      <div class="px-5 py-4 flex items-center gap-3 border-b border-foreground/8">
        <div class="grid place-items-center size-9 rounded-md bg-primary/15 text-primary shrink-0">
          <Package class="size-4" />
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-base font-semibold">Installed driver packages</h3>
          <p class="text-xs text-muted-foreground mt-0.5">
            Lists OEM-installed driver packages via <code class="font-mono text-[11px]">pnputil /enum-drivers</code>.
            Removing a package rolls back to the next-best signed driver (or the OS default).
          </p>
        </div>
      </div>
      <div class="px-5 py-3 border-b border-foreground/8 flex flex-wrap items-center gap-2">
        <Filter class="size-3.5 text-muted-foreground" />
        <span class="text-xs text-muted-foreground">Class:</span>
        {#each ["Display", "Net", "Sound, video and game controllers", "all"] as cls (cls)}
          <Button
            size="sm"
            variant={packageClass === cls ? "default" : "outline"}
            onclick={() => (packageClass = cls as ClassFilter)}
          >
            {cls === "all" ? "All" : cls === "Sound, video and game controllers" ? "Audio" : cls}
          </Button>
        {/each}
        <Button
          size="sm"
          variant="outline"
          class="ml-auto"
          onclick={loadPackages}
          disabled={packagesLoading}
        >
          {#if packagesLoading}
            <Loader2 class="animate-spin" />
          {:else}
            <RefreshCw />
          {/if}
          {packagesLoaded ? "Refresh" : "Scan"}
        </Button>
      </div>
      {#if packagesLoading && !packagesLoaded}
        <div class="grid place-items-center py-12 text-sm text-muted-foreground">
          <Loader2 class="size-5 animate-spin mb-2" />
          Reading driver packages…
        </div>
      {:else if !packagesLoaded}
        <div class="px-6 py-12 text-center text-sm text-muted-foreground">
          Click <span class="font-semibold">Scan</span> to enumerate installed drivers.
        </div>
      {:else if packages.length === 0}
        <div class="px-6 py-12 text-center text-sm text-muted-foreground">
          No driver packages in this class.
        </div>
      {:else}
        <div>
          {#each packages as p (p.publishedName)}
            {@const isBusy = packageBusy.has(p.publishedName)}
            <div
              class="flex items-start gap-3 py-3 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium">{p.provider}</span>
                  <Badge variant="outline" class="font-mono">{p.publishedName}</Badge>
                  <Badge variant="outline">{p.version}</Badge>
                </div>
                <p class="text-[11px] text-muted-foreground mt-1">
                  {p.originalName} · {p.className} · {p.date}
                  {#if p.signer}
                    · <span class="text-muted-foreground/70">signed by {p.signer}</span>
                  {/if}
                </p>
              </div>
              <div class="shrink-0 pt-0.5">
                <Button
                  size="sm"
                  variant="outline"
                  onclick={() => askRollback(p)}
                  disabled={isBusy}
                >
                  {#if isBusy}
                    <Loader2 class="animate-spin" />
                  {:else}
                    <Trash2 />
                  {/if}
                  Roll back
                </Button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </Card>
  {/if}
{/if}

<Dialog
  bind:open={rollbackOpen}
  title={rollbackTarget ? `Roll back ${rollbackTarget.publishedName}?` : ""}
  description={rollbackTarget
    ? `Removes ${rollbackTarget.provider} ${rollbackTarget.version} (${rollbackTarget.originalName}). Windows falls back to the previous signed driver, or its built-in default if none exists. May require a reboot.`
    : ""}
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (rollbackOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={confirmRollback}>
      <Trash2 />
      Roll back
    </Button>
  {/snippet}
</Dialog>
