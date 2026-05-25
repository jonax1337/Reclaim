<script lang="ts">
  import { onMount } from "svelte";
  import {
    Button,
    Card,
    Badge,
    Dialog,
    PageHeader,
    SectionHeading,
    EmptyState,
    ListCard,
    ListRow,
    RowIcon,
    FormField,
    TextInput,
    toast,
  } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    LifeBuoy,
    Cpu,
    ShieldAlert,
    Wifi,
    History,
    Plus,
    RotateCcw,
    Clock,
    AlertTriangle,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    listRestorePoints,
    revertToRestorePoint,
    advancedRestart,
    createRestorePoint,
    type RestorePoint,
    type AdvancedRestartMode,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);

  let points = $state<RestorePoint[]>([]);
  let loading = $state(false);
  let restartConfirmOpen = $state(false);
  let pendingRestart = $state<{
    mode: AdvancedRestartMode;
    title: string;
    description: string;
  } | null>(null);
  let revertConfirmOpen = $state(false);
  let pendingRevert = $state<RestorePoint | null>(null);
  let createOpen = $state(false);
  let createDesc = $state("Reclaim manual checkpoint");
  let creating = $state(false);
  let undoHintOpen = $state(false);
  let undoHint = $state("");

  const RESTART_TARGETS: {
    mode: AdvancedRestartMode;
    title: string;
    description: string;
    icon: typeof LifeBuoy;
    tone: "muted" | "primary";
    danger?: boolean;
  }[] = [
    {
      mode: "menu",
      title: "Advanced Startup menu",
      description:
        "Reboots into Windows Recovery Environment (WinRE). From there you can pick Safe Mode, Startup Settings, Command Prompt, UEFI firmware, or system image recovery.",
      icon: LifeBuoy,
      tone: "muted",
    },
    {
      mode: "firmware",
      title: "UEFI firmware setup",
      description:
        "Reboots directly into the motherboard's UEFI/BIOS setup screen. Skips the WinRE menu. Requires UEFI (not legacy BIOS) firmware.",
      icon: Cpu,
      tone: "muted",
    },
    {
      mode: "safe-minimal",
      title: "Safe Mode (Minimal)",
      description:
        "Boots Windows with only essential drivers and services — no networking, no third-party startup items. The boot flag is sticky: after you're done in Safe Mode, run the undo command shown to return to a normal boot.",
      icon: ShieldAlert,
      tone: "primary",
      danger: true,
    },
    {
      mode: "safe-network",
      title: "Safe Mode with Networking",
      description:
        "Same as Safe Mode (Minimal) but with the network stack loaded. The boot flag is sticky — same undo command applies.",
      icon: Wifi,
      tone: "primary",
      danger: true,
    },
  ];

  async function reload() {
    if (!canFetch) return;
    loading = true;
    try {
      points = await listRestorePoints();
    } catch (e) {
      toast.error("Could not list restore points", String(e));
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (canFetch) reload();
  });

  function askRestart(target: (typeof RESTART_TARGETS)[number]) {
    pendingRestart = {
      mode: target.mode,
      title: target.title,
      description: target.description,
    };
    restartConfirmOpen = true;
  }

  async function confirmRestart() {
    if (!pendingRestart) return;
    const p = pendingRestart;
    restartConfirmOpen = false;
    pendingRestart = null;
    try {
      const res = await advancedRestart(p.mode);
      log.success("recovery.restart", p.title, res.message);
      toast.success(p.title, res.message);
      if (res.undo_hint) {
        undoHint = res.undo_hint;
        undoHintOpen = true;
      }
    } catch (e) {
      log.error("recovery.restart", p.title, "Failed", String(e));
      toast.error(`${p.title} failed`, String(e));
    }
  }

  function askRevert(rp: RestorePoint) {
    pendingRevert = rp;
    revertConfirmOpen = true;
  }

  async function confirmRevert() {
    if (!pendingRevert) return;
    const rp = pendingRevert;
    revertConfirmOpen = false;
    pendingRevert = null;
    try {
      await revertToRestorePoint(rp.sequence_number);
      log.success(
        "recovery.restore_revert",
        rp.description,
        `Revert queued (sequence ${rp.sequence_number})`,
      );
      toast.success("System restore queued", "Your PC will restart in 10 seconds.");
    } catch (e) {
      log.error("recovery.restore_revert", rp.description, "Failed", String(e));
      toast.error("Restore failed", String(e));
    }
  }

  async function doCreate() {
    if (creating) return;
    creating = true;
    try {
      const res = await createRestorePoint(createDesc.trim() || "Reclaim manual checkpoint");
      if (!res.success) throw new Error(res.stderr || `PowerShell exit ${res.code}`);
      log.success("recovery.restore_create", createDesc, "Restore point created");
      toast.success("Restore point created");
      createOpen = false;
      createDesc = "Reclaim manual checkpoint";
      await reload();
    } catch (e) {
      toast.error("Create restore point failed", String(e));
    } finally {
      creating = false;
    }
  }

  function fmtTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }
