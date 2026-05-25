<script lang="ts">
  import { Card, Button, Badge, Checkbox, BulkActionBar, PageHeader, ListCard, SelectableListRow, RowIcon, toast, FilterChip } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Download,
    AlertTriangle,
    HardDriveDownload,
    Cpu,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    installWindowsUpdatesStream,
    type WuUpdate,
    type WuProgressEvent,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { cn } from "$lib/utils";
  import { wuUpdatesResource, K_WU_UPDATES } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  type FilterKey = "all" | "quality" | "security" | "driver" | "optional";

  let filter = $state<FilterKey>("all");
  let selected = $state<Set<string>>(new Set());

  const wuRes = wuUpdatesResource();
  const updates = $derived<WuUpdate[]>(wuRes.data ?? []);
  const loading = $derived(wuRes.loading && !wuRes.data);
  const refreshing = $derived(wuRes.revalidating);
  const lastScanned = $derived<number | null>(wuRes.data !== undefined ? Date.now() : null);
  // Note: lastScanned is approximate — we don't track per-fetch timestamps in
  // the cache. The exact value matters less than "we have data".

  let installing = $state(false);

  type Phase = "queued" | "downloading" | "downloaded" | "installing" | "done" | "failed";
  type RowProgress = { phase: Phase; percent: number; code?: number };
  let progress = $state<Record<string, RowProgress>>({});
  let globalPhase = $state<"download" | "install" | null>(null);
  let globalPercent = $state(0);
  let currentIndex = $state(0);
  let installOrder = $state<string[]>([]);

  function applyEvent(ev: WuProgressEvent) {
    if (ev.t === "queued") {
      progress[ev.id] = { phase: "queued", percent: 0 };
      if (!installOrder.includes(ev.id)) installOrder = [...installOrder, ev.id];
    } else if (ev.t === "download_start") {
      globalPhase = "download";
      globalPercent = 0;
      currentIndex = 0;
    } else if (ev.t === "download_progress") {
      globalPercent = ev.percent;
      currentIndex = ev.currentIndex;
      const id = installOrder[ev.currentIndex];
      if (id) {
        progress[id] = { phase: "downloading", percent: ev.currentPercent };
      }
    } else if (ev.t === "download_done") {
      const existing = progress[ev.id];
      progress[ev.id] = ev.ok
        ? { phase: "downloaded", percent: 100 }
        : { phase: "failed", percent: existing?.percent ?? 0, code: ev.code };
    } else if (ev.t === "install_start") {
      globalPhase = "install";
      globalPercent = 0;
      currentIndex = 0;
    } else if (ev.t === "install_progress") {
      globalPercent = ev.percent;
      currentIndex = ev.currentIndex;
      // Map install index into the ready (downloaded) subset.
      const ready = installOrder.filter((id) => {
        const p = progress[id];
        return p && (p.phase === "downloaded" || p.phase === "installing" || p.phase === "done");
      });
      const id = ready[ev.currentIndex];
      if (id) {
        progress[id] = { phase: "installing", percent: ev.currentPercent };
      }
    } else if (ev.t === "install_done") {
      progress[ev.id] = ev.ok
        ? { phase: "done", percent: 100 }
        : { phase: "failed", percent: 0, code: ev.code };
    } else if (ev.t === "finished") {
      globalPhase = null;
      globalPercent = 100;
    }
  }

  function resetProgress() {
    progress = {};
    globalPhase = null;
    globalPercent = 0;
    currentIndex = 0;
    installOrder = [];
  }

  async function scan() {
    if (!isTauri() || installing) return;
    invalidate(K_WU_UPDATES);
    selected = new Set();
    const result = await wuRes.refresh();
    if (result) {
      log.success(
        "system.boot",
        "Windows Update",
        `Scan found ${result.length} pending update${result.length === 1 ? "" : "s"}`,
      );
    }
  }

  async function install(ids: string[]) {
    if (!isTauri() || installing || ids.length === 0) return;
    if (!admin.elevated) {
      const ok = await admin.relaunchElevated();
      if (!ok) toast.error("Admin required", "Installing updates needs administrator rights.");
      return;
    }
    installing = true;
    resetProgress();
    // Seed the rows in click order so they have a "Queued" pill from the start.
    installOrder = [...ids];
    for (const id of ids) progress[id] = { phase: "queued", percent: 0 };
    let summary: WuProgressEvent | null = null;
    let errorMsg: string | null = null;
    try {
      await installWindowsUpdatesStream(ids, (ev) => {
        applyEvent(ev);
        if (ev.t === "finished") summary = ev;
        if (ev.t === "error") errorMsg = ev.message;
      });
      if (errorMsg) {
        toast.error("Install failed", errorMsg);
        log.error("system.boot", "Windows Update", "Install failed", errorMsg);
      } else if (summary) {
        const s = summary as Extract<WuProgressEvent, { t: "finished" }>;
        if (s.failed === 0) {
          toast.success(s.message, s.rebootRequired ? "Reboot required" : undefined);
        } else {
          toast.warning(s.message, `${s.failed} failed`);
        }
        log.success(
          "system.boot",
          "Windows Update",
          `${s.installed} installed, ${s.failed} failed`,
          s.message,
        );
      }
      selected = new Set();
      await scan();
    } catch (e) {
      toast.error("Install error", String(e));
      log.error("system.boot", "Windows Update", "Install threw", String(e));
    } finally {
      installing = false;
      globalPhase = null;
    }
  }

  function clearSelection() {
    selected = new Set();
  }

  function matchesFilter(u: WuUpdate, f: FilterKey): boolean {
    if (f === "all") return true;
    if (f === "driver") return u.isDriver;
    if (f === "optional") return u.isOptional;
    if (f === "security")
      return /security/i.test(u.categories) || /security/i.test(u.severity);
    if (f === "quality") return /quality|cumulative/i.test(u.categories);
    return true;
  }

  const filtered = $derived(updates.filter((u) => matchesFilter(u, filter)));
  const counts = $derived.by(() => {
    const c = { all: updates.length, quality: 0, security: 0, driver: 0, optional: 0 };
    for (const u of updates) {
      if (matchesFilter(u, "quality")) c.quality++;
      if (matchesFilter(u, "security")) c.security++;
      if (matchesFilter(u, "driver")) c.driver++;
      if (matchesFilter(u, "optional")) c.optional++;
    }
    return c;
  });
  const totalSizeSelected = $derived(
    updates
      .filter((u) => selected.has(u.id))
      .reduce((sum, u) => sum + u.sizeMb, 0),
  );

  function phaseLabel(phase: Phase): string {
    switch (phase) {
      case "queued": return "Queued";
      case "downloading": return "Downloading";
      case "downloaded": return "Downloaded";
      case "installing": return "Installing";
      case "done": return "Installed";
      case "failed": return "Failed";
    }
  }

  function formatScanTime(ts: number | null): string {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
</script>

<PageHeader title="Windows Update">
  {#snippet actions()}
    <Button onclick={scan} disabled={loading || refreshing || installing} variant="outline">
      {#if loading || refreshing}
        <Loader2 class="animate-spin" />
      {:else}
        <RefreshCw />
      {/if}
      Check for updates
    </Button>
  {/snippet}
  {#if !isTauri()}
    Browser preview — Windows Update queries need the built app.
  {:else if loading}
    Scanning Microsoft Update servers…
  {:else if lastScanned}
    <span class="font-medium text-foreground tabular-nums">{updates.length}</span>
    update{updates.length === 1 ? "" : "s"} found · last scan {formatScanTime(lastScanned)}
  {:else}
    Click 'Check for updates' to scan.
  {/if}
</PageHeader>

<AdminBanner
  title="Installing updates needs administrator"
  description="Scanning works without elevation, but applying updates writes through the Windows Update Agent and requires UAC."
  declinedToast="Installing updates requires admin."
/>

{#if updates.length > 0 || loading}
  <div class="flex flex-wrap gap-2 mb-4">
    {#each [
      { value: "all", label: "All", count: counts.all },
      { value: "security", label: "Security", count: counts.security },
      { value: "quality", label: "Quality", count: counts.quality },
      { value: "driver", label: "Drivers", count: counts.driver },
      { value: "optional", label: "Optional", count: counts.optional },
    ] as f (f.value)}
      <FilterChip
        selected={filter === f.value}
        count={f.count}
        onclick={() => (filter = f.value as FilterKey)}
      >
        {f.label}
      </FilterChip>
    {/each}
  </div>
{/if}

{#if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Scanning Microsoft Update… this can take a minute.
  </div>
{:else if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — Windows Update needs the built app.
    </div>
  </Card>
{:else if updates.length === 0 && lastScanned}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center">
      <p class="text-sm font-medium text-foreground">You're up to date</p>
      <p class="text-xs text-muted-foreground mt-1">
        No pending updates from Microsoft Update.
      </p>
    </div>
  </Card>
{:else if filtered.length === 0}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      No updates match this filter.
    </div>
  </Card>
{:else}
  {#if installing}
    <Card class="card-inset mb-3 p-4">
      <div class="flex items-center justify-between gap-3 mb-2">
        <div class="flex items-center gap-2 text-sm">
          <Loader2 class="size-3.5 animate-spin text-primary" />
          <span class="font-medium">
            {#if globalPhase === "download"}Downloading updates{:else if globalPhase === "install"}Installing updates{:else}Finishing…{/if}
          </span>
          <span class="text-muted-foreground tabular-nums">
            {currentIndex + 1} / {installOrder.length}
          </span>
        </div>
        <span class="text-xs text-muted-foreground tabular-nums">{globalPercent}%</span>
      </div>
      <div class="h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
        <div
          class="h-full bg-primary transition-[width] duration-300 ease-out"
          style="width: {globalPercent}%"
        ></div>
      </div>
    </Card>
  {/if}
  <ListCard>
    {#each filtered as u (u.id)}
      {@const isSelected = selected.has(u.id)}
      {@const rp = progress[u.id]}
      <SelectableListRow selected={isSelected} density="md">
        <div class="pt-0.5 shrink-0">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(v) => {
              const next = new Set(selected);
              if (v) next.add(u.id);
              else next.delete(u.id);
              selected = next;
            }}
          />
        </div>
        <RowIcon icon={u.isDriver ? Cpu : HardDriveDownload} class="mt-0.5" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium">{u.title}</span>
            {#if u.kbs}<Badge variant="outline">KB {u.kbs}</Badge>{/if}
            {#if u.isDriver}<Badge variant="default">Driver</Badge>{/if}
            {#if u.isOptional}<Badge variant="outline">Optional</Badge>{/if}
            {#if u.severity === "Critical"}
              <Badge variant="destructive">
                <AlertTriangle class="size-2.5" />
                Critical
              </Badge>
            {:else if u.severity === "Important"}
              <Badge variant="warning">{u.severity}</Badge>
            {:else if u.severity}
              <Badge variant="outline">{u.severity}</Badge>
            {/if}
            {#if u.rebootRequired > 0}
              <Badge variant="warning">Reboot</Badge>
            {/if}
            <Badge variant="outline">{u.sizeMb.toFixed(1)} MB</Badge>
            {#if rp}
              <Badge
                variant={rp.phase === "failed" ? "destructive" : rp.phase === "done" ? "default" : "outline"}
              >
                {#if rp.phase === "downloading" || rp.phase === "installing"}
                  <Loader2 class="size-2.5 animate-spin" />
                {/if}
                {phaseLabel(rp.phase)}
                {#if (rp.phase === "downloading" || rp.phase === "installing") && rp.percent > 0}
                  <span class="tabular-nums">{rp.percent}%</span>
                {/if}
              </Badge>
            {/if}
          </div>
          {#if u.description}
            <p class="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
              {u.description}
            </p>
          {/if}
          {#if rp && (rp.phase === "downloading" || rp.phase === "installing")}
            <div class="h-1 mt-2 w-full rounded-full bg-foreground/10 overflow-hidden">
              <div
                class="h-full bg-primary transition-[width] duration-300 ease-out"
                style="width: {Math.max(2, rp.percent)}%"
              ></div>
            </div>
          {/if}
        </div>
      </SelectableListRow>
    {/each}
  </ListCard>

  {#if selected.size === 0 && filtered.length > 0}
    <div class="flex justify-end mt-3">
      <Button
        onclick={() => install(filtered.map((u) => u.id))}
        disabled={installing}
      >
        {#if installing}
          <Loader2 class="animate-spin" />
          Installing…
        {:else}
          <Download />
          Install all visible ({filtered.length})
        {/if}
      </Button>
    </div>
  {/if}
{/if}

<BulkActionBar
  count={selected.size}
  label={`selected · ${totalSizeSelected.toFixed(1)} MB`}
  onClear={clearSelection}
>
  <Button onclick={() => install([...selected])} disabled={installing}>
    {#if installing}
      <Loader2 class="animate-spin" />
      Installing…
    {:else}
      <Download />
      Install
    {/if}
  </Button>
</BulkActionBar>
