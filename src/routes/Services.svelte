<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Badge, toast, Dialog } from "$lib/ui";
  import { Loader2, RefreshCw, Search, AlertTriangle, Cog } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    setService,
    type ServiceEntry,
    type ServiceStartType,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { cn } from "$lib/utils";
  import { servicesResource } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  const NOTABLE_SERVICES: Record<string, { label: string; reason: string }> = {
    DiagTrack: { label: "Connected User Experiences and Telemetry", reason: "Sends diagnostic data to Microsoft." },
    dmwappushservice: { label: "WAP Push Message Routing", reason: "Used for OMA-DM remote management." },
    WSearch: { label: "Windows Search", reason: "Indexes files for fast search. Disable if you don't use Windows Search." },
    SysMain: { label: "Superfetch / SysMain", reason: "Preloads frequently used apps. Mixed impact on SSDs." },
    WerSvc: { label: "Windows Error Reporting", reason: "Sends crash reports to Microsoft." },
    DPS: { label: "Diagnostic Policy Service", reason: "Runs diagnostics in the background." },
    WMPNetworkSvc: { label: "Windows Media Player Network Sharing", reason: "DLNA media sharing — disable if unused." },
    RemoteRegistry: { label: "Remote Registry", reason: "Allows remote registry editing. Security risk if left on." },
    Fax: { label: "Fax", reason: "Fax service — almost certainly unused." },
    XblAuthManager: { label: "Xbox Live Auth Manager", reason: "Xbox sign-in. Keep if you play games using Xbox Live." },
    XblGameSave: { label: "Xbox Live Game Save", reason: "Cloud saves for Xbox games." },
    XboxNetApiSvc: { label: "Xbox Live Networking", reason: "Xbox multiplayer." },
    XboxGipSvc: { label: "Xbox Accessory Management", reason: "Xbox controller drivers." },
    MapsBroker: { label: "Downloaded Maps Manager", reason: "Caches offline maps for the Maps app." },
    PcaSvc: { label: "Program Compatibility Assistant", reason: "Diagnostics for legacy apps." },
    RetailDemo: { label: "Retail Demo", reason: "Used only on store demo PCs." },
  };

  type Override = { startType: string; status?: string };

  let filter = $state("");
  let showAll = $state(false);
  // Optimistic overrides per service after a successful toggle.
  let serviceOverrides = $state<Map<string, Override>>(new Map());

  // Gate fetch on admin (avoids a doomed PowerShell call without rights).
  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);
  const servicesRes = $derived(
    canFetch ? servicesResource() : null,
  );
  const rawServices = $derived<ServiceEntry[]>(servicesRes?.data ?? []);
  const services = $derived<ServiceEntry[]>(
    serviceOverrides.size === 0
      ? rawServices
      : rawServices.map((s) => {
          const o = serviceOverrides.get(s.name);
          if (!o) return s;
          return { ...s, startType: o.startType, status: o.status ?? s.status };
        }),
  );
  const loading = $derived(servicesRes?.loading ?? false);
  const refreshing = $derived(servicesRes?.revalidating ?? false);

  let busy = $state<Set<string>>(new Set());

  let confirmOpen = $state(false);
  let pending = $state<{
    svc: ServiceEntry;
    startType: ServiceStartType;
    runState: "Stopped" | "Running" | null;
  } | null>(null);

  async function reload() {
    if (!canFetch) return;
    invalidate("services.list");
    serviceOverrides = new Map();
    await servicesRes?.refresh();
  }

  // Auto-load once admin status becomes known and elevated.
  // Without this, the resource isn't created until canFetch flips, and that
  // happens after the first paint.
  onMount(() => {
    // no-op — derived servicesRes kicks off the fetch when canFetch becomes true.
  });

  function startTypeColor(t: string) {
    if (t === "Disabled") return "outline";
    if (t === "Automatic" || t === "AutomaticDelayedStart") return "success";
    return "default";
  }

  function statusColor(s: string) {
    if (s === "Running") return "success";
    if (s === "Stopped") return "outline";
    return "default";
  }

  function askDisable(svc: ServiceEntry) {
    pending = { svc, startType: "Disabled", runState: "Stopped" };
    confirmOpen = true;
  }

  function askEnable(svc: ServiceEntry) {
    pending = { svc, startType: "Automatic", runState: "Running" };
    confirmOpen = true;
  }

  async function confirm() {
    if (!pending) return;
    const { svc, startType, runState } = pending;
    confirmOpen = false;
    const nextBusy = new Set(busy);
    nextBusy.add(svc.name);
    busy = nextBusy;
    try {
      await setService(svc.name, startType, runState);
      const next = new Map(serviceOverrides);
      next.set(svc.name, {
        startType,
        status:
          runState === "Running"
            ? "Running"
            : runState === "Stopped"
              ? "Stopped"
              : svc.status,
      });
      serviceOverrides = next;
      log.success(
        "tweak.apply",
        svc.displayName || svc.name,
        `Service set to ${startType}`,
      );
      toast.success(`${svc.displayName || svc.name}: ${startType}`);
    } catch (e) {
      toast.error("Service change failed", String(e));
      log.error("tweak.apply", svc.displayName || svc.name, "Service change failed", String(e));
    } finally {
      const after = new Set(busy);
      after.delete(svc.name);
      busy = after;
    }
    pending = null;
  }

  const filtered = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    let list = services;
    if (!showAll) {
      list = list.filter((s) => s.name in NOTABLE_SERVICES);
    }
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  const notableCount = $derived(
    services.filter((s) => s.name in NOTABLE_SERVICES).length,
  );
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Services</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {#if loading}
        Querying services…
      {:else if isTauri()}
        {#if showAll}
          Showing all <span class="font-medium text-foreground tabular-nums">{services.length}</span> services
        {:else}
          Showing <span class="font-medium text-foreground tabular-nums">{notableCount}</span>
          notable services — toggle 'Show all' for the full list of {services.length}.
        {/if}
        {#if refreshing}
          · <span class="text-muted-foreground/70">refreshing…</span>
        {/if}
      {:else}
        Browser preview — service queries require the built app.
      {/if}
    </p>
  </div>
  <div class="flex items-center gap-2">
    <Button variant="outline" onclick={() => (showAll = !showAll)} disabled={loading}>
      {showAll ? "Show notable only" : "Show all"}
    </Button>
    <Button variant="outline" onclick={reload} disabled={loading || !canFetch}>
      <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  </div>
</header>

{#if isTauri() && admin.checked && !admin.elevated}
  <AdminBanner
    title="Service control needs administrator"
    description="Reading and changing Windows services requires elevated rights. Click here to relaunch with UAC."
    declinedToast="Service control requires admin."
  />
{:else if isTauri() && !loading}
  <div class="mb-4 flex items-center gap-2">
    <div class="flex-1 relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <input
        type="text"
        bind:value={filter}
        placeholder="Filter services…"
        class="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-card text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
      />
    </div>
  </div>
{/if}

{#if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Querying services…
  </div>
{:else if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — services need the built app.
    </div>
  </Card>
{:else if filtered.length === 0}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      No services match.
    </div>
  </Card>
{:else}
  <Card class="overflow-hidden gap-0 py-0 card-inset">
    {#each filtered as svc (svc.name)}
      {@const info = NOTABLE_SERVICES[svc.name]}
      {@const isBusy = busy.has(svc.name)}
      <div class="flex items-start gap-3 py-3 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors">
        <div class="grid place-items-center size-8 rounded-md bg-accent/60 shrink-0">
          <Cog class={cn("size-3.5", svc.status === "Running" ? "text-success" : "text-muted-foreground")} />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium truncate">{svc.displayName || svc.name}</span>
            <Badge variant={statusColor(svc.status) as never}>{svc.status}</Badge>
            <Badge variant={startTypeColor(svc.startType) as never}>{svc.startType}</Badge>
            {#if info}
              <Badge variant="warning">
                <AlertTriangle class="size-2.5" />
                Notable
              </Badge>
            {/if}
          </div>
          <p class="text-[10px] text-muted-foreground/60 mt-1 font-mono">{svc.name}</p>
          {#if info}
            <p class="text-xs text-muted-foreground mt-1 leading-relaxed">{info.reason}</p>
          {/if}
        </div>
        <div class="flex items-center gap-2 shrink-0 pt-0.5">
          {#if isBusy}
            <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
          {/if}
          {#if svc.startType !== "Disabled"}
            <Button size="sm" variant="outline" onclick={() => askDisable(svc)} disabled={isBusy}>
              Disable
            </Button>
          {:else}
            <Button size="sm" onclick={() => askEnable(svc)} disabled={isBusy}>
              Enable
            </Button>
          {/if}
        </div>
      </div>
    {/each}
  </Card>
{/if}

<Dialog
  bind:open={confirmOpen}
  title={pending ? `${pending.startType === "Disabled" ? "Disable" : "Enable"} '${pending.svc.displayName || pending.svc.name}'?` : ""}
  description={pending?.startType === "Disabled"
    ? "The service will be stopped and set to Disabled. Apps that depend on it may break."
    : "The service will be set to Automatic and started."}
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
    <Button variant={pending?.startType === "Disabled" ? "destructive" : "default"} onclick={confirm}>
      {pending?.startType === "Disabled" ? "Disable service" : "Enable service"}
    </Button>
  {/snippet}
</Dialog>
