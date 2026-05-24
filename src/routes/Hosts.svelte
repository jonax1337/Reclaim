<script lang="ts">
  import {
    Card,
    Button,
    Badge,
    Switch,
    Dialog,
    PageHeader,
    toast,
  } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    ShieldOff,
    AlertTriangle,
    FileText,
    Undo2,
    Save,
    Globe2,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    applyBlocklist,
    removeBlocklist,
    fetchBlocklist,
    readHosts,
    writeHosts,
    restoreHostsBackup,
    type HostsBlock,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { BLOCKLISTS, CATEGORY_LABELS, type Blocklist } from "$lib/network/blocklists";
  import {
    hostsActiveResource,
    hostsBackupResource,
  } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);
  const activeRes = $derived(canFetch ? hostsActiveResource() : null);
  const backupRes = $derived(canFetch ? hostsBackupResource() : null);
  const active = $derived<HostsBlock[]>(activeRes?.data ?? []);
  const backupExists = $derived<boolean>(backupRes?.data ?? false);
  const loading = $derived((activeRes?.loading ?? false) || (backupRes?.loading ?? false));
  const refreshing = $derived(
    (activeRes?.revalidating ?? false) || (backupRes?.revalidating ?? false),
  );

  let busy = $state<Set<string>>(new Set());

  let rawText = $state("");
  let rawDirty = $state(false);
  let savingRaw = $state(false);
  let editorOpen = $state(false);

  let restoreConfirmOpen = $state(false);

  async function reload() {
    if (!canFetch) return;
    invalidate("hosts.active");
    invalidate("hosts.backup");
    invalidate("hosts.content");
    await Promise.all([activeRes?.refresh(), backupRes?.refresh()]);
  }

  async function loadRaw() {
    try {
      rawText = await readHosts();
      rawDirty = false;
    } catch (e) {
      toast.error("Could not read hosts file", String(e));
    }
  }

  function activeBlock(id: string): HostsBlock | undefined {
    const list = BLOCKLISTS.find((b) => b.id === id);
    if (!list) return undefined;
    return active.find((a) => a.name === list.name);
  }

  function setBusy(id: string, on: boolean) {
    const next = new Set(busy);
    on ? next.add(id) : next.delete(id);
    busy = next;
  }

  async function toggleBlocklist(b: Blocklist, on: boolean) {
    if (busy.has(b.id)) return;
    setBusy(b.id, true);
    try {
      if (on) {
        let entries: string[];
        if (b.source === "builtin") {
          entries = b.builtinEntries ?? [];
        } else {
          toast.success(`Fetching ${b.name}…`, "Downloading hosts list");
          entries = await fetchBlocklist(b.source);
        }
        if (entries.length === 0) throw new Error("Blocklist is empty");
        const count = await applyBlocklist(b.name, entries);
        log.success(
          "network.blocklist_apply",
          b.name,
          `Applied ${count} blocked hosts`,
        );
        toast.success(`${b.name} applied`, `${count} hosts blocked`);
      } else {
        await removeBlocklist(b.name);
        log.success("network.blocklist_remove", b.name, "Blocklist removed");
        toast.success(`${b.name} removed`);
      }
      await reload();
    } catch (e) {
      log.error("network.blocklist_apply", b.name, "Operation failed", String(e));
      toast.error(`${b.name} failed`, String(e));
    } finally {
      setBusy(b.id, false);
    }
  }

  async function openEditor() {
    await loadRaw();
    editorOpen = true;
  }

  async function saveRaw() {
    if (savingRaw) return;
    savingRaw = true;
    try {
      await writeHosts(rawText);
      log.success("network.hosts_edit", "hosts", "Hosts file saved");
      toast.success("hosts saved", "Backup written to hosts.reclaim.bak");
      rawDirty = false;
      editorOpen = false;
      await reload();
    } catch (e) {
      log.error("network.hosts_edit", "hosts", "Save failed", String(e));
      toast.error("Save failed", String(e));
    } finally {
      savingRaw = false;
    }
  }

  async function doRestore() {
    restoreConfirmOpen = false;
    try {
      await restoreHostsBackup();
      log.success("network.hosts_restore", "hosts", "Restored from backup");
      toast.success("hosts restored", "Previous content brought back");
      await reload();
      if (editorOpen) await loadRaw();
    } catch (e) {
      log.error("network.hosts_restore", "hosts", "Restore failed", String(e));
      toast.error("Restore failed", String(e));
    }
  }

  const grouped = $derived.by(() => {
    const out: Record<string, Blocklist[]> = {};
    for (const b of BLOCKLISTS) (out[b.category] ||= []).push(b);
    return out;
  });

  const categoryOrder: Blocklist["category"][] = ["telemetry", "ads", "social", "malware"];
  const activeCount = $derived(active.length);
</script>

