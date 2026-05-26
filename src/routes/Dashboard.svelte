<script lang="ts">
  import { Button, Badge, Card, CardContent, SectionHeading, MetricBar, StatTile, HeroBanner, toast } from "$lib/ui";
  import {
    Shield,
    Package,
    Sparkles,
    Wand2,
    History,
    Wand,
    Activity as ActivityIcon,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Info,
    ChevronRight,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    createRestorePoint,
    type SystemInfo,
  } from "$lib/tweaks/bridge";
  import { ALL_TWEAKS } from "$lib/tweaks/catalog";
  import { BLOATWARE } from "$lib/tweaks/bloatware";
  import { getTweakState, applyTweak, type TweakState } from "$lib/tweaks/executor";
  import { log, ACTION_LABELS } from "$lib/log.svelte";
  import { PROFILES } from "$lib/tweaks/profiles";
  import { customProfiles } from "$lib/tweaks/customProfiles.svelte";
  import {
    tweakStatesResource,
    systemInfoResource,
    K_TWEAK_STATES,
  } from "$lib/route-cache.svelte";
  import { setCached, invalidate } from "$lib/cache.svelte";
  import { link } from "svelte-spa-router";

  const sysRes = systemInfoResource();
  const info = $derived<SystemInfo | null>(sysRes.data ?? null);

  const statesRes = tweakStatesResource();
  const states = $derived<Record<string, TweakState>>(statesRes.data ?? {});
  const loading = $derived(statesRes.loading && !statesRes.data);

  const appliedCount = $derived(ALL_TWEAKS.filter((t) => states[t.id] === "on").length);
  const recommendedCount = $derived(
    ALL_TWEAKS.filter((t) => t.recommended && states[t.id] !== "on").length,
  );
  const recommendedTotal = $derived(ALL_TWEAKS.filter((t) => t.recommended).length);

  let busy = $state(false);

  async function refreshStatus() {
    invalidate(K_TWEAK_STATES);
    await statesRes.refresh();
  }

  function patchState(id: string, next: TweakState) {
    const merged = { ...(statesRes.data ?? {}), [id]: next };
    setCached(K_TWEAK_STATES, merged);
  }

  async function applyAllRecommended() {
    if (busy) return;
    busy = true;
    const recs = ALL_TWEAKS.filter((t) => t.recommended);
    let ok = 0;
    let fail = 0;
    for (const t of recs) {
      try {
        if (states[t.id] === "on") continue;
        await applyTweak(t);
        patchState(t.id, "on");
        ok++;
      } catch {
        fail++;
        try {
          patchState(t.id, await getTweakState(t));
        } catch {
          /* leave as-is */
        }
      }
    }
    busy = false;
    toast.success(
      `${ok} tweak${ok === 1 ? "" : "s"} applied`,
      fail > 0 ? `${fail} failed — may need admin.` : undefined,
    );
  }

  async function snapshot() {
    if (busy) return;
    busy = true;
    const r = await createRestorePoint("Reclaim — pre-tweak snapshot");
    busy = false;
    if (r.success) {
      log.success("system.restore_point", "Pre-tweak snapshot", "Restore point created");
      toast.success("Restore point created");
    } else {
      log.error("system.restore_point", "Pre-tweak snapshot", "Failed to create restore point", r.stderr);
      toast.error("Could not create restore point", r.stderr || "Admin rights required");
    }
  }

  const progress = $derived(
    ALL_TWEAKS.length === 0 ? 0 : Math.round((appliedCount / ALL_TWEAKS.length) * 100),
  );

  const totalProfiles = $derived(PROFILES.length + customProfiles.items.length);

  // Recent activity feed — newest first, take last 6.
  // Internal lifecycle events (session start, scheduled-check ticks) are filtered
  // out: the activity feed is about user-visible actions, not heartbeat noise.
  const recentEntries = $derived(
    log.entries
      .filter((e) => e.action !== "system.boot" && e.action !== "service.tick")
      .slice(0, 6),
  );

  // Per-category coverage: applied / total / percent, ordered as in the catalog.
  type CategoryStat = { id: string; label: string; applied: number; total: number; pct: number };
  const CATEGORY_LABELS: Record<string, string> = {
    privacy: "Privacy",
    ai: "AI & Copilot",
    search: "Search",
    explorer: "Explorer",
    taskbar: "Taskbar & Start",
    notifications: "Notifications",
    performance: "Performance",
    updates: "Updates",
    browser: "Browser (Edge)",
    security: "Security",
    memory: "Memory & caching",
    gaming: "Gaming",
  };
  const CATEGORY_ORDER = [
    "privacy",
    "ai",
    "search",
    "explorer",
    "taskbar",
    "notifications",
    "performance",
    "updates",
    "browser",
    "security",
    "memory",
    "gaming",
  ];
  const categoryStats = $derived<CategoryStat[]>(
    CATEGORY_ORDER.map((id) => {
      const items = ALL_TWEAKS.filter((t) => t.category === id);
      const total = items.length;
      const applied = items.filter((t) => states[t.id] === "on").length;
      return {
        id,
        label: CATEGORY_LABELS[id] ?? id,
        applied,
        total,
        pct: total === 0 ? 0 : Math.round((applied / total) * 100),
      };
    }),
  );

  function fmtRelative(ts: number): string {
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const m = Math.floor(diffSec / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function iconForLevel(level: string) {
    if (level === "success") return CheckCircle2;
    if (level === "warn") return AlertTriangle;
    if (level === "error") return XCircle;
    return Info;
  }

  function toneForLevel(level: string): string {
    if (level === "success") return "text-success";
    if (level === "warn") return "text-amber-600 dark:text-amber-400";
    if (level === "error") return "text-destructive";
    return "text-muted-foreground";
  }
</script>

<HeroBanner withDots>
  <div class="px-8 py-7 flex flex-wrap items-end justify-between gap-6">
    <div class="min-w-0 flex-1">
      <div
        class="inline-flex items-center gap-1.5 mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary"
      >
        <span class="size-1.5 rounded-full bg-primary"></span>
        Take back control
      </div>
      <h1 class="text-[2.25rem] leading-tight font-semibold tracking-tight">
        <span class="text-muted-foreground/80">Reclaim</span>
        <span class="text-foreground">Your Windows</span>
      </h1>
      <div class="mt-3 h-px w-12 bg-primary/60"></div>
      <p class="text-sm text-muted-foreground mt-3 max-w-xl">
        Strip out bloatware, kill telemetry, restore the classic right-click — every tweak is
        reversible and transparent.
      </p>
      <div class="mt-3 text-xs text-muted-foreground flex flex-wrap gap-x-2">
        {#if info}
          <span class="font-medium text-foreground">{info.productName}</span>
          {#if info.displayVersion}<span>· {info.displayVersion}</span>{/if}
          {#if info.build}<span>· Build {info.build}</span>{/if}
          {#if info.username}<span>· {info.username}</span>{/if}
        {:else if isTauri()}
          <span>Loading system information…</span>
        {:else}
          <span>Browser preview — tweaks only work in the built app.</span>
        {/if}
      </div>
    </div>
    <div class="flex flex-col gap-2 shrink-0">
      <Button onclick={applyAllRecommended} disabled={busy || loading}>
        <Wand2 />
        Apply all recommended
        {#if !loading && recommendedCount > 0}
          <Badge
            variant="default"
            class="bg-primary-foreground/20 text-primary-foreground border-transparent"
          >
            {recommendedCount}
          </Badge>
        {/if}
      </Button>
      <Button variant="outline" onclick={snapshot} disabled={busy}>
        <History />
        Create restore point
      </Button>
    </div>
  </div>
</HeroBanner>

<AdminBanner
  title="Running in restricted mode"
  description="HKLM tweaks (telemetry, updates, Cortana, location), service control and many bloatware removals require administrator rights. Click here to relaunch with UAC."
/>

<!-- KPI tiles -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger">
  <StatTile
    label="Active tweaks"
    icon={Shield}
    value={appliedCount}
    total={ALL_TWEAKS.length}
    {loading}
    class="relative overflow-hidden"
  >
    {#snippet footer()}
      <MetricBar value={progress} class="mt-3" />
    {/snippet}
  </StatTile>

  <StatTile
    label="Recommended pending"
    icon={Sparkles}
    value={recommendedCount}
    total={recommendedTotal}
    {loading}
    hint="not yet applied"
  />

  <StatTile
    label="Bloatware patterns"
    icon={Package}
    value={BLOATWARE.length}
    hint="known apps detectable"
  />

  <StatTile
    label="Profiles available"
    icon={Wand}
    value={totalProfiles}
    hint={`${PROFILES.length} built-in · ${customProfiles.items.length} custom`}
  />
</div>

<!-- Recent activity -->
<SectionHeading title="Recent activity">
  {#snippet actions()}
    <a use:link href="/logs" class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
      Open log
      <ChevronRight class="size-3" />
    </a>
  {/snippet}
</SectionHeading>
<Card class="card-inset mb-8">
  <CardContent>
    {#if recentEntries.length === 0}
      <div class="py-8 text-center text-sm text-muted-foreground">
        <ActivityIcon class="size-6 mx-auto mb-2 opacity-50" />
        No activity yet. Apply your first tweak and it'll show up here.
      </div>
    {:else}
      <ul class="divide-y divide-hairline">
        {#each recentEntries as e (e.id)}
          {@const LevelIcon = iconForLevel(e.level)}
          <li class="py-2.5 flex items-start gap-3 first:pt-0 last:pb-0">
            <LevelIcon class={["size-4 shrink-0 mt-0.5", toneForLevel(e.level)]} />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium truncate">{e.target}</span>
                <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {ACTION_LABELS[e.action] ?? e.action}
                </span>
              </div>
              {#if e.message}
                <p class="text-xs text-muted-foreground mt-0.5 truncate">{e.message}</p>
              {/if}
            </div>
            <span class="text-[11px] text-muted-foreground/70 shrink-0 tabular-nums">
              {fmtRelative(e.ts)}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </CardContent>
</Card>

<!-- Catalog coverage — permanent per-category snapshot of what's applied vs. total -->
<SectionHeading title="Catalog coverage" hint="applied tweaks per category" />
<Card class="card-inset">
  <CardContent>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
      {#each categoryStats as c (c.id)}
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-xs font-medium truncate">{c.label}</span>
              <span class="text-[10px] text-muted-foreground tabular-nums shrink-0">
                {c.applied}/{c.total}
              </span>
            </div>
            <div class="mt-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                class={[
                  "h-full transition-all",
                  c.pct === 100 ? "bg-success" : c.pct > 0 ? "bg-primary" : "bg-muted-foreground/20",
                ]}
                style:width={`${c.pct}%`}
              ></div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </CardContent>
</Card>
