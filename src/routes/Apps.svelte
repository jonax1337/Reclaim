<script lang="ts">
  import {
    Card,
    Button,
    Badge,
    Checkbox,
    BulkActionBar,
    Dialog,
    toast,
  } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Search,
    Sparkles,
    Download,
    ArrowUpCircle,
    Trash2,
    ExternalLink,
    AlertTriangle,
    Package,
  } from "@lucide/svelte";
  import {
    isTauri,
    wingetRunStream,
    type WingetOp,
  } from "$lib/tweaks/bridge";
  import {
    UNIQUE_APPS,
    GROUP_LABELS,
    GROUP_ORDER,
    RECOMMENDED_IDS,
    iconUrl,
    type AppEntry,
    type AppGroup,
  } from "$lib/apps/catalog";
  import { log } from "$lib/log.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import {
    wingetVersionResource,
    wingetInstalledResource,
    wingetUpgradableResource,
  } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  type AppState = {
    installed: boolean;
    version?: string;
    available?: string;
  };

  let filter = $state("");
  let selected = $state<Set<string>>(new Set());
  // id → state override, applied on top of the parsed winget output.
  // Cleared on explicit refresh.
  let stateOverrides = $state<Map<string, AppState | null>>(new Map());

  const versionRes = wingetVersionResource();
  const installedRes = wingetInstalledResource();
  const upgradableRes = wingetUpgradableResource();

  const loading = $derived(
    versionRes.loading || installedRes.loading || upgradableRes.loading,
  );
  const refreshing = $derived(installedRes.revalidating || upgradableRes.revalidating);
  const wingetReady = $derived(versionRes.data?.available ?? false);
  const wingetVer = $derived(versionRes.data?.version ?? "");

  let bulkBusy = $state(false);
  let busyOne = $state<Set<string>>(new Set());
  let lastLine = $state<Record<string, string>>({});
  let iconFailed = $state<Set<string>>(new Set());
  let confirmUninstall = $state<AppEntry | null>(null);

  function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function parseWingetOutput(text: string, ids: string[]): Map<string, AppState> {
    const map = new Map<string, AppState>();
    for (const id of ids) {
      const re = new RegExp(`(?:^|\\s)${escapeRegex(id)}\\s+(.+?)\\s*$`, "mi");
      const m = text.match(re);
      if (!m) continue;
      let rest = m[1].trim();
      const sourceMatch = rest.match(/\s+(winget|msstore)\s*$/i);
      if (sourceMatch) rest = rest.slice(0, sourceMatch.index!).trim();
      const tokens = rest.split(/\s+/).filter(Boolean);
      const version = tokens[0] ?? "";
      const available = tokens[1];
      map.set(id, { installed: true, version, available });
    }
    return map;
  }

  const baseStates = $derived.by<Record<string, AppState>>(() => {
    if (!wingetReady) return {};
    const ids = UNIQUE_APPS.map((a) => a.id);
    const installedMap = parseWingetOutput(installedRes.data ?? "", ids);
    const upgradableMap = parseWingetOutput(upgradableRes.data ?? "", ids);
    const out: Record<string, AppState> = {};
    for (const id of ids) {
      const inst = installedMap.get(id);
      const up = upgradableMap.get(id);
      if (inst || up) {
        out[id] = {
          installed: true,
          version: inst?.version ?? up?.version,
          available: up?.available ?? inst?.available,
        };
      }
    }
    return out;
  });

  // Apply optimistic overrides on top of the parsed states.
  const states = $derived.by<Record<string, AppState>>(() => {
    if (stateOverrides.size === 0) return baseStates;
    const out = { ...baseStates };
    for (const [id, override] of stateOverrides) {
      if (override === null) delete out[id];
      else out[id] = override;
    }
    return out;
  });

  function setBusyOne(id: string, on: boolean) {
    const next = new Set(busyOne);
    if (on) next.add(id);
    else next.delete(id);
    busyOne = next;
  }

  function isInstalled(id: string): boolean {
    return !!states[id]?.installed;
  }

  function recordResult(id: string, action: WingetOp, ok: boolean, msg?: string) {
    const entry = UNIQUE_APPS.find((a) => a.id === id);
    const target = entry?.name ?? id;
    const logAction =
      action === "install" ? "app.install" : action === "uninstall" ? "app.uninstall" : "app.upgrade";
    if (ok) {
      log.success(logAction, target, `${action} succeeded`);
    } else {
      log.error(logAction, target, `${action} failed`, msg);
    }
  }

  function setLine(id: string, line: string) {
    lastLine = { ...lastLine, [id]: line };
  }

  function clearLine(id: string) {
    if (!(id in lastLine)) return;
    const next = { ...lastLine };
    delete next[id];
    lastLine = next;
  }

  function patchState(id: string, op: WingetOp) {
    const next = new Map(stateOverrides);
    if (op === "install" || op === "upgrade") {
      const prev = states[id];
      next.set(id, {
        installed: true,
        version: prev?.available ?? prev?.version,
      });
    } else if (op === "uninstall") {
      next.set(id, null);
    }
    stateOverrides = next;
  }

  async function refreshWinget() {
    invalidate("apps.winget.installed");
    invalidate("apps.winget.upgradable");
    stateOverrides = new Map();
    await Promise.all([installedRes.refresh(), upgradableRes.refresh()]);
  }

  async function runOne(entry: AppEntry, op: WingetOp): Promise<boolean> {
    if (busyOne.has(entry.id)) return false;
    setBusyOne(entry.id, true);
    setLine(entry.id, `Starting winget ${op}…`);
    let ok = false;
    let lastErr = "";
    try {
      const exit = await wingetRunStream(op, entry.id, false, (e) => {
        if (e.kind === "stdout" || e.kind === "stderr") {
          const trimmed = e.data.trim();
          if (trimmed) setLine(entry.id, trimmed);
          if (e.kind === "stderr") lastErr = trimmed;
        }
      });
      ok = exit === 0;
      if (ok) {
        patchState(entry.id, op);
      }
      recordResult(entry.id, op, ok, ok ? undefined : `exit ${exit}${lastErr ? `: ${lastErr}` : ""}`);
      if (ok) toast.success(`${entry.name}: ${op} ok`);
      else toast.error(`${entry.name}: ${op} failed`, `exit ${exit}`);
    } catch (e) {
      recordResult(entry.id, op, false, String(e));
      toast.error(`${entry.name}: ${op} failed`, String(e));
    } finally {
      setBusyOne(entry.id, false);
      clearLine(entry.id);
    }
    return ok;
  }

  async function doInstall(entry: AppEntry) {
    await runOne(entry, "install");
  }
  async function doUpgrade(entry: AppEntry) {
    await runOne(entry, "upgrade");
  }
  function askUninstall(entry: AppEntry) {
    confirmUninstall = entry;
  }
  async function confirmUninstallNow() {
    const entry = confirmUninstall;
    confirmUninstall = null;
    if (!entry) return;
    await runOne(entry, "uninstall");
  }

  async function installSelected() {
    if (bulkBusy || selected.size === 0) return;
    bulkBusy = true;
    const list = [...selected].filter((id) => !isInstalled(id));
    let ok = 0;
    let fail = 0;
    for (const id of list) {
      const entry = UNIQUE_APPS.find((a) => a.id === id);
      if (!entry) continue;
      const success = await runOne(entry, "install");
      if (success) ok++;
      else fail++;
    }
    bulkBusy = false;
    selected = new Set();
    if (fail === 0) toast.success(`${ok} app${ok === 1 ? "" : "s"} installed`);
    else toast.error(`${ok} installed, ${fail} failed`, "Check the activity log.");
  }

  function toggleSelected(id: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    selected = next;
  }

  function selectRecommended() {
    selected = new Set(RECOMMENDED_IDS.filter((id) => !isInstalled(id)));
  }

  const filtered = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return UNIQUE_APPS;
    return UNIQUE_APPS.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q),
    );
  });

  const groups = $derived.by(() => {
    const out: Record<AppGroup, AppEntry[]> = {
      browsers: [],
      communication: [],
      dev: [],
      media: [],
      system: [],
      gaming: [],
      office: [],
      utilities: [],
    };
    for (const a of filtered) out[a.group].push(a);
    return out;
  });

  const installedCount = $derived(Object.values(states).filter((s) => s.installed).length);
  const upgradableCount = $derived(
    Object.entries(states).filter(([, s]) => s.installed && s.available).length,
  );

  function onIconError(slug: string) {
    iconFailed = new Set([...iconFailed, slug]);
  }

  async function openStore() {
    try {
      await openUrl("ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1");
    } catch {
      await openUrl("https://apps.microsoft.com/detail/9nblggh4nns1");
    }
  }
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Apps</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {#if loading}
        Querying winget…
      {:else if !isTauri()}
        Browser preview — installing apps requires the built app.
      {:else if !wingetReady}
        winget not available on this system.
      {:else}
        <span class="font-medium text-foreground tabular-nums">{installedCount}</span> of
        {UNIQUE_APPS.length} catalogued apps installed
        {#if upgradableCount > 0}
          · <span class="text-foreground">{upgradableCount}</span> upgradable
        {/if}
        {#if wingetVer}
          · winget {wingetVer}
        {/if}
        {#if refreshing}
          · <span class="text-muted-foreground/70">refreshing…</span>
        {/if}
      {/if}
    </p>
  </div>
  <div class="flex items-center gap-2">
    {#if isTauri() && wingetReady}
      <Button variant="outline" onclick={selectRecommended} disabled={bulkBusy || loading}>
        <Sparkles />
        Select recommended
      </Button>
    {/if}
    <Button variant="outline" onclick={refreshWinget} disabled={loading || refreshing}>
      <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  </div>
</header>

{#if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — winget calls need the built app.
    </div>
  </Card>
{:else if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Querying winget — this can take a moment on first run…
  </div>
{:else if !wingetReady}
  <Card class="card-inset">
    <div class="px-6 py-16 flex flex-col items-center text-center gap-4">
      <div class="grid place-items-center size-12 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
        <AlertTriangle class="size-6" />
      </div>
      <div>
        <h2 class="text-lg font-semibold">winget not found</h2>
        <p class="text-sm text-muted-foreground mt-1 max-w-md leading-relaxed">
          The Windows Package Manager (App Installer) is required for this page. It ships with
          Windows 11 by default but may be missing on older builds.
        </p>
      </div>
      <Button onclick={openStore}>
        <ExternalLink />
        Get App Installer from the Microsoft Store
      </Button>
    </div>
  </Card>
{:else}
  <div class="flex flex-wrap items-center gap-2 mb-4">
    <div class="flex-1 min-w-[12rem] relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <input
        type="text"
        bind:value={filter}
        placeholder="Filter apps…"
        class="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-card text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
      />
    </div>
  </div>

  <div class="flex flex-col gap-6">
    {#each GROUP_ORDER as g (g)}
      {@const entries = groups[g]}
      {#if entries.length > 0}
        <section>
          <div class="flex items-center justify-between mb-2 px-1">
            <h2 class="text-xs font-semibold uppercase text-muted-foreground tracking-[0.12em]">
              {GROUP_LABELS[g]}
            </h2>
            <span class="text-[10px] text-muted-foreground/60">{entries.length}</span>
          </div>
          <Card class="overflow-hidden gap-0 py-0 card-inset">
            {#each entries as entry (entry.id)}
              {@const st = states[entry.id]}
              {@const installed = !!st?.installed}
              {@const upgradable = !!(st?.installed && st?.available)}
              {@const isSelected = selected.has(entry.id)}
              {@const isBusy = busyOne.has(entry.id)}
              {@const line = lastLine[entry.id]}
              {@const showIcon = entry.icon && !iconFailed.has(entry.icon)}
              <label
                class="relative flex items-start gap-4 py-3 px-5 border-b last:border-b-0 transition-colors {installed && !isBusy
                  ? 'opacity-60 hover:opacity-80'
                  : 'hover:bg-accent/40 cursor-pointer'} {isSelected ? 'bg-primary/[0.04]' : ''}"
              >
                <span
                  class="absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-all {isSelected
                    ? 'bg-primary opacity-100'
                    : 'opacity-0'}"
                  aria-hidden="true"
                ></span>
                <div class="pt-0.5">
                  <Checkbox
                    checked={isSelected}
                    disabled={installed || isBusy || bulkBusy}
                    onCheckedChange={(v) => toggleSelected(entry.id, !!v)}
                  />
                </div>
                <div class="grid place-items-center size-9 rounded-md bg-accent/40 overflow-hidden shrink-0">
                  {#if showIcon}
                    <img
                      src={iconUrl(entry.icon!)}
                      alt=""
                      loading="lazy"
                      class="size-7 object-contain"
                      onerror={() => onIconError(entry.icon!)}
                    />
                  {:else}
                    <Package class="size-4 text-muted-foreground" />
                  {/if}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-medium">{entry.name}</span>
                    {#if entry.recommended}
                      <Badge variant="success">
                        <Sparkles class="size-2.5" />
                        Recommended
                      </Badge>
                    {/if}
                    {#if upgradable}
                      <Badge variant="warning">
                        <ArrowUpCircle class="size-2.5" />
                        Upgrade {st?.version} → {st?.available}
                      </Badge>
                    {:else if installed}
                      <Badge variant="default">
                        Installed{st?.version ? ` · ${st.version}` : ""}
                      </Badge>
                    {/if}
                  </div>
                  <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {entry.description}
                  </p>
                  <p class="text-[10px] text-muted-foreground/60 mt-1 font-mono">{entry.id}</p>
                  {#if line}
                    <p class="text-[11px] text-primary/80 mt-1 font-mono truncate">› {line}</p>
                  {/if}
                </div>
                <div class="flex items-center gap-2 shrink-0 pt-0.5">
                  {#if isBusy}
                    <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
                  {/if}
                  {#if upgradable}
                    <Button size="sm" onclick={() => doUpgrade(entry)} disabled={isBusy || bulkBusy}>
                      <ArrowUpCircle />
                      Upgrade
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onclick={() => askUninstall(entry)}
                      disabled={isBusy || bulkBusy}
                      aria-label="Uninstall {entry.name}"
                    >
                      <Trash2 />
                    </Button>
                  {:else if installed}
                    <Button
                      size="sm"
                      variant="outline"
                      onclick={() => askUninstall(entry)}
                      disabled={isBusy || bulkBusy}
                    >
                      <Trash2 />
                      Uninstall
                    </Button>
                  {:else}
                    <Button size="sm" onclick={() => doInstall(entry)} disabled={isBusy || bulkBusy}>
                      <Download />
                      Install
                    </Button>
                  {/if}
                </div>
              </label>
            {/each}
          </Card>
        </section>
      {/if}
    {/each}
  </div>

  <BulkActionBar count={selected.size} onClear={() => (selected = new Set())}>
    <Button onclick={installSelected} size="sm" disabled={bulkBusy}>
      {#if bulkBusy}
        <Loader2 class="animate-spin" />
      {:else}
        <Download />
      {/if}
      Install
    </Button>
  </BulkActionBar>
{/if}

<Dialog
  open={confirmUninstall !== null}
  onOpenChange={(v) => {
    if (!v) confirmUninstall = null;
  }}
  title={confirmUninstall ? `Uninstall '${confirmUninstall.name}'?` : "Uninstall app?"}
  description="winget will run the package's official uninstaller. Per-app settings and saved data usually stay behind."
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmUninstall = null)}>Cancel</Button>
    <Button variant="destructive" onclick={confirmUninstallNow}>
      <Trash2 />
      Uninstall
    </Button>
  {/snippet}
</Dialog>
