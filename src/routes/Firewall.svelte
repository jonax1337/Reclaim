<script lang="ts">
  import { Button, Badge, Dialog, PageHeader, SectionHeading, EmptyState, ListCard, ListRow, RowIcon, toast } from "$lib/ui";
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

<PageHeader title="Telemetry firewall">
  {#snippet actions()}
    <Button variant="outline" onclick={reload} disabled={loading || !canFetch}>
      <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  {/snippet}
  Windows Firewall outbound blocks for Microsoft telemetry programs and endpoints — defense in
  depth alongside the hosts blocklists.
  {#if refreshing}
    · <span class="text-muted-foreground/70">refreshing…</span>
  {/if}
</PageHeader>

{#if isTauri() && admin.checked && !admin.elevated}
  <AdminBanner
    title="Firewall changes need administrator"
    description="Creating outbound block rules in Windows Firewall requires elevated rights. Click here to relaunch with UAC."
    declinedToast="Firewall blocks require admin."
  />
{:else if !isTauri()}
  <EmptyState>Browser preview — firewall needs the built app.</EmptyState>
{:else if loading}
  <EmptyState loading>Loading firewall blocks…</EmptyState>
{:else}
  <SectionHeading title="Telemetry blocks">
    Rules are created under the <code class="font-mono text-[11px]">Reclaim:</code> group so they're
    easy to audit and remove. IP-based rules can become stale — re-apply periodically to refresh.
  </SectionHeading>

  <ListCard>
    {#each FIREWALL_BUILTINS as b (b.id)}
      {@const isBusy = busy.has(b.id)}
      {@const a = active(b)}
      <ListRow density="md">
        <RowIcon icon={Flame} iconClass={a ? "text-primary" : "text-muted-foreground"} />
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
      </ListRow>
    {/each}
  </ListCard>
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
