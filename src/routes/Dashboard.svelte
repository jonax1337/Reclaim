<script lang="ts">
  import { push } from "svelte-spa-router";
  import { Card, CardContent, Button, Badge, toast } from "$lib/ui";
  import {
    Shield,
    Package,
    Sparkles,
    FolderOpen,
    Search,
    Bell,
    BellRing,
    RefreshCw,
    ArrowRight,
    Wand2,
    History,
    Loader2,
    Gauge,
    Globe,
    Lock,
    MemoryStick,
    Gamepad2,
    Code2,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    createRestorePoint,
    type SystemInfo,
  } from "$lib/tweaks/bridge";
  import {
    ALL_TWEAKS,
    PRIVACY_TWEAKS,
    AI_TWEAKS,
    EXPLORER_TWEAKS,
    SEARCH_TWEAKS,
    TASKBAR_TWEAKS,
    UPDATE_TWEAKS,
    PERFORMANCE_TWEAKS,
    NOTIFICATION_TWEAKS,
    BROWSER_TWEAKS,
    SECURITY_TWEAKS,
    MEMORY_TWEAKS,
    GAMING_TWEAKS,
  } from "$lib/tweaks/catalog";
  import { BLOATWARE } from "$lib/tweaks/bloatware";
  import { getTweakState, applyTweak, type TweakState } from "$lib/tweaks/executor";
  import { log } from "$lib/log.svelte";
  import { PROFILES } from "$lib/tweaks/profiles";
  import ProfileCard from "$lib/components/ProfileCard.svelte";
  import {
    tweakStatesResource,
    systemInfoResource,
    K_TWEAK_STATES,
  } from "$lib/route-cache.svelte";
  import { setCached, invalidate } from "$lib/cache.svelte";

  const sysRes = systemInfoResource();
  const info = $derived<SystemInfo | null>(sysRes.data ?? null);

  const statesRes = tweakStatesResource();
  const states = $derived<Record<string, TweakState>>(statesRes.data ?? {});
  const loading = $derived(statesRes.loading && !statesRes.data);

  const appliedCount = $derived(ALL_TWEAKS.filter((t) => states[t.id] === "on").length);
  const recommendedCount = $derived(
    ALL_TWEAKS.filter((t) => t.recommended && states[t.id] !== "on").length,
  );

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

  const categories = [
    {
      href: "/bloatware",
      icon: Package,
      label: "Bloatware",
      desc: "Remove pre-installed apps",
      count: BLOATWARE.length,
    },
    {
      href: "/ai",
      icon: Sparkles,
      label: "AI & Copilot",
      desc: "Recall, Copilot, Click to Do",
      count: AI_TWEAKS.length,
    },
    {
      href: "/privacy",
      icon: Shield,
      label: "Privacy",
      desc: "Telemetry, ads, activity",
      count: PRIVACY_TWEAKS.length,
    },
    {
      href: "/browser",
      icon: Globe,
      label: "Browser (Edge)",
      desc: "Shopping, Discover, wallet, NTP",
      count: BROWSER_TWEAKS.length,
    },
    {
      href: "/explorer",
      icon: FolderOpen,
      label: "Explorer",
      desc: "Classic menu, extensions",
      count: EXPLORER_TWEAKS.length,
    },
    {
      href: "/taskbar",
      icon: Bell,
      label: "Taskbar & Start",
      desc: "Widgets, ads, layout",
      count: TASKBAR_TWEAKS.length,
    },
    {
      href: "/search",
      icon: Search,
      label: "Search",
      desc: "Bing, highlights, Cortana",
      count: SEARCH_TWEAKS.length,
    },
    {
      href: "/notifications",
      icon: BellRing,
      label: "Notifications",
      desc: "Toasts, sounds, Action Center",
      count: NOTIFICATION_TWEAKS.length,
    },
    {
      href: "/performance",
      icon: Gauge,
      label: "Performance",
      desc: "Background apps, visual effects",
      count: PERFORMANCE_TWEAKS.length,
    },
    {
      href: "/memory",
      icon: MemoryStick,
      label: "Memory & caching",
      desc: "Compression, SysMain, Prefetch",
      count: MEMORY_TWEAKS.length,
    },
    {
      href: "/gaming",
      icon: Gamepad2,
      label: "Gaming",
      desc: "MMCSS, low-latency TCP, HPET",
      count: GAMING_TWEAKS.length,
    },
    {
      href: "/updates",
      icon: RefreshCw,
      label: "Updates",
      desc: "Defer, no auto-restart",
      count: UPDATE_TWEAKS.length,
    },
    {
      href: "/security",
      icon: Lock,
      label: "Security hardening",
      desc: "LSA, ASR rules, CFA",
      count: SECURITY_TWEAKS.length,
    },
    {
      href: "/developer",
      icon: Code2,
      label: "Developer",
      desc: "WSL, Hyper-V, Sandbox",
      count: 5,
    },
  ];

  const progress = $derived(
    ALL_TWEAKS.length === 0 ? 0 : Math.round((appliedCount / ALL_TWEAKS.length) * 100),
  );
