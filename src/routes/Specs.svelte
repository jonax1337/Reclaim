<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle, Button } from "$lib/ui";
  import { Cpu, MonitorSmartphone, MemoryStick, HardDrive, CircuitBoard, RefreshCw, Loader2 } from "@lucide/svelte";
  import { isTauri, type SystemInfo } from "$lib/tweaks/bridge";
  import { hardwareResource, systemInfoResource } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  type CpuRow = {
    Name?: string;
    Manufacturer?: string;
    NumberOfCores?: number;
    NumberOfLogicalProcessors?: number;
    MaxClockSpeed?: number;
  };
  type GpuRow = {
    Name?: string;
    DriverVersion?: string;
    DriverDate?: string | { value?: string };
    AdapterRAM?: number;
    VideoModeDescription?: string;
    CurrentHorizontalResolution?: number;
    CurrentVerticalResolution?: number;
    CurrentRefreshRate?: number;
  };
  type RamRow = {
    Capacity?: number | string;
    Speed?: number;
    Manufacturer?: string;
    PartNumber?: string;
    ConfiguredClockSpeed?: number;
    FormFactor?: number;
    DeviceLocator?: string;
  };
  type DiskRow = {
    DeviceID?: string;
    Size?: number | string;
    FreeSpace?: number | string;
    VolumeName?: string;
    FileSystem?: string;
  };
  type PhysicalDiskRow = {
    Model?: string;
    Size?: number | string;
    InterfaceType?: string;
    MediaType?: string;
  };
  type HwData = {
    cpu?: CpuRow[];
    gpu?: GpuRow[];
    system?: { Manufacturer?: string; Model?: string; SystemFamily?: string; TotalPhysicalMemory?: number | string };
    os?: { FreePhysicalMemory?: number; TotalVisibleMemorySize?: number; InstallDate?: string | { value?: string }; LastBootUpTime?: string | { value?: string } };
    ram?: RamRow[];
    disks?: DiskRow[];
    physicalDisks?: PhysicalDiskRow[];
    motherboard?: { Manufacturer?: string; Product?: string; Version?: string };
    bios?: { SMBIOSBIOSVersion?: string; ReleaseDate?: string | { value?: string }; Manufacturer?: string };
  };

  const hwRes = hardwareResource();
  const sysRes = systemInfoResource();
  const data = $derived<HwData | null>((hwRes.data as HwData | undefined) ?? null);
  const info = $derived<SystemInfo | null>(sysRes.data ?? null);
  const loading = $derived(hwRes.loading || sysRes.loading);
  const refreshing = $derived(hwRes.revalidating || sysRes.revalidating);
  const error = $derived<string | null>(
    hwRes.error ? String(hwRes.error) : sysRes.error ? String(sysRes.error) : null,
  );

  function asArray<T>(v: T | T[] | undefined): T[] {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }

  function formatBytes(bytes: number | string | undefined): string {
    if (bytes === undefined || bytes === null) return "—";
    const n = typeof bytes === "string" ? Number(bytes) : bytes;
    if (!isFinite(n) || n <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
  }

  function formatMHz(mhz: number | undefined): string {
    if (!mhz) return "—";
    if (mhz >= 1000) return `${(mhz / 1000).toFixed(2)} GHz`;
    return `${mhz} MHz`;
  }

  function formatPsDate(v: string | { value?: string } | undefined): string {
    if (!v) return "—";
    const raw = typeof v === "string" ? v : v.value;
    if (!raw) return "—";
    const match = raw.match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if (match) return `${match[3]}.${match[2]}.${match[1]}`;
    return raw;
  }

  async function load() {
    invalidate("specs.hardware");
    invalidate("specs.systeminfo");
    await Promise.all([hwRes.refresh(), sysRes.refresh()]);
  }

  const ramTotal = $derived(
    data?.os?.TotalVisibleMemorySize ? data.os.TotalVisibleMemorySize * 1024 : null,
  );
  const ramFree = $derived(
    data?.os?.FreePhysicalMemory ? data.os.FreePhysicalMemory * 1024 : null,
  );
  const ramUsed = $derived(ramTotal && ramFree ? ramTotal - ramFree : null);
  const ramPct = $derived(
    ramTotal && ramUsed ? Math.round((ramUsed / ramTotal) * 100) : 0,
  );
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">System specs</h1>
    <p class="text-sm text-muted-foreground mt-1">CPU, GPU, RAM, storage and firmware.</p>
  </div>
  <Button variant="outline" onclick={load} disabled={loading}>
    <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
    Refresh
  </Button>
</header>

{#if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — hardware queries require the built app.
    </div>
  </Card>
{:else if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Querying hardware…
  </div>
{:else if error}
  <Card class="card-inset border-destructive/40">
    <CardContent>
      <p class="text-sm text-destructive">{error}</p>
    </CardContent>
  </Card>
{:else if data}
  {#each asArray(data.cpu) as cpu, i (i)}
    <Card class="card-inset mb-4">
      <CardHeader>
        <div class="flex items-center gap-2">
          <Cpu class="size-4 text-primary" />
          <CardTitle>Processor</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p class="text-base font-medium">{cpu.Name?.trim() ?? "—"}</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Vendor</div>
            <div class="font-medium">{cpu.Manufacturer ?? "—"}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Cores</div>
            <div class="font-medium tabular-nums">{cpu.NumberOfCores ?? "—"}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Threads</div>
            <div class="font-medium tabular-nums">{cpu.NumberOfLogicalProcessors ?? "—"}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Max clock</div>
            <div class="font-medium tabular-nums">{formatMHz(cpu.MaxClockSpeed)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  {/each}

  {#each asArray(data.gpu) as gpu, i (i)}
    <Card class="card-inset mb-4">
      <CardHeader>
        <div class="flex items-center gap-2">
          <MonitorSmartphone class="size-4 text-primary" />
          <CardTitle>Graphics {asArray(data.gpu).length > 1 ? i + 1 : ""}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p class="text-base font-medium">{gpu.Name ?? "—"}</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Driver</div>
            <div class="font-medium font-mono text-xs">{gpu.DriverVersion ?? "—"}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Driver date</div>
            <div class="font-medium tabular-nums">{formatPsDate(gpu.DriverDate)}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Resolution</div>
            <div class="font-medium tabular-nums">
              {#if gpu.CurrentHorizontalResolution && gpu.CurrentVerticalResolution}
                {gpu.CurrentHorizontalResolution}×{gpu.CurrentVerticalResolution}
                {#if gpu.CurrentRefreshRate}@ {gpu.CurrentRefreshRate} Hz{/if}
              {:else}—{/if}
            </div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground">VRAM (reported)</div>
            <div class="font-medium tabular-nums">{formatBytes(gpu.AdapterRAM)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  {/each}

  <Card class="card-inset mb-4">
    <CardHeader>
      <div class="flex items-center gap-2">
        <MemoryStick class="size-4 text-primary" />
        <CardTitle>Memory</CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      {#if ramTotal}
        <div class="flex items-baseline justify-between mb-2">
          <span class="text-base font-medium tabular-nums">
            {formatBytes(ramUsed ?? 0)} <span class="text-muted-foreground">/ {formatBytes(ramTotal)}</span>
          </span>
          <span class="text-xs text-muted-foreground tabular-nums">{ramPct}% used</span>
        </div>
        <div class="h-2 rounded-full bg-muted overflow-hidden">
          <div
            class="h-full rounded-full bg-primary transition-all duration-500"
            style="width: {ramPct}%"
          ></div>
        </div>
      {/if}
      {#if asArray(data.ram).length > 0}
        <table class="w-full text-sm mt-4">
          <thead>
            <tr class="text-[10px] uppercase tracking-wider text-muted-foreground text-left">
              <th class="pb-2 font-medium">Slot</th>
              <th class="pb-2 font-medium">Manufacturer</th>
              <th class="pb-2 font-medium">Part</th>
              <th class="pb-2 font-medium text-right">Capacity</th>
              <th class="pb-2 font-medium text-right">Speed</th>
            </tr>
          </thead>
          <tbody>
            {#each asArray(data.ram) as stick, i (i)}
              <tr class="border-t">
                <td class="py-2 font-mono text-xs">{stick.DeviceLocator ?? "—"}</td>
                <td class="py-2">{stick.Manufacturer?.trim() || "—"}</td>
                <td class="py-2 font-mono text-xs">{stick.PartNumber?.trim() || "—"}</td>
                <td class="py-2 text-right tabular-nums">{formatBytes(stick.Capacity)}</td>
                <td class="py-2 text-right tabular-nums">
                  {stick.ConfiguredClockSpeed ?? stick.Speed ?? "—"} MHz
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </CardContent>
  </Card>

  <Card class="card-inset mb-4">
    <CardHeader>
      <div class="flex items-center gap-2">
        <HardDrive class="size-4 text-primary" />
        <CardTitle>Storage</CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      {#if asArray(data.disks).length > 0}
        <div class="space-y-3">
          {#each asArray(data.disks) as disk (disk.DeviceID)}
            {@const size = typeof disk.Size === "string" ? Number(disk.Size) : disk.Size ?? 0}
            {@const free = typeof disk.FreeSpace === "string" ? Number(disk.FreeSpace) : disk.FreeSpace ?? 0}
            {@const used = size - free}
            {@const pct = size > 0 ? Math.round((used / size) * 100) : 0}
            <div>
              <div class="flex items-baseline justify-between text-sm mb-1">
                <span class="font-medium">
                  {disk.DeviceID}
                  {#if disk.VolumeName} · {disk.VolumeName}{/if}
                  {#if disk.FileSystem}<span class="text-muted-foreground"> ({disk.FileSystem})</span>{/if}
                </span>
                <span class="tabular-nums text-xs">
                  {formatBytes(used)} <span class="text-muted-foreground">/ {formatBytes(size)}</span>
                </span>
              </div>
              <div class="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  class="h-full rounded-full {pct > 90 ? 'bg-destructive' : pct > 75 ? 'bg-warning' : 'bg-primary'} transition-all duration-500"
                  style="width: {pct}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if asArray(data.physicalDisks).length > 0}
        <div class="mt-4 pt-4 border-t">
          <div class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Physical drives
          </div>
          <ul class="text-sm space-y-1.5">
            {#each asArray(data.physicalDisks) as pd, i (i)}
              <li class="flex items-baseline justify-between gap-3">
                <span class="truncate">{pd.Model?.trim() ?? "Unknown"}</span>
                <span class="text-xs text-muted-foreground tabular-nums shrink-0">
                  {formatBytes(pd.Size)}
                  {#if pd.InterfaceType} · {pd.InterfaceType}{/if}
                  {#if pd.MediaType && pd.MediaType !== "External hard disk media"} · {pd.MediaType}{/if}
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </CardContent>
  </Card>

  <Card class="card-inset mb-4">
    <CardHeader>
      <div class="flex items-center gap-2">
        <CircuitBoard class="size-4 text-primary" />
        <CardTitle>System &amp; firmware</CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {#if info}
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Operating system</dt>
            <dd class="font-medium">{info.productName} · {info.displayVersion} (Build {info.build})</dd>
          </div>
        {/if}
        {#if data.system}
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Manufacturer</dt>
            <dd class="font-medium">{data.system.Manufacturer ?? "—"}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Model</dt>
            <dd class="font-medium">{data.system.Model ?? "—"}{data.system.SystemFamily ? ` · ${data.system.SystemFamily}` : ""}</dd>
          </div>
        {/if}
        {#if data.motherboard}
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Motherboard</dt>
            <dd class="font-medium">
              {data.motherboard.Manufacturer ?? "—"} {data.motherboard.Product ?? ""}
              {#if data.motherboard.Version}<span class="text-muted-foreground"> · {data.motherboard.Version}</span>{/if}
            </dd>
          </div>
        {/if}
        {#if data.bios}
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">BIOS</dt>
            <dd class="font-medium">
              {data.bios.Manufacturer ?? "—"} {data.bios.SMBIOSBIOSVersion ?? ""}
              {#if data.bios.ReleaseDate}<span class="text-muted-foreground"> · {formatPsDate(data.bios.ReleaseDate)}</span>{/if}
            </dd>
          </div>
        {/if}
        {#if data.os?.LastBootUpTime}
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Last boot</dt>
            <dd class="font-medium">{formatPsDate(data.os.LastBootUpTime)}</dd>
          </div>
        {/if}
        {#if data.os?.InstallDate}
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">OS installed</dt>
            <dd class="font-medium">{formatPsDate(data.os.InstallDate)}</dd>
          </div>
        {/if}
      </dl>
    </CardContent>
  </Card>
{/if}
