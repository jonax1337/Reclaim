<script lang="ts">
  import { Card, Button, Badge, Switch, PageHeader, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Search,
    MousePointer2,
    AlertTriangle,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    contextMenuToggle,
    type ContextMenuEntry,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { contextMenuResource } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  let filter = $state("");
  let showSystem = $state(false);
  // Optimistic disabled override per CLSID after a successful toggle.
  let disabledOverrides = $state<Map<string, boolean>>(new Map());

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);
  const entriesRes = $derived(canFetch ? contextMenuResource() : null);
  const rawEntries = $derived<ContextMenuEntry[]>(entriesRes?.data ?? []);
  const entries = $derived<ContextMenuEntry[]>(
    disabledOverrides.size === 0
      ? rawEntries
      : rawEntries.map((e) =>
          disabledOverrides.has(e.clsid)
            ? { ...e, disabled: disabledOverrides.get(e.clsid)! }
            : e,
        ),
  );
  const loading = $derived(entriesRes?.loading ?? false);
  const refreshing = $derived(entriesRes?.revalidating ?? false);

  let busy = $state<Set<string>>(new Set());

  // CLSIDs Windows itself owns — flipping these can break Explorer in
  // unexpected ways. We dim them and warn before toggling.
  const SYSTEM_PUBLISHERS = ["microsoft", "windows", "shell32", "explorer"];

  function isSystemEntry(e: ContextMenuEntry): boolean {
    const blob = (e.friendly ?? e.name).toLowerCase();
    return SYSTEM_PUBLISHERS.some((p) => blob.includes(p));
  }

  async function reload() {
    if (!canFetch) return;
    invalidate("context-menu.list");
    disabledOverrides = new Map();
    await entriesRes?.refresh();
  }

  function setBusy(clsid: string, on: boolean) {
    const next = new Set(busy);
    if (on) next.add(clsid);
    else next.delete(clsid);
    busy = next;
  }

  async function toggle(entry: ContextMenuEntry, disable: boolean) {
    if (busy.has(entry.clsid)) return;
    setBusy(entry.clsid, true);
    const prev = disabledOverrides.get(entry.clsid);
    const optimistic = new Map(disabledOverrides);
    optimistic.set(entry.clsid, disable);
    disabledOverrides = optimistic;
    try {
      await contextMenuToggle(entry.clsid, disable);
      log.success(
        "context_menu.toggle",
        entry.friendly || entry.name,
        disable ? "Blocked" : "Allowed",
      );
      toast.success(
        `${entry.friendly || entry.name} ${disable ? "blocked" : "allowed"}`,
        "Restart Explorer or sign out for changes to take effect.",
      );
    } catch (e) {
      const revert = new Map(disabledOverrides);
      if (prev === undefined) revert.delete(entry.clsid);
      else revert.set(entry.clsid, prev);
      disabledOverrides = revert;
      log.error("context_menu.toggle", entry.friendly || entry.name, "Toggle failed", String(e));
      toast.error("Toggle failed", String(e));
    } finally {
      setBusy(entry.clsid, false);
    }
  }

  const filtered = $derived.by(() => {
    let list = entries;
    if (!showSystem) {
      list = list.filter((e) => !isSystemEntry(e));
    }
    const q = filter.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          (e.friendly ?? "").toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q) ||
          e.clsid.toLowerCase().includes(q) ||
          e.categories.some((c) => c.toLowerCase().includes(q)),
      );
    }
    return list.sort((a, b) => {
      // Disabled entries bubble to the top so they're easy to spot.
      if (a.disabled !== b.disabled) return a.disabled ? -1 : 1;
      return (a.friendly ?? a.name).localeCompare(b.friendly ?? b.name);
    });
  });

  const totalCount = $derived(entries.length);
  const disabledCount = $derived(entries.filter((e) => e.disabled).length);
  const thirdPartyCount = $derived(entries.filter((e) => !isSystemEntry(e)).length);
</script>

<PageHeader title="Right-click menu">
  {#snippet actions()}
    <div class="flex items-center gap-2">
      <Button variant="outline" onclick={() => (showSystem = !showSystem)} disabled={loading}>
        {showSystem ? "Hide system" : "Show system"}
      </Button>
      <Button variant="outline" onclick={reload} disabled={loading}>
        <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
        Refresh
      </Button>
    </div>
  {/snippet}
  {#if loading}
    Enumerating shell extensions…
  {:else if admin.checked && !admin.elevated}
    Listing shell extensions needs administrator rights.
  {:else if isTauri()}
    <span class="font-medium text-foreground tabular-nums">{thirdPartyCount}</span>
    third-party
    + <span class="text-foreground">{totalCount - thirdPartyCount}</span> system entries
    {#if disabledCount > 0}
      · <span class="text-foreground">{disabledCount}</span> blocked
    {/if}
  {:else}
    Browser preview — shell extension queries need the built app.
  {/if}
</PageHeader>

{#if isTauri() && admin.checked && !admin.elevated}
  <AdminBanner
    title="Editing shell extensions needs administrator"
    description="Blocking shell extensions writes to HKLM\\…\\Shell Extensions\\Blocked. Click to relaunch with UAC."
    declinedToast="Editing shell extensions requires admin."
  />
{:else if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — shell extension editing needs the built app.
    </div>
  </Card>
{:else if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Reading shell extension registry…
  </div>
{:else}
  <div class="mb-4 flex items-center gap-2">
    <div class="flex-1 relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <input
        type="text"
        bind:value={filter}
        placeholder="Filter by name, CLSID, or category…"
        class="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-card text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
      />
    </div>
  </div>

  <div class="rounded-xl border border-foreground/8 bg-foreground/[0.03] p-3 mb-4 flex items-start gap-3">
    <AlertTriangle class="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
    <p class="text-xs text-muted-foreground leading-relaxed">
      Toggling adds/removes the CLSID from
      <code class="font-mono text-foreground">HKLM\Software\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked</code>.
      Disabling system handlers can break Explorer features (cut/copy/paste, sharing, …) — be
      conservative. Sign out and back in for changes to fully apply.
    </p>
  </div>

  {#if filtered.length === 0}
    <Card class="card-inset">
      <div class="px-6 py-16 text-center text-sm text-muted-foreground">
        {filter ? "No shell extensions match the filter." : "No shell extensions found."}
      </div>
    </Card>
  {:else}
    <Card class="overflow-hidden gap-0 py-0 card-inset">
      {#each filtered as e (e.clsid)}
        {@const isBusy = busy.has(e.clsid)}
        {@const isSystem = isSystemEntry(e)}
        <div class="flex items-start gap-3 py-3 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors">
          <div class="grid place-items-center size-8 rounded-md bg-accent/60 shrink-0">
            <MousePointer2 class="size-3.5 text-muted-foreground" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium truncate">{e.friendly || e.name}</span>
              {#if e.disabled}
                <Badge variant="warning">Blocked</Badge>
              {/if}
              {#if isSystem}
                <Badge variant="outline">System</Badge>
              {/if}
              {#each e.categories as cat (cat)}
                <Badge variant="default">{cat}</Badge>
              {/each}
            </div>
            <p class="text-[10px] text-muted-foreground/60 mt-1 font-mono break-all">
              {e.clsid}
              {#if e.friendly && e.name !== e.friendly}
                · {e.name}
              {/if}
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0 pt-1">
            {#if isBusy}
              <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
            {/if}
            <Switch
              checked={!e.disabled}
              disabled={isBusy}
              onCheckedChange={(v) => toggle(e, !v)}
            />
          </div>
        </div>
      {/each}
    </Card>
  {/if}
{/if}
