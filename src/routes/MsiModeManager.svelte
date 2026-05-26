<script lang="ts">
  import { onMount } from "svelte";
  import {
    Button,
    Card,
    CardContent,
    Badge,
    Dialog,
    PageHeader,
    SectionHeading,
    EmptyState,
    Switch,
    SearchInput,
    InfoBanner,
    toast,
  } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    ShieldAlert,
    Monitor,
    Music2,
    HardDrive,
    Network as NetworkIcon,
    Cpu,
    Mouse,
    Usb,
    AlertTriangle,
    History,
    ChevronDown,
    ChevronRight,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    msiListDevices,
    msiSetSupported,
    createRestorePoint,
    type MsiDevice,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);

  let devices = $state<MsiDevice[]>([]);
  let loading = $state(true);
  let refreshing = $state(false);
  let busyIds = $state<Set<string>>(new Set());
  let filter = $state("");
  let expanded = $state<Set<string>>(new Set());

  let restorePointOpen = $state(false);
  let restorePointBusy = $state(false);
  let acknowledged = $state(false);

  // Persist acknowledged flag so repeat visits don't re-block UI.
  const ACK_KEY = "reclaim.msi.warning-acknowledged";

  onMount(() => {
    if (typeof localStorage !== "undefined") {
      acknowledged = localStorage.getItem(ACK_KEY) === "1";
    }
    refresh();
  });

  function ack() {
    acknowledged = true;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(ACK_KEY, "1");
      } catch {}
    }
  }

  async function refresh() {
    if (!canFetch) {
      loading = false;
      return;
    }
    refreshing = true;
    try {
      devices = await msiListDevices();
    } catch (e) {
      toast.error("Could not enumerate devices", (e as Error).message);
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  async function toggle(d: MsiDevice) {
    if (!acknowledged) {
      toast.warning("Acknowledge the warning first", "Scroll up and confirm.");
      return;
    }
    const next = !(d.msiSupported === 1);
    busyIds = new Set([...busyIds, d.instanceId]);
    try {
      await msiSetSupported(d.instanceId, next);
      log.success(
        "tweak.apply",
        d.friendlyName || d.instanceId,
        `MSISupported=${next ? 1 : "(removed)"}`,
      );
      await refresh();
    } catch (e) {
      toast.error("Could not toggle MSI mode", (e as Error).message);
    } finally {
      busyIds.delete(d.instanceId);
      busyIds = new Set(busyIds);
    }
  }

  async function makeRestorePoint() {
    restorePointBusy = true;
    try {
      const r = await createRestorePoint("Before MSI mode changes");
      if (r.success) {
        log.success("system.restore_point", "MSI manager", "Restore point created");
        toast.success("Restore point created", "You can roll back from /recovery.");
        restorePointOpen = false;
      } else {
        toast.error("Could not create restore point", r.stderr || r.stdout);
      }
    } catch (e) {
      toast.error("Could not create restore point", (e as Error).message);
    } finally {
      restorePointBusy = false;
    }
  }

  function toggleExpanded(id: string) {
    if (expanded.has(id)) {
      expanded.delete(id);
    } else {
      expanded.add(id);
    }
    expanded = new Set(expanded);
  }

  function iconForClass(klass: string) {
    switch (klass) {
      case "Display":
        return Monitor;
      case "MEDIA":
        return Music2;
      case "SCSIAdapter":
        return HardDrive;
      case "Net":
        return NetworkIcon;
      case "HIDClass":
        return Mouse;
      case "USB":
        return Usb;
      default:
        return Cpu;
    }
  }

  function classLabel(klass: string): string {
    switch (klass) {
      case "Display":
        return "Display / GPU";
      case "MEDIA":
        return "Audio";
      case "SCSIAdapter":
        return "Storage controllers (NVMe / SATA)";
      case "Net":
        return "Network adapters";
      case "HIDClass":
        return "Input / HID";
      case "USB":
        return "USB controllers";
      case "System":
        return "System devices";
      default:
        return klass;
    }
  }

  const filtered = $derived(
    filter.trim()
      ? devices.filter((d) =>
          (d.friendlyName + " " + d.manufacturer + " " + d.instanceId)
            .toLowerCase()
            .includes(filter.toLowerCase()),
        )
      : devices,
  );

  const grouped = $derived(() => {
    const map = new Map<string, MsiDevice[]>();
    for (const d of filtered) {
      const k = d.class || "Other";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(d);
    }
    return Array.from(map.entries());
  });

  // High-impact device classes that are worth highlighting in the recommendations.
  function recommendedFor(klass: string): boolean {
    return klass === "Display" || klass === "SCSIAdapter" || klass === "MEDIA";
  }

  function stateLabel(d: MsiDevice): string {
    if (!d.hasInterruptProps) return "Driver default";
    if (d.msiSupported === 1) return "MSI mode ON";
    if (d.msiSupported === 0) return "MSI mode OFF (forced line-based)";
    return "Driver default (subkey exists)";
  }

  function stateBadge(d: MsiDevice): "success" | "secondary" | "warning" {
    if (d.msiSupported === 1) return "success";
    if (d.msiSupported === 0) return "warning";
    return "secondary";
  }
</script>

<PageHeader title="MSI mode manager">
  {#snippet actions()}
    <Button variant="outline" onclick={refresh} disabled={loading || !canFetch}>
      <RefreshCw class={refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  {/snippet}
  Toggle Message-Signaled Interrupts per PCI device. The classic OC trick to cut interrupt
  latency on GPU, NVMe and audio.
</PageHeader>

{#if !isTauri()}
  <EmptyState>Browser preview — needs the built app.</EmptyState>
{:else if admin.checked && !admin.elevated}
  <AdminBanner
    title="MSI manager needs administrator"
    description="Writing under HKLM\\SYSTEM\\CurrentControlSet\\Enum requires elevation."
    declinedToast="MSI manager needs admin."
  />
{:else}
  <!-- Danger banner — sticky until the user explicitly acknowledges. -->
  {#if !acknowledged}
    <Card class="card-inset mb-6 border-destructive/40 bg-destructive/5">
      <CardContent>
        <div class="flex items-start gap-3">
          <ShieldAlert class="size-6 text-destructive shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0 space-y-2">
            <div class="text-sm font-semibold">Wrong MSI changes can prevent boot.</div>
            <p class="text-xs text-muted-foreground leading-relaxed">
              MSI mode is a low-level interrupt setting. Toggling it on a device whose driver
              doesn't fully support MSI can produce blue screens or an unbootable system. Strongly
              recommended: <strong>create a System Restore Point first</strong>. Apply changes one
              at a time and reboot between them so you know which one caused trouble.
            </p>
            <div class="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onclick={() => (restorePointOpen = true)}>
                <History />
                Create restore point
              </Button>
              <Button variant="destructive" size="sm" onclick={ack}>
                <AlertTriangle />
                I understand — let me toggle
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}

  {#if loading}
    <EmptyState loading>Enumerating PCI devices…</EmptyState>
  {:else if devices.length === 0}
    <EmptyState>No PCI devices found. (Are you in a VM with all-virtual hardware?)</EmptyState>
  {:else}
    <div class="mb-4">
      <SearchInput placeholder="Filter by name, manufacturer or instance ID…" bind:value={filter} />
    </div>

    {#each grouped() as [klass, list] (klass)}
      {@const IconCls = iconForClass(klass)}
      <SectionHeading title={classLabel(klass)}>
        {#snippet actions()}
          {#if recommendedFor(klass)}
            <Badge variant="success">High-impact for gaming</Badge>
          {/if}
          <span class="text-xs text-muted-foreground">{list.length}</span>
        {/snippet}
      </SectionHeading>
      <div class="space-y-2 mb-6">
        {#each list as d (d.instanceId)}
          {@const isBusy = busyIds.has(d.instanceId)}
          {@const isExpanded = expanded.has(d.instanceId)}
          {@const on = d.msiSupported === 1}
          <Card class="card-inset">
            <CardContent>
              <div class="flex items-start gap-3">
                <button
                  type="button"
                  class="size-9 rounded-md bg-surface-2 border border-hairline grid place-items-center shrink-0 hover:bg-surface-3 transition-colors"
                  onclick={() => toggleExpanded(d.instanceId)}
                  aria-label="Show details"
                >
                  <IconCls class="size-4 text-muted-foreground" />
                </button>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-medium">{d.friendlyName || "(no name)"}</span>
                    <Badge variant={stateBadge(d)}>{stateLabel(d)}</Badge>
                    {#if d.messageNumberLimit != null}
                      <Badge variant="secondary">
                        Limit: {d.messageNumberLimit}
                      </Badge>
                    {/if}
                    {#if !d.present}
                      <Badge variant="warning">Not present</Badge>
                    {/if}
                  </div>
                  <p class="text-xs text-muted-foreground mt-0.5 truncate">
                    {d.manufacturer || "Unknown manufacturer"}
                  </p>
                  {#if isExpanded}
                    <p class="text-[11px] font-mono text-muted-foreground/70 mt-2 break-all">
                      {d.instanceId}
                    </p>
                  {/if}
                </div>
                <div class="flex items-center gap-2 shrink-0 pt-0.5">
                  {#if isBusy}
                    <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
                  {/if}
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground transition-colors p-1"
                    onclick={() => toggleExpanded(d.instanceId)}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    {#if isExpanded}
                      <ChevronDown class="size-4" />
                    {:else}
                      <ChevronRight class="size-4" />
                    {/if}
                  </button>
                  <Switch
                    checked={on}
                    disabled={isBusy || !acknowledged}
                    onCheckedChange={() => toggle(d)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        {/each}
      </div>
    {/each}

    <InfoBanner tone="info">
      Toggling writes <code>MSISupported</code> under
      <code>HKLM\SYSTEM\CurrentControlSet\Enum\&lt;device&gt;\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties</code>.
      Switch OFF removes the value (driver default applies). Changes need a reboot to take effect.
    </InfoBanner>
  {/if}
{/if}

<Dialog
  bind:open={restorePointOpen}
  title="Create restore point?"
  description="Creates a Windows System Restore Point named 'Before MSI mode changes'. You can roll back from the Recovery page if something goes wrong."
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (restorePointOpen = false)} disabled={restorePointBusy}>
      Cancel
    </Button>
    <Button onclick={makeRestorePoint} disabled={restorePointBusy}>
      {#if restorePointBusy}<Loader2 class="animate-spin" />{/if}
      Create
    </Button>
  {/snippet}
</Dialog>
