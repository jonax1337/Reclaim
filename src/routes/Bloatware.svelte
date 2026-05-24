<script lang="ts">
  import { Card, Button, Badge, Checkbox, BulkActionBar, Dialog, PageHeader, toast } from "$lib/ui";
  import { Loader2, Trash2, RefreshCw, Sparkles, AlertTriangle, Search, Package } from "@lucide/svelte";
  import { isTauri, removeAppx, type AppxPackage } from "$lib/tweaks/bridge";
  import { BLOATWARE, GROUP_LABELS, type BloatwareEntry } from "$lib/tweaks/bloatware";
  import { iconUrl } from "$lib/apps/catalog";
  import { tick } from "svelte";
  import { log } from "$lib/log.svelte";
  import {
    bloatwareInstalledResource,
    bloatwareIconsResource,
  } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  let filter = $state("");
  let selected = $state<Set<string>>(new Set());
  let iconFailed = $state<Set<string>>(new Set());
  function onIconError(icon: string) {
    iconFailed = new Set([...iconFailed, icon]);
  }

  const installedRes = bloatwareInstalledResource();
  const installed = $derived<AppxPackage[]>(installedRes.data ?? []);
  // First visit: loading=true until data arrives.
  // Subsequent visits: data is instant, revalidating runs in background.
  const loading = $derived(installedRes.loading);

  const iconsRes = $derived(bloatwareIconsResource(installedRes.data));
  const appxIcons = $derived<Record<string, string>>(iconsRes.data ?? {});

  let busy = $state(false);
  let confirmRemoveOpen = $state(false);

  function patternMatches(pattern: string, name: string): boolean {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$", "i");
    return re.test(name);
  }

  function isInstalled(entry: BloatwareEntry): AppxPackage[] {
    return installed.filter((p) => patternMatches(entry.pattern, p.name));
  }

  async function reload() {
    invalidate("bloatware.installed");
    invalidate("bloatware.icons");
    await installedRes.refresh();
    // Let derived iconsRes re-evaluate against the fresh installed list before
    // we trigger its refresh — otherwise it'd run with the stale closure.
    await tick();
    await iconsRes.refresh();
  }

  function askRemove() {
    if (busy || selected.size === 0) return;
    confirmRemoveOpen = true;
  }

  async function removeSelected() {
    confirmRemoveOpen = false;
    if (busy || selected.size === 0) return;
    busy = true;
    let ok = 0;
    let fail = 0;
    const list = [...selected];
    for (const pattern of list) {
      const entry = BLOATWARE.find((b) => b.pattern === pattern);
      const title = entry?.title ?? pattern;
      try {
        const r = await removeAppx(pattern, true);
        if (r.success) {
          ok++;
          log.success("appx.remove", title, `Removed '${title}'`, r.stdout || undefined);
        } else {
          fail++;
          log.error("appx.remove", title, `Failed to remove '${title}'`, r.stderr || undefined);
        }
      } catch (err) {
        fail++;
        log.error("appx.remove", title, `Failed to remove '${title}'`, String(err));
      }
    }
    busy = false;
    selected = new Set();
    toast.success(
      `${ok} app${ok === 1 ? "" : "s"} removed`,
      fail > 0 ? `${fail} failed — may be a protected system component.` : undefined,
    );
    await reload();
  }

  function selectAllInstalled(entries: BloatwareEntry[]) {
    const next = new Set(selected);
    for (const e of entries) {
      if (isInstalled(e).length > 0) next.add(e.pattern);
    }
    selected = next;
  }

  function selectRecommended() {
    const next = new Set<string>();
    for (const e of BLOATWARE) {
      if (e.recommended && isInstalled(e).length > 0) next.add(e.pattern);
    }
    selected = next;
  }

  const groups = $derived.by(() => {
    const out: Record<string, BloatwareEntry[]> = {};
    const q = filter.trim().toLowerCase();
    for (const b of BLOATWARE) {
      if (isInstalled(b).length === 0) continue;
      if (q && !b.title.toLowerCase().includes(q) && !b.pattern.toLowerCase().includes(q)) continue;
      (out[b.group] ||= []).push(b);
    }
    return out;
  });
  const groupOrder: BloatwareEntry["group"][] = [
    "consumer",
    "office",
    "communication",
    "media",
    "gaming",
    "system",
    "oem",
    "other",
  ];

  const installedCount = $derived(BLOATWARE.filter((e) => isInstalled(e).length > 0).length);
  const recommendedInstalled = $derived(
    BLOATWARE.filter((e) => e.recommended && isInstalled(e).length > 0).length,
  );
</script>

