<script lang="ts">
  import { Card, Button, Badge, Dialog, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Flame,
    CheckCircle2,
    XCircle,
    ShieldOff,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    firewallApplyBlock,
    firewallRemoveBlock,
    type FirewallBlock,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { FIREWALL_BUILTINS, type FirewallBuiltin } from "$lib/network/firewall";
  import { firewallBlocksResource } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";
  import { cn } from "$lib/utils";

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);
  const blocksRes = $derived(canFetch ? firewallBlocksResource() : null);
  const blocks = $derived<FirewallBlock[]>(blocksRes?.data ?? []);
  const loading = $derived(blocksRes?.loading ?? false);
  const refreshing = $derived(blocksRes?.revalidating ?? false);

  let busy = $state<Set<string>>(new Set());
  let confirmRemoveOpen = $state(false);
  let pendingRemove = $state<FirewallBuiltin | null>(null);

  async function reload() {
    if (!canFetch) return;
    invalidate("firewall.blocks");
    await blocksRes?.refresh();
  }

  function active(b: FirewallBuiltin): FirewallBlock | undefined {
    return blocks.find((x) => x.name === b.name);
  }

  async function applyBlock(b: FirewallBuiltin) {
    if (busy.has(b.id)) return;
    busy = new Set(busy).add(b.id);
    try {
      const n = await firewallApplyBlock(b.name, b.programs, b.remoteAddresses);
      log.success("network.blocklist_apply", b.name, `Firewall block applied — ${n} rule(s)`);
      toast.success(`${b.name}: applied`, `${n} rule(s) active`);
      invalidate("firewall.blocks");
      await blocksRes?.refresh();
    } catch (e) {
      log.error("network.blocklist_apply", b.name, "Apply failed", String(e));
      toast.error("Firewall apply failed", String(e));
    } finally {
      const after = new Set(busy);
      after.delete(b.id);
      busy = after;
    }
  }

  function askRemove(b: FirewallBuiltin) {
    pendingRemove = b;
    confirmRemoveOpen = true;
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    const b = pendingRemove;
    confirmRemoveOpen = false;
    pendingRemove = null;
    if (busy.has(b.id)) return;
    busy = new Set(busy).add(b.id);
    try {
      await firewallRemoveBlock(b.name);
      log.success("network.blocklist_remove", b.name, "Firewall block removed");
      toast.success(`${b.name}: removed`);
      invalidate("firewall.blocks");
      await blocksRes?.refresh();
    } catch (e) {
      log.error("network.blocklist_remove", b.name, "Remove failed", String(e));
      toast.error("Firewall remove failed", String(e));
    } finally {
      const after = new Set(busy);
      after.delete(b.id);
      busy = after;
    }
  }
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Telemetry firewall</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Windows Firewall outbound blocks for Microsoft telemetry programs and endpoints —
      defense in depth alongside the hosts blocklists.
      {#if refreshing}
        · <span class="text-muted-foreground/70">refreshing…</span>
      {/if}
    </p>
  </div>
  <Button variant="outline" onclick={reload} disabled={loading || !canFetch}>
    <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
    Refresh
  </Button>
</header>

{#if isTauri() && admin.checked && !admin.elevated}
  <AdminBanner
    title="Firewall changes need administrator"
    description="Creating outbound block rules in Windows Firewall requires elevated rights. Click here to relaunch with UAC."
    declinedToast="Firewall blocks require admin."
  />
{:else if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — firewall needs the built app.
    </div>
  </Card>
{:else if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Loading firewall blocks…
  </div>
{:else}
  <p class="text-xs text-muted-foreground mb-3 leading-relaxed">
    Rules are created under the <code class="font-mono text-[11px]">Reclaim:</code> group so they're easy to
    audit and remove. IP-based rules can become stale — re-apply periodically to refresh.
  </p>

  <Card class="overflow-hidden gap-0 py-0 card-inset">
    {#each FIREWALL_BUILTINS as b (b.id)}
      {@const isBusy = busy.has(b.id)}
      {@const a = active(b)}
      <div
        class={cn(
          "relative flex items-start gap-3 py-4 px-5 border-b last:border-b-0 transition-colors",
          a ? "bg-primary/[0.03]" : "hover:bg-accent/40",
        )}
      >
        <span
          class={cn(
            "absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-all duration-300",
            a ? "bg-primary/60 opacity-100" : "opacity-0",
          )}
          aria-hidden="true"
        ></span>
        <div class="grid place-items-center size-8 rounded-md bg-accent/60 shrink-0">
          <Flame class={cn("size-4", a ? "text-primary" : "text-muted-foreground")} />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium">{b.name}</span>
            {#if a}
              <Badge variant="success">
                <CheckCircle2 class="size-2.5" />
                Active ({a.ruleCount} rule{a.ruleCount === 1 ? "" : "s"})
              </Badge>
            {:else}
              <Badge variant="outline">
                <XCircle class="size-2.5" />
                Inactive
              </Badge>
            {/if}
            {#if b.programs.length > 0}
              <Badge variant="outline">{b.programs.length} programs</Badge>
            {/if}
            {#if b.remoteAddresses.length > 0}
              <Badge variant="outline">{b.remoteAddresses.length} addresses</Badge>
            {/if}
          </div>
          <p class="text-xs text-muted-foreground mt-1 leading-relaxed">{b.description}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0 pt-0.5">
          {#if isBusy}
            <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
          {/if}
          {#if a}
            <Button
              size="sm"
              variant="outline"
              onclick={() => applyBlock(b)}
              disabled={isBusy}
              title="Re-apply (refresh IPs / programs)"
            >
              <RefreshCw />
              Re-apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onclick={() => askRemove(b)}
              disabled={isBusy}
            >
              <ShieldOff />
              Remove
            </Button>
          {:else}
            <Button size="sm" onclick={() => applyBlock(b)} disabled={isBusy}>
              <Flame />
              Apply
            </Button>
          {/if}
        </div>
      </div>
    {/each}
  </Card>
{/if}

<Dialog
  bind:open={confirmRemoveOpen}
  title={pendingRemove ? `Remove '${pendingRemove.name}' rules?` : ""}
  description={pendingRemove
    ? `This deletes all Windows Firewall rules under the 'Reclaim: ${pendingRemove.name}' group. Outbound traffic will no longer be blocked at the firewall layer.`
    : ""}
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmRemoveOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={confirmRemove}>
      <ShieldOff />
      Remove rules
    </Button>
  {/snippet}
</Dialog>