<PageHeader title="Hosts & blocklists">
  {#snippet actions()}
    <div class="flex items-center gap-2">
      {#if isTauri() && admin.elevated}
        <Button variant="outline" onclick={openEditor} disabled={loading}>
          <FileText />
          Raw editor
        </Button>
        <Button
          variant="outline"
          onclick={() => (restoreConfirmOpen = true)}
          disabled={!backupExists || loading}
        >
          <Undo2 />
          Restore backup
        </Button>
        <Button variant="outline" onclick={reload} disabled={loading}>
          <RefreshCw class={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      {/if}
    </div>
  {/snippet}
  {#if loading}
    Reading hosts file…
  {:else if isTauri() && admin.elevated}
    <span class="font-medium text-foreground tabular-nums">{activeCount}</span>
    Reclaim block{activeCount === 1 ? "" : "s"} active. Backup
    {#if backupExists}available{:else}not present yet{/if}.
  {:else if isTauri()}
    Editing the hosts file needs administrator rights.
  {:else}
    Browser preview — hosts editing needs the built app.
  {/if}
</PageHeader>

{#if isTauri() && admin.checked && !admin.elevated}
  <AdminBanner
    title="Hosts editing needs administrator"
    description="The hosts file lives under System32\drivers\etc and is write-protected. Click to relaunch with UAC."
    declinedToast="Hosts editing requires admin."
  />
{:else if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — hosts editing needs the built app.
    </div>
  </Card>
{:else if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Reading hosts file…
  </div>
{:else}
  {#each categoryOrder as cat (cat)}
    {@const lists = grouped[cat] ?? []}
    {#if lists.length > 0}
      <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2 mt-6">
        {CATEGORY_LABELS[cat]}
      </h2>
      <Card class="overflow-hidden gap-0 py-0 card-inset mb-4">
        {#each lists as b (b.id)}
          {@const block = activeBlock(b.id)}
          {@const isOn = !!block}
          {@const isBusy = busy.has(b.id)}
          {@const remote = b.source !== "builtin"}
          <div class="flex items-start gap-3 py-4 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors">
            <div class="grid place-items-center size-8 rounded-md bg-accent/60 shrink-0">
              {#if remote}
                <Globe2 class="size-4 text-muted-foreground" />
              {:else}
                <ShieldOff class="size-4 text-muted-foreground" />
              {/if}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium">{b.name}</span>
                {#if remote}
                  <Badge variant="outline">Remote</Badge>
                {:else}
                  <Badge variant="default">{b.builtinEntries?.length ?? 0} hosts</Badge>
                {/if}
                {#if isOn}
                  <Badge variant="success">{block.entryCount} active</Badge>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground mt-1 leading-relaxed">{b.description}</p>
              {#if remote}
                <p class="text-[10px] text-muted-foreground/60 mt-1 font-mono break-all">{b.source}</p>
              {/if}
            </div>
            <div class="flex items-center gap-2 shrink-0 pt-1">
              {#if isBusy}
                <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
              {/if}
              <Switch
                checked={isOn}
                disabled={isBusy}
                onCheckedChange={(v) => toggleBlocklist(b, v)}
              />
            </div>
          </div>
        {/each}
      </Card>
    {/if}
  {/each}

  {#if active.length > 0}
    <Card class="card-inset mt-6">
      <div class="px-5 py-4">
        <h3 class="text-sm font-semibold mb-2 flex items-center gap-2">
          <AlertTriangle class="size-4 text-amber-500" />
          Foreign blocks present
        </h3>
        <p class="text-xs text-muted-foreground mb-3">
          These Reclaim-marked blocks are in your hosts file. Remove any that are no longer needed.
        </p>
        <div class="flex flex-wrap gap-2">
          {#each active.filter((a) => !BLOCKLISTS.some((b) => b.name === a.name)) as orphan (orphan.name)}
            <button
              type="button"
              class="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs hover:bg-destructive/10 hover:text-destructive transition-colors"
              onclick={async () => {
                try {
                  await removeBlocklist(orphan.name);
                  log.success("network.blocklist_remove", orphan.name, "Orphan removed");
                  toast.success(`${orphan.name} removed`);
                  await reload();
                } catch (e) {
                  toast.error("Remove failed", String(e));
                }
              }}
            >
              {orphan.name} · {orphan.entryCount}
            </button>
          {/each}
          {#if active.filter((a) => !BLOCKLISTS.some((b) => b.name === a.name)).length === 0}
            <span class="text-xs text-muted-foreground">None — only known blocks present.</span>
          {/if}
        </div>
      </div>
    </Card>
  {/if}
{/if}

<Dialog
  bind:open={editorOpen}
  title="Raw hosts editor"
  description="Direct edit of {`System32\\drivers\\etc\\hosts`}. Saving writes a backup to hosts.reclaim.bak first."
  class="max-w-3xl"
>
  <textarea
    bind:value={rawText}
    oninput={() => (rawDirty = true)}
    spellcheck="false"
    class="w-full h-[420px] rounded-md border border-input bg-card/60 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring resize-none"
  ></textarea>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (editorOpen = false)} disabled={savingRaw}>
      Cancel
    </Button>
    <Button onclick={saveRaw} disabled={!rawDirty || savingRaw}>
      <Save />
      {savingRaw ? "Saving…" : "Save hosts"}
    </Button>
  {/snippet}
</Dialog>

<Dialog
  bind:open={restoreConfirmOpen}
  title="Restore hosts from backup?"
  description="Replaces the current hosts file with the most recent hosts.reclaim.bak. The currently active blocklists will be reverted."
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (restoreConfirmOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={doRestore}>
      <Undo2 />
      Restore now
    </Button>
  {/snippet}
</Dialog>
