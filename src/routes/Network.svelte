<script lang="ts">
  import { Card, Button, Badge, Dialog, PageHeader, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Globe,
    PlugZap,
    Wifi,
    WifiOff,
    Lock,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    setDnsServers,
    resetDnsServers,
    setDohTemplate,
    flushDns,
    type AdapterDns,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { DOH_PROVIDERS, findProviderByIpv4, type DohProvider } from "$lib/network/dns";
  import { cn } from "$lib/utils";
  import { dnsResource } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);
  const adaptersRes = $derived(canFetch ? dnsResource() : null);
  const adapters = $derived<AdapterDns[]>(adaptersRes?.data ?? []);
  const loading = $derived(adaptersRes?.loading ?? false);
  const refreshing = $derived(adaptersRes?.revalidating ?? false);

  let busy = $state<string | null>(null);

  let customOpen = $state(false);
  let customAdapter = $state<AdapterDns | null>(null);
  let customV4 = $state("");
  let customV6 = $state("");

  async function reload() {
    if (!canFetch) return;
    invalidate("network.dns");
    await adaptersRes?.refresh();
  }

  async function applyProvider(adapter: AdapterDns, p: DohProvider) {
    if (busy) return;
    busy = adapter.alias;
    try {
      await setDnsServers(adapter.alias, p.ipv4, p.ipv6);
      try {
        await setDohTemplate(p.ipv4[0]!, p.template, false);
      } catch (dohErr) {
        // DoH may fail on Win10 / earlier 22H2 builds — DNS itself still applied.
        toast.warning(
          "DNS set, DoH skipped",
          `Encrypted DoH could not be configured: ${String(dohErr)}`,
        );
      }
      log.success(
        "network.dns_set",
        adapter.alias,
        `Set DNS to ${p.name} (${p.ipv4.join(", ")})`,
      );
      toast.success(`${p.name} applied to ${adapter.alias}`, "DNS cache flushed");
      await reload();
    } catch (e) {
      log.error("network.dns_set", adapter.alias, "DNS set failed", String(e));
      toast.error("DNS change failed", String(e));
    } finally {
      busy = null;
    }
  }

  async function applyAllProvider(p: DohProvider) {
    if (busy) return;
    const targets = adapters.filter((a) => a.isUp);
    if (targets.length === 0) {
      toast.error("No connected adapters", "Connect to a network first.");
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const a of targets) {
      busy = a.alias;
      try {
        await setDnsServers(a.alias, p.ipv4, p.ipv6);
        ok++;
      } catch (e) {
        fail++;
        log.error("network.dns_set", a.alias, "DNS set failed", String(e));
      }
    }
    try {
      await setDohTemplate(p.ipv4[0]!, p.template, false);
    } catch {}
    busy = null;
    log.success("network.dns_set", "all-adapters", `Applied ${p.name} to ${ok} adapter(s)`);
    if (fail > 0) {
      toast.error(`${p.name} partial`, `${ok} succeeded, ${fail} failed`);
    } else {
      toast.success(`${p.name} applied`, `Active on ${ok} adapter(s)`);
    }
    await reload();
  }

  async function doReset(adapter: AdapterDns) {
    if (busy) return;
    busy = adapter.alias;
    try {
      await resetDnsServers(adapter.alias);
      log.success("network.dns_reset", adapter.alias, "Reverted to DHCP");
      toast.success(`${adapter.alias} reset to DHCP`);
      await reload();
    } catch (e) {
      log.error("network.dns_reset", adapter.alias, "Reset failed", String(e));
      toast.error("Reset failed", String(e));
    } finally {
      busy = null;
    }
  }

  function openCustom(a: AdapterDns) {
    customAdapter = a;
    customV4 = a.ipv4.join(", ");
    customV6 = a.ipv6.join(", ");
    customOpen = true;
  }

  async function saveCustom() {
    if (!customAdapter) return;
    const v4 = customV4
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const v6 = customV6
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    busy = customAdapter.alias;
    customOpen = false;
    try {
      await setDnsServers(customAdapter.alias, v4, v6);
      log.success(
        "network.dns_set",
        customAdapter.alias,
        `Custom DNS: ${v4.join(", ") || "DHCP IPv4"} / ${v6.join(", ") || "DHCP IPv6"}`,
      );
      toast.success(`${customAdapter.alias} updated`);
      await reload();
    } catch (e) {
      log.error("network.dns_set", customAdapter.alias, "Custom DNS failed", String(e));
      toast.error("DNS change failed", String(e));
    } finally {
      busy = null;
      customAdapter = null;
    }
  }

  async function doFlush() {
    try {
      const r = await flushDns();
      if (r.success) toast.success("DNS cache flushed");
      else toast.error("Flush failed", r.stderr || r.stdout);
    } catch (e) {
      toast.error("Flush failed", String(e));
    }
  }

  function detectProvider(a: AdapterDns): DohProvider | null {
    return findProviderByIpv4(a.ipv4);
  }
</script>