</script>

<section
  class="relative overflow-hidden rounded-2xl border border-foreground/10 bg-card/70 backdrop-blur-xl shadow-sm mb-6 hero-glow"
>
  <div
    class="absolute inset-0 -z-10 opacity-[0.04] [background-image:radial-gradient(circle_at_1px_1px,_currentColor_1px,_transparent_0)] [background-size:16px_16px]"
  ></div>

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
</section>

<AdminBanner
  title="Running in restricted mode"
  description="HKLM tweaks (telemetry, updates, Cortana, location), service control and many bloatware removals require administrator rights. Click here to relaunch with UAC."
/>

<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 stagger">
  <Card class="card-inset relative overflow-hidden">
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Active tweaks</span>
        <Shield class="size-4 text-muted-foreground" />
      </div>
      <div class="flex items-baseline gap-2 mt-2">
        <span class="text-3xl font-semibold tabular-nums">
          {#if loading}
            <Loader2 class="size-6 animate-spin text-muted-foreground" />
          {:else}
            {appliedCount}
          {/if}
        </span>
        {#if !loading}
          <span class="text-sm text-muted-foreground">/ {ALL_TWEAKS.length}</span>
        {/if}
      </div>
      <div class="mt-3 h-1 rounded-full bg-muted overflow-hidden">
        <div
          class="h-full rounded-full bg-primary transition-all duration-500"
          style="width: {progress}%"
        ></div>
      </div>
    </CardContent>
  </Card>

  <Card class="card-inset">
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Recommended pending</span>
        <Sparkles class="size-4 text-muted-foreground" />
      </div>
      <div class="text-3xl font-semibold mt-2 tabular-nums">
        {#if loading}
          <Loader2 class="size-6 animate-spin text-muted-foreground" />
        {:else}
          {recommendedCount}
        {/if}
      </div>
      <div class="text-xs text-muted-foreground mt-1">not yet applied</div>
    </CardContent>
  </Card>

  <Card class="card-inset">
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Bloatware</span>
        <Package class="size-4 text-muted-foreground" />
      </div>
      <div class="text-3xl font-semibold mt-2 tabular-nums">{BLOATWARE.length}</div>
      <div class="text-xs text-muted-foreground mt-1">known apps detectable</div>
    </CardContent>
  </Card>
</div>

<div class="flex items-center justify-between mb-3">
  <h2 class="text-xs font-semibold uppercase text-muted-foreground tracking-[0.12em]">
    Profiles
  </h2>
  <span class="text-[11px] text-muted-foreground">one-click setups</span>
</div>
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8 stagger">
  {#each PROFILES as p (p.id)}
    <ProfileCard profile={p} onApplied={refreshStatus} />
  {/each}
</div>

<div class="flex items-center justify-between mb-3">
  <h2 class="text-xs font-semibold uppercase text-muted-foreground tracking-[0.12em]">
    Categories
  </h2>
  <span class="text-[11px] text-muted-foreground">click to open</span>
</div>
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
  {#each categories as c (c.href)}
    <button type="button" onclick={() => push(c.href)} class="group text-left">
      <Card
        class="card-inset cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30 transition-all duration-200 py-4"
      >
        <CardContent>
          <div class="flex items-start gap-3">
            <div
              class="grid place-items-center size-10 rounded-lg bg-foreground/[0.06] text-foreground/80 shrink-0 ring-1 ring-inset ring-foreground/5 group-hover:text-primary group-hover:bg-primary/10 transition-colors"
            >
              <c.icon class="size-4" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-semibold">{c.label}</span>
                <ArrowRight
                  class="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                />
              </div>
              <div class="text-xs text-muted-foreground mt-0.5 truncate">{c.desc}</div>
              <div class="text-[10px] text-muted-foreground/70 mt-1.5 uppercase tracking-wider">
                {c.count} entries
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  {/each}
</div>
