<script lang="ts">
  import { Card, Button, Badge, Checkbox, BulkActionBar, toast } from "$lib/ui";
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
    installWindowsUpdates,
    type WuUpdate,
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
    try {
      const r = await installWindowsUpdates(ids);
      if (r.ok) {
        if (r.failed === 0) {
          toast.success(r.message, r.rebootRequired ? "Reboot required" : undefined);
        } else {
          toast.warning(r.message, `${r.failed} failed`);
        }
        log.success(
          "system.boot",
          "Windows Update",
          `${r.installed} installed, ${r.failed} failed`,
          r.message,
        );
      } else {
        toast.error("Install failed", r.message);
        log.error("system.boot", "Windows Update", "Install failed", r.message);
      }
      selected = new Set();
      await scan();
    } catch (e) {
      toast.error("Install error", String(e));
      log.error("system.boot", "Windows Update", "Install threw", String(e));
    } finally {
      installing = false;
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

  function formatScanTime(ts: number | null): string {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Windows Update</h1>
    <p class="text-sm text-muted-foreground mt-1">
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
    </p>
  </div>
  <Button onclick={scan} disabled={loading || refreshing || installing} variant="outline">
    {#if loading || refreshing}
      <Loader2 class="animate-spin" />
    {:else}
      <RefreshCw />
    {/if}
    Check for updates
  </Button>
</header>

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
      <button
        type="button"
        onclick={() => (filter = f.value as FilterKey)}
        class={cn(
          "inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-colors border",
          filter === f.value
            ? "border-primary bg-primary/10 text-primary"
            : "border-input hover:bg-accent/40 text-muted-foreground",
        )}
      >
        {f.label}
        <span class="tabular-nums text-[10px] opacity-70">({f.count})</span>
      </button>
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
  <Card class="overflow-hidden gap-0 py-0 card-inset">
    {#each filtered as u (u.id)}
      {@const isSelected = selected.has(u.id)}
      <label
        class={cn(
          "relative flex items-start gap-3 py-4 px-5 border-b last:border-b-0 transition-colors cursor-pointer select-none",
          isSelected ? "bg-primary/[0.06] hover:bg-primary/[0.08]" : "hover:bg-accent/40",
        )}
      >
        <span
          class={cn(
            "absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-all",
            isSelected ? "bg-primary opacity-100" : "opacity-0",
          )}
          aria-hidden="true"
        ></span>
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
        <div class="grid place-items-center size-8 rounded-md bg-accent/60 shrink-0 mt-0.5">
          {#if u.isDriver}
            <Cpu class="size-3.5 text-muted-foreground" />
          {:else}
            <HardDriveDownload class="size-3.5 text-muted-foreground" />
          {/if}
        </div>
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
          </div>
          {#if u.description}
            <p class="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
              {u.description}
            </p>
          {/if}
        </div>
      </label>
    {/each}
  </Card>

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
