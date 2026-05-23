<script lang="ts">
  import { Card, Button, Switch, Badge, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Search,
    Rocket,
    MoreVertical,
    FolderOpen,
    Info,
    Copy,
    Globe,
  } from "@lucide/svelte";
  import {
    isTauri,
    setStartupEnabled,
    revealInExplorer,
    openProperties,
    type StartupApp,
  } from "$lib/tweaks/bridge";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { tick } from "svelte";
  import { log } from "$lib/log.svelte";
  import {
    startupAppsResource,
    startupPathsResource,
    startupIconsResource,
  } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  let filter = $state("");
  // Optimistic toggle overrides, keyed by startup id. Cleared on reload.
  let enabledOverrides = $state<Map<string, boolean>>(new Map());

  const appsRes = startupAppsResource();
  const rawApps = $derived<StartupApp[]>(appsRes.data ?? []);
  const apps = $derived<StartupApp[]>(
    rawApps.map((a) =>
      enabledOverrides.has(a.id) ? { ...a, enabled: enabledOverrides.get(a.id)! } : a,
    ),
  );
  const loading = $derived(appsRes.loading);

  const pathsRes = $derived(startupPathsResource(appsRes.data));
  const iconsRes = $derived(startupIconsResource(appsRes.data));
  const iconCache = $derived<Record<string, string>>(iconsRes.data ?? {});
  const pathCache = $derived<Record<string, string>>(pathsRes.data ?? {});

  let busy = $state<Set<string>>(new Set());
  let menuOpenId = $state<string | null>(null);
  let menuPos = $state<{ top: number; right: number } | null>(null);

  function appxPackageFromCommand(cmd: string): string | undefined {
    if (!cmd.startsWith("appx:")) return undefined;
    const aumid = cmd.slice(5);
    const fam = aumid.split("!")[0];
    return fam.split("_")[0] || undefined;
  }

  function iconFor(command: string): string | undefined {
    const appx = appxPackageFromCommand(command);
    if (appx) return iconCache[`appx:${appx}`];
    return iconCache[command];
  }

  function openMenu(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (menuOpenId === id) {
      closeMenu();
      return;
    }
    const btn = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menuPos = {
      top: btn.bottom + 4,
      right: window.innerWidth - btn.right,
    };
    menuOpenId = id;
  }

  function closeMenu() {
    menuOpenId = null;
    menuPos = null;
  }

  function onWindowClick(e: MouseEvent) {
    if (!menuOpenId) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-startup-menu]")) return;
    closeMenu();
  }

  function onWindowScroll() {
    if (menuOpenId) closeMenu();
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape" && menuOpenId) closeMenu();
  }

  async function actOpenLocation(path: string) {
    closeMenu();
    try {
      await revealInExplorer(path);
    } catch (e) {
      toast.error("Open file location", String(e));
    }
  }
  async function actProperties(command: string) {
    closeMenu();
    try {
      await openProperties(command);
    } catch (e) {
      toast.error("Properties", String(e));
    }
  }
  async function actCopy(text: string) {
    closeMenu();
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch (e) {
      toast.error("Copy failed", String(e));
    }
  }
  async function actSearch(name: string) {
    closeMenu();
    try {
      await openUrl(
        `https://www.google.com/search?q=${encodeURIComponent(name + " startup process")}`,
      );
    } catch (e) {
      toast.error("Search online", String(e));
    }
  }

  async function reload() {
    invalidate("startup.apps");
    invalidate("startup.paths");
    invalidate("startup.icons");
    enabledOverrides = new Map();
    await appsRes.refresh();
    // Let Svelte's reactivity flush so pathsRes / iconsRes re-derive against
    // the fresh apps list. Without tick(), refresh() below would still see
    // the stale (empty-input) resource and fetch nothing useful.
    await tick();
    await Promise.all([pathsRes.refresh(), iconsRes.refresh()]);
  }

  async function toggle(app: StartupApp, next: boolean) {
    if (busy.has(app.id)) return;
    const nextBusy = new Set(busy);
    nextBusy.add(app.id);
    busy = nextBusy;

    const prevOverride = enabledOverrides.get(app.id);
    const nextOverrides = new Map(enabledOverrides);
    nextOverrides.set(app.id, next);
    enabledOverrides = nextOverrides;

    try {
      await setStartupEnabled(app.id, next);
      log.success(
        next ? "tweak.apply" : "tweak.revert",
        app.name,
        next ? `Enabled startup '${app.name}'` : `Disabled startup '${app.name}'`,
      );
      toast.success(`${app.name} ${next ? "enabled" : "disabled"}`);
    } catch (e) {
      const revert = new Map(enabledOverrides);
      if (prevOverride === undefined) revert.delete(app.id);
      else revert.set(app.id, prevOverride);
      enabledOverrides = revert;
      toast.error("Failed", String(e));
      log.error("tweak.apply", app.name, "Failed to toggle startup entry", String(e));
    } finally {
      const after = new Set(busy);
      after.delete(app.id);
      busy = after;
    }
  }

  const filtered = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.command.toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q),
    );
  });

  const enabledCount = $derived(apps.filter((a) => a.enabled).length);
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Startup apps</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {#if loading}
        Scanning autostart entries…
      {:else if isTauri()}
        <span class="font-medium text-foreground tabular-nums">{enabledCount}</span>
        of {apps.length} enabled · sources: registry Run keys + Startup folders
        {#if appsRes.revalidating}
          · <span class="text-muted-foreground/70">refreshing…</span>
        {/if}
      {:else}
        Browser preview — startup queries require the built app.
      {/if}
    </p>
  </div>
  <Button variant="outline" onclick={reload} disabled={loading}>
    <RefreshCw class={loading || appsRes.revalidating ? "animate-spin" : ""} />
    Refresh
  </Button>
</header>

{#if isTauri() && !loading}
  <div class="mb-4 relative">
    <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
    <input
      type="text"
      bind:value={filter}
      placeholder="Filter startup apps…"
      class="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-card text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
    />
  </div>
{/if}

{#if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Scanning startup entries…
  </div>
{:else if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — startup apps need the built app.
    </div>
  </Card>
{:else if filtered.length === 0}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      {filter ? "No startup apps matching the filter." : "No autostart entries found."}
    </div>
  </Card>
{:else}
  <Card class="overflow-hidden gap-0 py-0 card-inset">
    {#each filtered as app (app.id)}
      {@const dataUrl = iconFor(app.command)}
      <div class="flex items-start gap-3 py-3 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors">
        <div class="grid place-items-center size-9 rounded-md bg-accent/40 overflow-hidden shrink-0">
          {#if dataUrl}
            <img src={dataUrl} alt="" class="size-7 object-contain" />
          {:else}
            <Rocket class="size-4 text-muted-foreground" />
          {/if}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium truncate">{app.name}</span>
            <Badge variant="outline">{app.source}</Badge>
            {#if !app.enabled}
              <Badge variant="warning">Disabled</Badge>
            {/if}
          </div>
          <p class="text-xs text-muted-foreground mt-1 font-mono break-all leading-relaxed">
            {app.command}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0 pt-1 relative">
          {#if busy.has(app.id)}
            <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
          {/if}
          <Switch
            checked={app.enabled}
            onCheckedChange={(v) => toggle(app, v)}
            disabled={busy.has(app.id)}
          />
          <button
            type="button"
            aria-label="More actions"
            data-startup-menu
            class="size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onclick={(e) => openMenu(e, app.id)}
          >
            <MoreVertical class="size-4" />
          </button>
        </div>
      </div>
    {/each}
  </Card>
{/if}

<svelte:window
  onclick={onWindowClick}
  onscroll={onWindowScroll}
  onkeydown={onWindowKey}
/>

{#if menuOpenId && menuPos}
  {@const openApp = apps.find((a) => a.id === menuOpenId)}
  {#if openApp}
    {@const isAppx = openApp.command.startsWith("appx:")}
    {@const exePath = isAppx ? undefined : pathCache[openApp.command]}
    {@const copyText = isAppx ? openApp.command.slice(5) : exePath ?? openApp.command}
    <div
      data-startup-menu
      class="fixed z-50 min-w-56 rounded-lg border border-foreground/10 bg-card/95 backdrop-blur-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.45)] p-1 text-sm"
      style="top: {menuPos.top}px; right: {menuPos.right}px;"
    >
      {#if exePath}
        <button
          type="button"
          class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent transition-colors text-left"
          onclick={() => actOpenLocation(exePath)}
        >
          <FolderOpen class="size-4 text-muted-foreground" />
          Open file location
        </button>
        <button
          type="button"
          class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent transition-colors text-left"
          onclick={() => actProperties(openApp.command)}
        >
          <Info class="size-4 text-muted-foreground" />
          Properties
        </button>
        <div class="h-px bg-foreground/10 my-1 mx-1.5"></div>
      {/if}
      <button
        type="button"
        class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent transition-colors text-left"
        onclick={() => actCopy(copyText)}
      >
        <Copy class="size-4 text-muted-foreground" />
        Copy {isAppx ? "AUMID" : "path"}
      </button>
      <button
        type="button"
        class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent transition-colors text-left"
        onclick={() => actSearch(openApp.name)}
      >
        <Globe class="size-4 text-muted-foreground" />
        Search online
      </button>
    </div>
  {/if}
{/if}
