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
    Select,
    InfoBanner,
    toast,
  } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Network as NetworkIcon,
    Cable,
    Wifi,
    Power,
    Sparkles,
    RotateCcw,
    AlertTriangle,
    CheckCircle2,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    nicListAdapters,
    nicListProperties,
    nicSetProperty,
    nicResetProperty,
    nicRestart,
    type NicAdapter,
    type NicProperty,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);

  let adapters = $state<NicAdapter[]>([]);
  let selectedAdapter = $state<string>("");
  let properties = $state<NicProperty[]>([]);
  let loading = $state(true);
  let refreshing = $state(false);
  let busyKey = $state<Set<string>>(new Set());
  let showAll = $state(false);

  let restartConfirmOpen = $state(false);

  // Curated property catalog with recommendations.
  // Recommendations follow the gaming/latency-first stance — desktop on AC.
  type CuratedDef = {
    keyword: string;
    title: string;
    description: string;
    /** Optional recommended registry value as a string (matches RegistryValue). */
    recommended?: string;
    /** Tone of the recommendation when not matched. */
    tone?: "warn" | "info";
    /** True if changing this needs a NIC restart to take effect. */
    needsRestart?: boolean;
  };

  const CURATED: CuratedDef[] = [
    {
      keyword: "*EEE",
      title: "Energy-Efficient Ethernet",
      description:
        "IEEE 802.3az — drops link power on idle. Adds ~100–200 µs wake-up jitter. Turn OFF for gaming.",
      recommended: "0",
      tone: "warn",
    },
    {
      keyword: "*FlowControl",
      title: "Flow control",
      description:
        "Sends PAUSE frames when buffers overrun. Modern switches handle backpressure better. Turn OFF for predictable latency.",
      recommended: "0",
      tone: "info",
    },
    {
      keyword: "*InterruptModeration",
      title: "Interrupt moderation",
      description:
        "Batches NIC interrupts to reduce CPU load. Turning OFF lowers per-packet latency at the cost of CPU. Try it if your CPU has headroom.",
      tone: "info",
    },
    {
      keyword: "*JumboPacket",
      title: "Jumbo Packet",
      description:
        "MTU > 1500. Useful on 10GbE LANs with end-to-end jumbo support. Leave at default (Disabled / 1500) for internet traffic.",
      tone: "info",
    },
    {
      keyword: "*RSS",
      title: "Receive Side Scaling",
      description:
        "Spreads RX processing across CPU cores. Should be ON on multi-core systems.",
      recommended: "1",
      tone: "warn",
    },
    {
      keyword: "*PriorityVLANTag",
      title: "Priority & VLAN tag",
      description:
        "Allows the NIC to honor 802.1p / 802.1Q tags. Required for some QoS-aware home networks.",
      tone: "info",
    },
    {
      keyword: "*ReceiveBuffers",
      title: "Receive buffers",
      description:
        "Number of ring buffers for incoming frames. Larger = more headroom under bursts, more RAM. Default is usually fine.",
      tone: "info",
      needsRestart: true,
    },
    {
      keyword: "*TransmitBuffers",
      title: "Transmit buffers",
      description: "Same idea, outbound. Default is usually fine.",
      tone: "info",
      needsRestart: true,
    },
    {
      keyword: "*SpeedDuplex",
      title: "Speed & duplex",
      description:
        "Force a link speed/duplex instead of auto-negotiating. Only override if you have a known cable/switch issue.",
      tone: "info",
      needsRestart: true,
    },
    {
      keyword: "*LsoV2IPv4",
      title: "Large Send Offload v2 (IPv4)",
      description: "Offloads TCP segmentation to the NIC. Generally beneficial, leave ON.",
      recommended: "1",
      tone: "info",
    },
    {
      keyword: "*LsoV2IPv6",
      title: "Large Send Offload v2 (IPv6)",
      description: "IPv6 counterpart. Leave ON.",
      recommended: "1",
      tone: "info",
    },
    {
      keyword: "*TCPChecksumOffloadIPv4",
      title: "TCP checksum offload (IPv4)",
      description: "Hand checksum work to the NIC. Leave at default (Rx & Tx Enabled).",
      tone: "info",
    },
    {
      keyword: "*UDPChecksumOffloadIPv4",
      title: "UDP checksum offload (IPv4)",
      description: "Same story for UDP. Leave at default.",
      tone: "info",
    },
    {
      keyword: "GreenEthernet",
      title: "Green Ethernet (Realtek)",
      description:
        "Realtek-specific power saver — drops the link to idle frequently. Turn OFF for gaming.",
      recommended: "0",
      tone: "warn",
    },
    {
      keyword: "AdvancedEEE",
      title: "Advanced EEE",
      description: "Aggressive variant of EEE on some Realtek chips. Turn OFF for gaming.",
      recommended: "0",
      tone: "warn",
    },
    {
      keyword: "*SelectiveSuspend",
      title: "USB selective suspend (NIC)",
      description:
        "Lets the USB stack power down the NIC if it's USB-attached. Turn OFF if you see disconnects.",
      recommended: "0",
      tone: "info",
    },
  ];

  async function refresh() {
    if (!canFetch) {
      loading = false;
      return;
    }
    refreshing = true;
    try {
      adapters = await nicListAdapters();
      if (adapters.length > 0 && (!selectedAdapter || !adapters.find((a) => a.name === selectedAdapter))) {
        // Prefer the first "Up" adapter, otherwise the first listed.
        const up = adapters.find((a) => a.status === "Up");
        selectedAdapter = up?.name ?? adapters[0].name;
      }
      if (selectedAdapter) {
        properties = await nicListProperties(selectedAdapter);
      }
    } catch (e) {
      toast.error("Could not list adapters", (e as Error).message);
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  async function reloadProperties() {
    if (!selectedAdapter || !canFetch) return;
    refreshing = true;
    try {
      properties = await nicListProperties(selectedAdapter);
    } catch (e) {
      toast.error("Could not list properties", (e as Error).message);
    } finally {
      refreshing = false;
    }
  }

  onMount(() => {
    refresh();
  });

  $effect(() => {
    if (selectedAdapter && canFetch) {
      reloadProperties();
    }
  });

  async function setProperty(prop: NicProperty, value: string) {
    if (!selectedAdapter) return;
    const key = `${prop.registryKeyword}=${value}`;
    busyKey = new Set([...busyKey, prop.registryKeyword]);
    try {
      await nicSetProperty(selectedAdapter, prop.registryKeyword, value);
      log.success("tweak.apply", `${selectedAdapter} · ${prop.displayName}`, key);
      await reloadProperties();
    } catch (e) {
      toast.error("Could not set property", (e as Error).message);
    } finally {
      busyKey.delete(prop.registryKeyword);
      busyKey = new Set(busyKey);
    }
  }

  async function resetProperty(prop: NicProperty) {
    if (!selectedAdapter) return;
    busyKey = new Set([...busyKey, prop.registryKeyword]);
    try {
      await nicResetProperty(selectedAdapter, prop.registryKeyword);
      log.info("tweak.revert", `${selectedAdapter} · ${prop.displayName}`, "reset");
      await reloadProperties();
    } catch (e) {
      toast.error("Could not reset property", (e as Error).message);
    } finally {
      busyKey.delete(prop.registryKeyword);
      busyKey = new Set(busyKey);
    }
  }

  async function restartAdapter() {
    restartConfirmOpen = false;
    if (!selectedAdapter) return;
    try {
      await nicRestart(selectedAdapter);
      toast.success("Adapter restarted", `${selectedAdapter} cycled — link should be back.`);
      await reloadProperties();
    } catch (e) {
      toast.error("Restart failed", (e as Error).message);
    }
  }

  function findProperty(keyword: string): NicProperty | undefined {
    return properties.find((p) => p.registryKeyword.toLowerCase() === keyword.toLowerCase());
  }

  function valueLabel(prop: NicProperty, value: string): string {
    const idx = prop.validValues.indexOf(value);
    if (idx >= 0 && idx < prop.validDisplayValues.length) {
      const disp = prop.validDisplayValues[idx];
      return disp && disp !== value ? `${disp} (${value})` : value;
    }
    return value;
  }

  function currentValueLabel(prop: NicProperty): string {
    return prop.displayValue && prop.displayValue !== prop.registryValue
      ? `${prop.displayValue} (${prop.registryValue})`
      : prop.registryValue;
  }

  const curatedRows = $derived(
    CURATED.map((def) => ({ def, prop: findProperty(def.keyword) })).filter((x) => !!x.prop) as Array<{
      def: CuratedDef;
      prop: NicProperty;
    }>,
  );

  const uncuratedRows = $derived(
    properties.filter(
      (p) => !CURATED.find((d) => d.keyword.toLowerCase() === p.registryKeyword.toLowerCase()),
    ),
  );

  const selectedAdapterMeta = $derived(adapters.find((a) => a.name === selectedAdapter));
</script>

<PageHeader title="NIC tuning">
  {#snippet actions()}
    <Button variant="outline" onclick={refresh} disabled={loading || !canFetch}>
      <RefreshCw class={refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  {/snippet}
  Live editor for Windows network-adapter advanced properties. Curated list with gaming-first
  recommendations on top; full property dump under "Show all".
</PageHeader>

{#if !isTauri()}
  <EmptyState>Browser preview — needs the built app.</EmptyState>
{:else if admin.checked && !admin.elevated}
  <AdminBanner
    title="NIC tuning needs administrator"
    description="Set-NetAdapterAdvancedProperty requires elevation."
    declinedToast="NIC tuning needs admin."
  />
{:else if loading}
  <EmptyState loading>Querying network adapters…</EmptyState>
{:else if adapters.length === 0}
  <EmptyState>No physical network adapters found.</EmptyState>
{:else}
  <!-- Adapter picker + meta -->
  <Card class="card-inset mb-6">
    <CardContent>
      <div class="flex items-start gap-3">
        <div class="size-10 rounded-full bg-primary/15 grid place-items-center shrink-0">
          {#if selectedAdapterMeta?.mediaType?.toLowerCase().includes("802.11")}
            <Wifi class="size-5 text-primary" />
          {:else}
            <Cable class="size-5 text-primary" />
          {/if}
        </div>
        <div class="flex-1 min-w-0">
          <Select.Root
            type="single"
            value={selectedAdapter}
            onValueChange={(v) => (selectedAdapter = v ?? "")}
          >
            <Select.Trigger>
              <span>{selectedAdapterMeta?.interfaceDescription ?? selectedAdapter}</span>
            </Select.Trigger>
            <Select.Content>
              {#each adapters as a (a.name)}
                <Select.Item value={a.name} label={a.name}>
                  {a.interfaceDescription} · {a.name}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          {#if selectedAdapterMeta}
            <div class="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
              <Badge variant={selectedAdapterMeta.status === "Up" ? "success" : "warning"}>
                {selectedAdapterMeta.status}
              </Badge>
              <span>·</span>
              <span>{selectedAdapterMeta.linkSpeed}</span>
              <span>·</span>
              <span class="font-mono">{selectedAdapterMeta.macAddress}</span>
            </div>
          {/if}
        </div>
        <Button variant="outline" onclick={() => (restartConfirmOpen = true)} disabled={refreshing}>
          <Power />
          Restart adapter
        </Button>
      </div>
    </CardContent>
  </Card>

  {#if curatedRows.length === 0 && properties.length === 0}
    <EmptyState>This adapter exposes no advanced properties via the network stack.</EmptyState>
  {:else}
    <SectionHeading title="Curated tweaks" description="Latency-first picks for desktop gaming." />
    {#if curatedRows.length === 0}
      <EmptyState>
        None of the curated properties are exposed by this adapter — probably a virtual or
        non-Intel/Realtek NIC. Try "Show all" below.
      </EmptyState>
    {:else}
      <div class="space-y-2 mb-6">
        {#each curatedRows as { def, prop } (def.keyword)}
          {@const isBusy = busyKey.has(prop.registryKeyword)}
          {@const matchesRec = def.recommended != null && prop.registryValue === def.recommended}
          <Card class="card-inset">
            <CardContent>
              <div class="flex items-start gap-3">
                <div class="size-9 rounded-md bg-surface-2 border border-hairline grid place-items-center shrink-0">
                  {#if matchesRec}
                    <CheckCircle2 class="size-4 text-success" />
                  {:else if def.tone === "warn"}
                    <AlertTriangle class="size-4 text-amber-600 dark:text-amber-400" />
                  {:else}
                    <Sparkles class="size-4 text-muted-foreground" />
                  {/if}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-semibold">{def.title}</span>
                    <span class="text-[10px] font-mono text-muted-foreground/70">
                      {prop.registryKeyword}
                    </span>
                    {#if def.recommended != null}
                      {#if matchesRec}
                        <Badge variant="success">On recommendation</Badge>
                      {:else}
                        <Badge variant="warning">
                          Recommend: {valueLabel(prop, def.recommended)}
                        </Badge>
                      {/if}
                    {/if}
                    {#if def.needsRestart}
                      <Badge variant="warning">Needs adapter restart</Badge>
                    {/if}
                  </div>
                  <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {def.description}
                  </p>
                </div>
                <div class="shrink-0 w-48">
                  {#if prop.validValues.length > 0}
                    <Select.Root
                      type="single"
                      value={prop.registryValue}
                      onValueChange={(v) => v != null && setProperty(prop, v)}
                    >
                      <Select.Trigger>
                        <span>{currentValueLabel(prop)}</span>
                      </Select.Trigger>
                      <Select.Content>
                        {#each prop.validValues as v, i (v)}
                          <Select.Item value={v} label={prop.validDisplayValues[i] ?? v}>
                            {prop.validDisplayValues[i] ?? v}
                          </Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  {:else}
                    <span class="text-xs font-mono">{currentValueLabel(prop)}</span>
                  {/if}
                  <div class="flex items-center justify-end gap-1 mt-1">
                    {#if isBusy}
                      <Loader2 class="size-3 animate-spin text-muted-foreground" />
                    {/if}
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 px-2 text-xs"
                      onclick={() => resetProperty(prop)}
                      disabled={isBusy}
                    >
                      <RotateCcw class="size-3" />
                      Reset
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        {/each}
      </div>
    {/if}

    {#if uncuratedRows.length > 0}
      <SectionHeading
        title="All other properties"
        description="Raw dump from Get-NetAdapterAdvancedProperty — change at your own risk."
      >
        {#snippet actions()}
          <Button variant="ghost" size="sm" onclick={() => (showAll = !showAll)}>
            {showAll ? "Hide" : `Show all (${uncuratedRows.length})`}
          </Button>
        {/snippet}
      </SectionHeading>
      {#if showAll}
        <div class="space-y-2 mb-6">
          {#each uncuratedRows as prop (prop.registryKeyword)}
            {@const isBusy = busyKey.has(prop.registryKeyword)}
            <Card class="card-inset">
              <CardContent>
                <div class="flex items-start gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-sm font-medium">{prop.displayName}</span>
                      <span class="text-[10px] font-mono text-muted-foreground/70">
                        {prop.registryKeyword}
                      </span>
                    </div>
                    {#if prop.defaultValue}
                      <p class="text-xs text-muted-foreground mt-0.5">
                        Default: {valueLabel(prop, prop.defaultValue)}
                      </p>
                    {/if}
                  </div>
                  <div class="shrink-0 w-48">
                    {#if prop.validValues.length > 0}
                      <Select.Root
                        type="single"
                        value={prop.registryValue}
                        onValueChange={(v) => v != null && setProperty(prop, v)}
                      >
                        <Select.Trigger>
                          <span>{currentValueLabel(prop)}</span>
                        </Select.Trigger>
                        <Select.Content>
                          {#each prop.validValues as v, i (v)}
                            <Select.Item value={v} label={prop.validDisplayValues[i] ?? v}>
                              {prop.validDisplayValues[i] ?? v}
                            </Select.Item>
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    {:else}
                      <span class="text-xs font-mono">{currentValueLabel(prop)}</span>
                    {/if}
                    <div class="flex items-center justify-end gap-1 mt-1">
                      {#if isBusy}
                        <Loader2 class="size-3 animate-spin text-muted-foreground" />
                      {/if}
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-6 px-2 text-xs"
                        onclick={() => resetProperty(prop)}
                        disabled={isBusy}
                      >
                        <RotateCcw class="size-3" />
                        Reset
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          {/each}
        </div>
      {/if}
    {/if}

    <InfoBanner tone="info">
      Property names ending in <code>*</code> are Windows-standard registry keywords (locale-
      independent). Reset uses <code>Reset-NetAdapterAdvancedProperty</code>, which restores the
      driver's published default — not what the value was when Reclaim launched.
    </InfoBanner>
  {/if}
{/if}

<Dialog
  bind:open={restartConfirmOpen}
  title="Restart this adapter?"
  description="Disables and re-enables {selectedAdapter}. Your link will drop for a few seconds — any in-flight network ops will fail."
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (restartConfirmOpen = false)}>Cancel</Button>
    <Button onclick={restartAdapter}>
      <Power />
      Restart
    </Button>
  {/snippet}
</Dialog>
