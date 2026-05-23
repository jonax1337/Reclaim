<script lang="ts">
  import { Card, Button, Badge, Checkbox, Dialog, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Trash2,
    ShieldOff,
    CheckCircle2,
  } from "@lucide/svelte";
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { AI_TWEAKS } from "$lib/tweaks/catalog";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    recallWipe,
    type RecallStatus,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { recallStatusResource } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);
  const statusRes = $derived(canFetch ? recallStatusResource() : null);
  const status = $derived<RecallStatus | null>(statusRes?.data ?? null);
  const loading = $derived(statusRes?.loading ?? false);
  const refreshing = $derived(statusRes?.revalidating ?? false);

  let alsoRemoveAppx = $state(false);
  let alsoSetPolicy = $state(true);
  let wipeBusy = $state(false);
  let confirmOpen = $state(false);

  async function reload() {
    if (!canFetch) return;
    invalidate("recall.status");
    await statusRes?.refresh();
  }

  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  async function doWipe() {
    confirmOpen = false;
    if (wipeBusy) return;
    wipeBusy = true;
    try {
      const r = await recallWipe(alsoRemoveAppx, alsoSetPolicy);
      if (r.success) {
        log.success("recall.wipe", "Recall data", "Snapshot store wiped", r.stdout);
        toast.success("Recall data wiped");
      } else {
        log.error("recall.wipe", "Recall data", "Wipe reported failure", r.stderr || r.stdout);
        toast.error("Wipe completed with errors", r.stderr || r.stdout);
      }
      invalidate("recall.status");
      await statusRes?.refresh();
    } catch (e) {
      toast.error("Wipe failed", String(e));
      log.error("recall.wipe", "Recall data", "Failed", String(e));
    } finally {
      wipeBusy = false;
    }
  }
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">AI &amp; Copilot</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Disable Copilot, Recall, Click to Do and AI features in Edge.
    </p>
  </div>
  {#if canFetch}
    <Button variant="outline" onclick={reload} disabled={loading}>
      <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
      Refresh Recall status
    </Button>
  {/if}
</header>

{#if isTauri() && admin.checked && !admin.elevated}
  <AdminBanner
    title="Wiping Recall data needs administrator"
    description="The Recall snapshot store sits under your local profile but is locked. Click here to relaunch with UAC."
    declinedToast="Recall wipe needs admin — the toggles below still work."
  />
{:else if canFetch}
  <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
    Recall snapshot store
  </h2>
  <Card class="card-inset mb-6">
    <div class="px-5 py-4 space-y-4">
      <p class="text-xs text-muted-foreground leading-relaxed">
        Scrubs every snapshot Recall has captured on this device. Independent of disabling the feature
        — use this if Recall was previously enabled and you want the on-disk store gone.
      </p>

      {#if status}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Status
            </div>
            <div class="mt-1">
              {#if status.dataPresent}
                <Badge variant="warning">Snapshots present</Badge>
              {:else}
                <Badge variant="success">
                  <CheckCircle2 class="size-2.5" />
                  Empty
                </Badge>
              {/if}
            </div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Disk use
            </div>
            <div class="text-sm font-mono mt-1 tabular-nums">{fmtSize(status.sizeBytes)}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Snapshots
            </div>
            <div class="text-sm font-mono mt-1 tabular-nums">{status.snapshotCount}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Policy
            </div>
            <div class="mt-1">
              {#if status.policyDisabled}
                <Badge variant="success">Disabled</Badge>
              {:else}
                <Badge variant="outline">Allowed</Badge>
              {/if}
            </div>
          </div>
        </div>
        {#if status.dataPath}
          <p class="text-[11px] font-mono text-muted-foreground/70 break-all">{status.dataPath}</p>
        {/if}
      {/if}

      <label
        class="flex items-start gap-3 p-3 rounded-lg border border-foreground/10 hover:bg-accent/30 transition-colors cursor-pointer"
      >
        <div class="pt-0.5">
          <Checkbox bind:checked={alsoSetPolicy} disabled={wipeBusy} />
        </div>
        <div class="flex-1 min-w-0">
          <span class="text-sm font-medium">Block Recall via policy after wipe</span>
          <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
            Writes <code class="font-mono text-[11px]">DisableAIDataAnalysis = 1</code> so Recall cannot
            silently come back via a feature update.
          </p>
        </div>
      </label>
      <label
        class="flex items-start gap-3 p-3 rounded-lg border border-foreground/10 hover:bg-accent/30 transition-colors cursor-pointer"
      >
        <div class="pt-0.5">
          <Checkbox bind:checked={alsoRemoveAppx} disabled={wipeBusy} />
        </div>
        <div class="flex-1 min-w-0">
          <span class="text-sm font-medium">Also remove the Recall AppX package</span>
          <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
            Uninstalls <code class="font-mono text-[11px]">MicrosoftWindows.Client.AIX</code>.
            Aggressive — Windows may reinstall it on the next feature update.
          </p>
        </div>
      </label>

      <div class="flex justify-end">
        <Button
          variant="destructive"
          onclick={() => (confirmOpen = true)}
          disabled={wipeBusy || !status?.dataPresent}
        >
          {#if wipeBusy}
            <Loader2 class="animate-spin" />
          {:else}
            <Trash2 />
          {/if}
          Wipe Recall data
        </Button>
      </div>
    </div>
  </Card>
{/if}

<TweakSection tweaks={AI_TWEAKS} />

<Dialog
  bind:open={confirmOpen}
  title="Wipe Recall snapshot store?"
  description={status?.dataPresent
    ? `This permanently deletes ${fmtSize(status.sizeBytes)} of Recall snapshots from ${status.dataPath}. This cannot be undone.`
    : "Nothing to wipe."}
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={doWipe}>
      <ShieldOff />
      Wipe everything
    </Button>
  {/snippet}
</Dialog>