<PageHeader title="Bloatware">
  {#if loading}
    Scanning installed apps…
  {:else if isTauri()}
    <span class="font-medium text-foreground tabular-nums">{installedCount}</span>
    installed bloatware {installedCount === 1 ? "app" : "apps"} found
    · <span class="text-foreground">{recommendedInstalled}</span> recommended to remove
    {#if installedRes.revalidating}
      · <span class="text-muted-foreground/70">refreshing…</span>
    {/if}
  {:else}
    Browser preview — app detection requires the built app.
  {/if}
</PageHeader>

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
  <Button variant="outline" onclick={reload} disabled={busy || loading}>
    <RefreshCw class={loading || installedRes.revalidating ? "animate-spin" : ""} />
    Rescan
  </Button>
  <Button variant="outline" onclick={selectRecommended} disabled={busy || loading}>
    <Sparkles />
    Select recommended
  </Button>
</div>

{#if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Scanning installed apps…
  </div>
{:else if installedCount === 0}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Sparkles class="size-6 mb-2 text-emerald-500" />
    <p class="font-medium text-foreground">No bloatware detected</p>
    <p class="mt-1">None of the {BLOATWARE.length} known patterns matched an installed app.</p>
  </div>
{:else if Object.keys(groups).length === 0}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Search class="size-6 mb-2" />
    No matches for "{filter}".
  </div>
{:else}
  <div class="flex flex-col gap-6">
    {#each groupOrder as g (g)}
      {@const entries = groups[g] ?? []}
      {#if entries.length > 0}
        <section>
          <div class="flex items-center justify-between mb-2 px-1">
            <h2 class="text-xs font-semibold uppercase text-muted-foreground tracking-[0.12em]">
              {GROUP_LABELS[g]}
            </h2>
            <button
              type="button"
              class="text-xs text-primary hover:underline"
              onclick={() => selectAllInstalled(entries)}
            >
              select all
            </button>
          </div>
          <Card class="overflow-hidden gap-0 py-0 card-inset">
            {#each entries as entry (entry.pattern)}
              {@const matches = isInstalled(entry)}
              {@const isSelected = selected.has(entry.pattern)}
              <label
                class="relative flex items-start gap-4 py-3 px-5 border-b last:border-b-0 transition-colors hover:bg-accent/40 cursor-pointer {isSelected
                  ? 'bg-primary/[0.04]'
                  : ''}"
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
                    onCheckedChange={(v) => {
                      const next = new Set(selected);
                      if (v) next.add(entry.pattern);
                      else next.delete(entry.pattern);
                      selected = next;
                    }}
                  />
                </div>
                <div class="grid place-items-center size-9 rounded-md bg-accent/40 overflow-hidden shrink-0">
                  {#if appxIcons[entry.pattern]}
                    <img src={appxIcons[entry.pattern]} alt="" class="size-7 object-contain" />
                  {:else if entry.icon && !iconFailed.has(entry.icon)}
                    <img
                      src={iconUrl(entry.icon)}
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
                    <span class="text-sm font-medium">{entry.title}</span>
                    {#if entry.recommended}
                      <Badge variant="success">
                        <Sparkles class="size-2.5" />
                        Recommended
                      </Badge>
                    {/if}
                    {#if matches.some((m) => m.provisioned)}
                      <Badge variant="outline">Provisioned</Badge>
                    {/if}
                    {#if entry.warning}
                      <Badge variant="warning">
                        <AlertTriangle class="size-2.5" />
                        Caution
                      </Badge>
                    {/if}
                  </div>
                  <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {entry.description}
                    {#if entry.warning}
                      <span class="block text-amber-700 dark:text-amber-400 mt-1">
                        {entry.warning}
                      </span>
                    {/if}
                  </p>
                  <p class="text-[10px] text-muted-foreground/60 mt-1 font-mono">{entry.pattern}</p>
                </div>
              </label>
            {/each}
          </Card>
        </section>
      {/if}
    {/each}
  </div>
{/if}

<BulkActionBar count={selected.size} onClear={() => (selected = new Set())}>
  <Button onclick={askRemove} variant="destructive" size="sm" disabled={busy}>
    {#if busy}
      <Loader2 class="animate-spin" />
    {:else}
      <Trash2 />
    {/if}
    Remove
  </Button>
</BulkActionBar>

<Dialog
  bind:open={confirmRemoveOpen}
  title={selected.size === 1
    ? "Remove 1 app?"
    : `Remove ${selected.size} apps?`}
  description="Selected apps will be uninstalled for all users and removed from provisioning (so new users won't get them either). Apps with personal data — Mail, OneNote, Phone Link — may delete cached data along with them."
>
  <div class="max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-3">
    <ul class="space-y-1 text-sm">
      {#each [...selected] as pattern (pattern)}
        {@const entry = BLOATWARE.find((b) => b.pattern === pattern)}
        <li class="flex items-start gap-2">
          <span class="size-1 rounded-full bg-destructive mt-1.5 shrink-0"></span>
          <span class="flex-1">{entry?.title ?? pattern}</span>
        </li>
      {/each}
    </ul>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmRemoveOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={removeSelected}>
      <Trash2 />
      Remove {selected.size === 1 ? "app" : "apps"}
    </Button>
  {/snippet}
</Dialog>
