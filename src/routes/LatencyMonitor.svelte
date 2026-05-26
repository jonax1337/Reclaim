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
    FormField,
    TextInput,
    Switch,
    InfoBanner,
    toast,
  } from "$lib/ui";
  import {
    Loader2,
    Play,
    Pause,
    Plus,
    Trash2,
    Activity,
    AlertTriangle,
    Globe,
  } from "@lucide/svelte";
  import { isTauri, latencyPingHosts } from "$lib/tweaks/bridge";

  type Target = {
    id: string;
    label: string;
    host: string;
    /** True for builtin (preset) targets — not editable, only togglable. */
    preset: boolean;
  };

  const PRESETS: Target[] = [
    { id: "p-steam", label: "Steam (community)", host: "steamcommunity.com", preset: true },
    { id: "p-riot", label: "Riot (auth EU)", host: "auth.riotgames.com", preset: true },
    {
      id: "p-epic",
      label: "Epic Games launcher",
      host: "launcher-public-service-prod06.ol.epicgames.com",
      preset: true,
    },
    { id: "p-battle", label: "Battle.net", host: "us.battle.net", preset: true },
    { id: "p-discord", label: "Discord gateway", host: "gateway.discord.gg", preset: true },
    { id: "p-cf", label: "Cloudflare 1.1.1.1", host: "1.1.1.1", preset: true },
    { id: "p-google", label: "Google 8.8.8.8", host: "8.8.8.8", preset: true },
    { id: "p-gh", label: "GitHub", host: "github.com", preset: true },
  ];

  // localStorage shape: { enabled: id[]; custom: Target[] }
  const STORAGE_KEY = "reclaim.latency-monitor";

  type Persisted = { enabled: string[]; custom: Target[] };

  function loadPersisted(): Persisted {
    if (typeof localStorage === "undefined")
      return { enabled: PRESETS.slice(0, 4).map((p) => p.id), custom: [] };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { enabled: PRESETS.slice(0, 4).map((p) => p.id), custom: [] };
      const data = JSON.parse(raw) as Persisted;
      return {
        enabled: Array.isArray(data.enabled) ? data.enabled : [],
        custom: Array.isArray(data.custom) ? data.custom : [],
      };
    } catch {
      return { enabled: [], custom: [] };
    }
  }

  function persist(state: Persisted) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  let enabled = $state<Set<string>>(new Set(loadPersisted().enabled));
  let custom = $state<Target[]>(loadPersisted().custom);

  $effect(() => {
    persist({ enabled: Array.from(enabled), custom });
  });

  const allTargets = $derived<Target[]>([...PRESETS, ...custom]);
  const activeTargets = $derived(allTargets.filter((t) => enabled.has(t.id)));

  // Rolling sample buffer per host. Keep last 60 samples (~ 2 minutes at 2 s/tick).
  const HISTORY = 60;
  let samples = $state<Record<string, Array<number | null>>>({});

  let polling = $state(true);
  let interval = $state<2 | 5 | 10>(2);
  let pollBusy = $state(false);

  let addOpen = $state(false);
  let addLabel = $state("");
  let addHost = $state("");

  async function tick() {
    if (!isTauri() || !polling) return;
    const hosts = activeTargets.map((t) => t.host);
    if (hosts.length === 0) return;
    pollBusy = true;
    try {
      const results = await latencyPingHosts(hosts);
      const byHost = new Map(results.map((r) => [r.host, r.rttMs]));
      const next: Record<string, Array<number | null>> = { ...samples };
      for (const t of activeTargets) {
        const arr = next[t.host] ? [...next[t.host]] : [];
        const v = byHost.has(t.host) ? byHost.get(t.host)! : null;
        arr.push(v);
        while (arr.length > HISTORY) arr.shift();
        next[t.host] = arr;
      }
      samples = next;
    } catch (e) {
      // Soft fail — keep the loop going. Surface once.
      if ((e as Error).message) {
        toast.warning("Ping batch failed", (e as Error).message);
      }
    } finally {
      pollBusy = false;
    }
  }

  onMount(() => {
    if (!isTauri()) return;
    tick();
    let timer: ReturnType<typeof setInterval> | null = setInterval(tick, interval * 1000);
    const dispose = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    return dispose;
  });

  // Re-arm timer when interval or polling toggle changes. Done in an effect so
  // the original onMount disposer doesn't get tangled with re-creation.
  $effect(() => {
    if (!isTauri()) return;
    if (!polling) return;
    const ivl = interval;
    const t = setInterval(tick, ivl * 1000);
    return () => clearInterval(t);
  });

  function toggleTarget(id: string) {
    if (enabled.has(id)) enabled.delete(id);
    else enabled.add(id);
    enabled = new Set(enabled);
  }

  function addCustom() {
    const label = addLabel.trim() || addHost.trim();
    const host = addHost.trim();
    if (!host) {
      toast.error("Need a hostname or IP");
      return;
    }
    if (!/^[A-Za-z0-9.\-:_]+$/.test(host) || host.length > 253) {
      toast.error("Invalid hostname", "Only DNS-safe characters allowed.");
      return;
    }
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    custom = [...custom, { id, label, host, preset: false }];
    enabled.add(id);
    enabled = new Set(enabled);
    addLabel = "";
    addHost = "";
    addOpen = false;
  }

  function removeCustom(t: Target) {
    if (t.preset) return;
    custom = custom.filter((x) => x.id !== t.id);
    enabled.delete(t.id);
    enabled = new Set(enabled);
    const { [t.host]: _drop, ...rest } = samples;
    samples = rest;
  }

  // Stats helpers.
  function stats(arr: Array<number | null>): { min: number | null; avg: number | null; max: number | null; loss: number } {
    if (arr.length === 0) return { min: null, avg: null, max: null, loss: 0 };
    const ok = arr.filter((v): v is number => v != null);
    const loss = Math.round(((arr.length - ok.length) / arr.length) * 100);
    if (ok.length === 0) return { min: null, avg: null, max: null, loss };
    const min = Math.min(...ok);
    const max = Math.max(...ok);
    const avg = Math.round(ok.reduce((a, b) => a + b, 0) / ok.length);
    return { min, avg, max, loss };
  }

  function latestRtt(host: string): number | null {
    const arr = samples[host];
    if (!arr || arr.length === 0) return null;
    return arr[arr.length - 1];
  }

  function toneFor(rtt: number | null): "ok" | "warn" | "fail" {
    if (rtt == null) return "fail";
    if (rtt < 50) return "ok";
    if (rtt < 120) return "warn";
    return "fail";
  }

  function sparkBars(arr: Array<number | null>): Array<{ height: number; missing: boolean }> {
    if (!arr || arr.length === 0) return [];
    const ok = arr.filter((v): v is number => v != null);
    const max = ok.length > 0 ? Math.max(...ok, 50) : 50;
    return arr.map((v) => {
      if (v == null) return { height: 0, missing: true };
      const h = Math.max(2, Math.min(100, (v / max) * 100));
      return { height: h, missing: false };
    });
  }