</script>

<PageHeader
  title="Recovery"
  description="Advanced restart targets and Windows System Restore points."
>
  {#snippet actions()}
    {#if canFetch}
      <Button variant="outline" onclick={reload} disabled={loading}>
        {#if loading}<Loader2 class="animate-spin" />{:else}<RefreshCw />{/if}
        Refresh
      </Button>
    {/if}
  {/snippet}
</PageHeader>

{#if !canFetch}
  <AdminBanner description="Recovery operations (restart targets, system restore) need administrator rights." />
{:else}
  <div class="mb-6">
    <SectionHeading title="Advanced restart" />
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      {#each RESTART_TARGETS as t (t.mode)}
        <Card class="p-5">
          <div class="flex items-start gap-3">
            <RowIcon icon={t.icon} size="md" tone={t.tone} />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{t.title}</span>
                {#if t.danger}
                  <Badge variant="warning">
                    <AlertTriangle class="size-2.5" />
                    Sticky flag
                  </Badge>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground mt-1 leading-relaxed">{t.description}</p>
              <div class="mt-3">
                <Button size="sm" variant={t.danger ? "outline" : "default"} onclick={() => askRestart(t)}>
                  Restart now
                </Button>
              </div>
            </div>
          </div>
        </Card>
      {/each}
    </div>
  </div>

  <div class="mb-6">
    <SectionHeading title="System restore points">
      {#snippet actions()}
        <Button size="sm" variant="outline" onclick={() => (createOpen = true)}>
          <Plus />
          Create
        </Button>
      {/snippet}
    </SectionHeading>

    {#if loading && points.length === 0}
      <Card class="p-8 text-center text-sm text-muted-foreground">
        <Loader2 class="size-5 animate-spin mx-auto mb-2" />
        Loading restore points…
      </Card>
    {:else if points.length === 0}
      <EmptyState icon={History}>
        <div class="font-medium text-foreground mb-1">No restore points</div>
        <div class="max-w-md mx-auto">
          Windows System Protection has not captured any restore points on this PC. Click 'Create'
          to make one now (System Protection on C: gets enabled automatically).
        </div>
      </EmptyState>
    {:else}
      <ListCard>
        {#each points as rp (rp.sequence_number)}
          <ListRow>
            <RowIcon icon={History} size="md" tone="muted" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium truncate">{rp.description}</span>
                <Badge variant="outline">#{rp.sequence_number}</Badge>
                <Badge variant="outline">{rp.restore_point_type}</Badge>
              </div>
              <div class="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                <Clock class="size-3" />
                {fmtTime(rp.creation_time)}
              </div>
            </div>
            <Button size="sm" variant="outline" onclick={() => askRevert(rp)}>
              <RotateCcw />
              Revert
            </Button>
          </ListRow>
        {/each}
      </ListCard>
    {/if}
  </div>
{/if}

<Dialog
  bind:open={restartConfirmOpen}
  title={pendingRestart?.title ?? "Restart"}
  description={pendingRestart?.description ?? ""}
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (restartConfirmOpen = false)}>Cancel</Button>
    <Button
      variant={pendingRestart?.mode.startsWith("safe-") ? "destructive" : "default"}
      onclick={confirmRestart}
    >
      Restart now
    </Button>
  {/snippet}
</Dialog>

<Dialog
  bind:open={revertConfirmOpen}
  title="Revert to restore point?"
  description={pendingRevert
    ? `This will restart your computer and roll back system files, the registry, drivers, and Windows updates to the state at ${fmtTime(pendingRevert.creation_time)} ('${pendingRevert.description}'). Your personal files are not affected. The restart happens in 10 seconds.`
    : ""}
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (revertConfirmOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={confirmRevert}>
      <RotateCcw />
      Revert and restart
    </Button>
  {/snippet}
</Dialog>

<Dialog
  bind:open={createOpen}
  title="Create restore point"
  description="System Protection on C: will be enabled if it isn't already, then a checkpoint named below is captured."
>
  <FormField label="Description">
    <TextInput bind:value={createDesc} placeholder="Reclaim manual checkpoint" />
  </FormField>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (createOpen = false)} disabled={creating}>Cancel</Button>
    <Button onclick={doCreate} disabled={creating}>
      {#if creating}<Loader2 class="animate-spin" />{:else}<Plus />{/if}
      {creating ? "Creating…" : "Create"}
    </Button>
  {/snippet}
</Dialog>

<Dialog
  bind:open={undoHintOpen}
  title="Safe Mode flag is sticky"
  description="After you're done in Safe Mode, open an elevated Command Prompt or PowerShell on Windows and run the following to restore a normal boot:"
>
  <Card class="card-inset p-3">
    <code class="text-xs font-mono select-all">{undoHint}</code>
  </Card>
  {#snippet footer()}
    <Button onclick={() => (undoHintOpen = false)}>Got it</Button>
  {/snippet}
</Dialog>