<PageHeader title="DNS & DoH">
  {#snippet actions()}
    <div class="flex items-center gap-2">
      {#if isTauri() && admin.elevated}
        <Button variant="outline" onclick={doFlush} disabled={loading}>
          <PlugZap />
          Flush cache
        </Button>
        <Button variant="outline" onclick={reload} disabled={loading}>
          <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
          Refresh
        </Button>
      {/if}
    </div>
  {/snippet}
  {#if loading}
    Querying network adapters…
  {:else if isTauri() && admin.elevated}
    Pick an encrypted DNS provider, or set per-adapter overrides.
  {:else if isTauri()}
    DNS configuration needs administrator rights.
  {:else}
    Browser preview — DNS configuration needs the built app.
  {/if}
</PageHeader>

{#if isTauri() && admin.checked && !admin.elevated}
  <AdminBanner
    title="DNS changes need administrator"
    description="Set-DnsClientServerAddress requires elevated rights. Click to relaunch with UAC."
    declinedToast="DNS changes require admin."
  />
{:else if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — DNS configuration needs the built app.
    </div>
  </Card>
{:else if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Querying network adapters…
  </div>
{:else}
  <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
    Quick presets — apply to all connected adapters
  </h2>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
    {#each DOH_PROVIDERS as p (p.id)}
      <button
        type="button"
        class={cn(
          "text-left rounded-xl border border-foreground/8 bg-card/95 backdrop-blur-md hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 p-4 group",
          busy ? "opacity-60 pointer-events-none" : "",
        )}
        onclick={() => applyAllProvider(p)}
      >
        <div class="flex items-center gap-2">
          <div class="grid place-items-center size-8 rounded-md bg-primary/15 text-primary shrink-0">
            <Lock class="size-4" />
          </div>
          <span class="font-semibold">{p.name}</span>
        </div>
        <p class="text-xs text-muted-foreground mt-2 leading-relaxed">{p.description}</p>
        <p class="text-[10px] text-muted-foreground/70 mt-2 font-mono">
          {p.ipv4.join(" · ")}
        </p>
      </button>
    {/each}
  </div>

  <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2 mt-6">
    Per-adapter
  </h2>
  {#if adapters.length === 0}
    <Card class="card-inset">
      <div class="px-6 py-16 text-center text-sm text-muted-foreground">
        No network adapters detected.
      </div>
    </Card>
  {:else}
    <Card class="overflow-hidden gap-0 py-0 card-inset">
      {#each adapters as a (a.alias)}
        {@const detected = detectProvider(a)}
        {@const isBusy = busy === a.alias}
        <div class="flex items-start gap-3 py-4 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors">
          <div class="grid place-items-center size-8 rounded-md bg-accent/60 shrink-0">
            {#if a.isUp}
              <Wifi class="size-4 text-success" />
            {:else}
              <WifiOff class="size-4 text-muted-foreground/60" />
            {/if}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium truncate">{a.alias}</span>
              {#if a.isUp}
                <Badge variant="success">Up</Badge>
              {:else}
                <Badge variant="outline">Down</Badge>
              {/if}
              {#if detected}
                <Badge variant="default">
                  <Globe class="size-3" />
                  {detected.name}
                </Badge>
              {:else if a.ipv4.length === 0 && a.ipv6.length === 0}
                <Badge variant="outline">DHCP</Badge>
              {/if}
            </div>
            <p class="text-[10px] text-muted-foreground/60 mt-1 font-mono truncate">
              {a.description}
            </p>
            <div class="text-xs text-muted-foreground mt-2 leading-relaxed flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <span class="text-foreground/70 font-medium">IPv4:</span>
                {a.ipv4.length ? a.ipv4.join(", ") : "DHCP"}
              </span>
              <span>
                <span class="text-foreground/70 font-medium">IPv6:</span>
                {a.ipv6.length ? a.ipv6.join(", ") : "DHCP"}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0 pt-1">
            {#if isBusy}
              <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
            {/if}
            <Button size="sm" variant="outline" onclick={() => openCustom(a)} disabled={isBusy}>
              Custom…
            </Button>
            <Button size="sm" variant="outline" onclick={() => doReset(a)} disabled={isBusy}>
              Reset
            </Button>
          </div>
        </div>
      {/each}
    </Card>
  {/if}
{/if}

<Dialog
  bind:open={customOpen}
  title={customAdapter ? `Custom DNS — ${customAdapter.alias}` : "Custom DNS"}
  description="Enter IPv4 / IPv6 servers separated by commas. Leave empty for DHCP."
>
  <div class="space-y-3">
    <label class="flex flex-col gap-1">
      <span class="text-xs font-medium text-muted-foreground">IPv4 servers</span>
      <input
        type="text"
        bind:value={customV4}
        placeholder="1.1.1.1, 1.0.0.1"
        class="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
      />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-xs font-medium text-muted-foreground">IPv6 servers</span>
      <input
        type="text"
        bind:value={customV6}
        placeholder="2606:4700:4700::1111"
        class="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
      />
    </label>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (customOpen = false)}>Cancel</Button>
    <Button onclick={saveCustom}>Apply</Button>
  {/snippet}
</Dialog>