</script>

<PageHeader title="Latency monitor">
  {#snippet actions()}
    <Button variant="outline" onclick={() => (polling = !polling)}>
      {#if polling}<Pause />Pause{:else}<Play />Resume{/if}
    </Button>
    <Button variant="outline" onclick={() => (addOpen = true)}>
      <Plus />
      Add target
    </Button>
  {/snippet}
  Live ICMP ping to game servers and key endpoints. Pure read-only — no system changes.
</PageHeader>

{#if !isTauri()}
  <EmptyState>Browser preview — needs the built app.</EmptyState>
{:else}
  <Card class="card-inset mb-6">
    <CardContent>
      <div class="flex items-center gap-3 flex-wrap">
        <Activity class={polling ? "size-5 text-success animate-pulse" : "size-5 text-muted-foreground"} />
        <span class="text-sm font-medium">
          {polling ? "Polling every" : "Paused"}
        </span>
        {#if polling}
          <div class="inline-flex rounded-md border border-hairline overflow-hidden">
            {#each [2, 5, 10] as v (v)}
              <button
                type="button"
                class={[
                  "px-3 py-1 text-xs",
                  interval === v
                    ? "bg-primary/15 text-primary font-medium"
                    : "hover:bg-surface-2 text-muted-foreground",
                ]}
                onclick={() => (interval = v as 2 | 5 | 10)}
              >
                {v}s
              </button>
            {/each}
          </div>
        {/if}
        {#if pollBusy}
          <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
        {/if}
        <span class="text-xs text-muted-foreground ml-auto">
          {activeTargets.length} active · {allTargets.length - activeTargets.length} inactive
        </span>
      </div>
    </CardContent>
  </Card>

  <SectionHeading title="Active targets" />
  {#if activeTargets.length === 0}
    <EmptyState>
      Enable some preset targets below or add a custom one with the <strong>Add target</strong> button.
    </EmptyState>
  {:else}
    <div class="space-y-2 mb-6">
      {#each activeTargets as t (t.id)}
        {@const arr = samples[t.host] ?? []}
        {@const rtt = latestRtt(t.host)}
        {@const tone = toneFor(rtt)}
        {@const s = stats(arr)}
        {@const bars = sparkBars(arr)}
        <Card class="card-inset">
          <CardContent>
            <div class="flex items-start gap-3">
              <div class="size-9 rounded-md bg-surface-2 border border-hairline grid place-items-center shrink-0">
                <Globe class="size-4 text-muted-foreground" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-semibold">{t.label}</span>
                  <span class="text-xs font-mono text-muted-foreground/70">{t.host}</span>
                  {#if !t.preset}
                    <Badge variant="secondary">Custom</Badge>
                  {/if}
                </div>

                <!-- Sparkline -->
                <div class="flex items-end gap-px h-8 mt-2 w-full max-w-md">
                  {#each bars as bar (bars.indexOf(bar))}
                    <div
                      class={[
                        "flex-1 rounded-sm",
                        bar.missing
                          ? "bg-destructive/30"
                          : tone === "ok"
                            ? "bg-success/70"
                            : tone === "warn"
                              ? "bg-amber-500/70"
                              : "bg-destructive/70",
                      ]}
                      style:height={`${bar.missing ? 100 : bar.height}%`}
                      title={bar.missing ? "timeout" : `${arr[bars.indexOf(bar)]} ms`}
                    ></div>
                  {/each}
                </div>

                <div class="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {#if s.min != null}
                    <span>min <span class="font-medium text-foreground">{s.min}</span> ms</span>
                    <span>avg <span class="font-medium text-foreground">{s.avg}</span> ms</span>
                    <span>max <span class="font-medium text-foreground">{s.max}</span> ms</span>
                  {/if}
                  {#if s.loss > 0}
                    <span class="text-destructive">{s.loss}% loss</span>
                  {/if}
                </div>
              </div>

              <div class="flex flex-col items-end gap-1 shrink-0">
                <div
                  class={[
                    "text-lg font-mono font-semibold",
                    tone === "ok"
                      ? "text-success"
                      : tone === "warn"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-destructive",
                  ]}
                >
                  {rtt == null ? "—" : `${rtt} ms`}
                </div>
                <div class="flex items-center gap-1">
                  <Switch
                    checked={enabled.has(t.id)}
                    onCheckedChange={() => toggleTarget(t.id)}
                  />
                  {#if !t.preset}
                    <Button variant="ghost" size="icon" onclick={() => removeCustom(t)} title="Remove">
                      <Trash2 class="size-4" />
                    </Button>
                  {/if}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
  {/if}

  <SectionHeading title="Preset targets — toggle to enable" />
  <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-6">
    {#each PRESETS as t (t.id)}
      <label
        class="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-surface-2 border border-hairline cursor-pointer hover:border-hairline-strong"
      >
        <div class="min-w-0">
          <div class="text-sm font-medium">{t.label}</div>
          <div class="text-xs font-mono text-muted-foreground">{t.host}</div>
        </div>
        <Switch checked={enabled.has(t.id)} onCheckedChange={() => toggleTarget(t.id)} />
      </label>
    {/each}
  </div>

  {#if custom.length > 0}
    <SectionHeading title="Custom targets" />
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-6">
      {#each custom as t (t.id)}
        <label
          class="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-surface-2 border border-hairline"
        >
          <div class="min-w-0">
            <div class="text-sm font-medium">{t.label}</div>
            <div class="text-xs font-mono text-muted-foreground">{t.host}</div>
          </div>
          <div class="flex items-center gap-2">
            <Switch checked={enabled.has(t.id)} onCheckedChange={() => toggleTarget(t.id)} />
            <Button variant="ghost" size="icon" onclick={() => removeCustom(t)} title="Remove">
              <Trash2 class="size-4" />
            </Button>
          </div>
        </label>
      {/each}
    </div>
  {/if}

  <InfoBanner tone="info">
    ICMP Echo via PowerShell's <code>Test-Connection</code>. Some hosts drop ping silently (Google
    blocks ICMP to several frontends) — that's "100% loss" here even though the service itself
    works. Use this for relative comparison between servers, not absolute reachability.
  </InfoBanner>
{/if}

<Dialog
  bind:open={addOpen}
  title="Add a custom target"
  description="Anything pingable — a game server, your home router, a CDN edge. DNS names or IPs."
>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
    <FormField label="Label (optional)">
      <TextInput bind:value={addLabel} placeholder="My game server" />
    </FormField>
    <FormField label="Hostname or IP">
      <TextInput bind:value={addHost} placeholder="play.example.net" />
    </FormField>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (addOpen = false)}>Cancel</Button>
    <Button onclick={addCustom} disabled={!addHost.trim()}>
      <Plus />
      Add
    </Button>
  {/snippet}
</Dialog>
