<script lang="ts">
  import { link, router } from "svelte-spa-router";
  import {
    LayoutDashboard,
    Package,
    Shield,
    Sparkles,
    FolderOpen,
    Search,
    Bell,
    RefreshCw,
    Settings as SettingsIcon,
    ShieldCheck,
    ShieldAlert,
    Gauge,
    ScrollText,
    Cpu,
    Rocket,
    Cog,
    HardDriveDownload,
    MonitorSmartphone,
    ShieldOff,
    Network as NetworkIcon,
    Cable,
    Activity,
    Download,
    BellRing,
    Wrench,
    Wand2,
    Clock,
    Flame,
    Globe,
    KeyRound,
    Lock,
    Disc3,
    MemoryStick,
    Gamepad2,
    Zap,
    Crosshair,
    Swords,
    CircuitBoard,
    Code2,
    LifeBuoy,
  } from "@lucide/svelte";
  import OneDriveIcon from "$lib/icons/OneDriveIcon.svelte";
  import { Toaster, Titlebar, toast, Dialog, Button, StatusPill } from "$lib/ui";
  import { cn } from "$lib/utils";
  import { isTauri } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { setScrollContainer, onRouteChange } from "$lib/scroll-restore.svelte";
  import { onMount } from "svelte";
  import TerminalPanel from "./TerminalPanel.svelte";
  import { tasks } from "$lib/tasks.svelte";
  import { Terminal, Loader2, X as XIcon } from "@lucide/svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { exit } from "@tauri-apps/plugin-process";

  let { children } = $props();

  let mainEl: HTMLElement | null = $state(null);

  onMount(() => {
    if (!mainEl) return;
    return setScrollContainer(mainEl, router.location);
  });

  let confirmCloseOpen = $state(false);
  // Running tasks are captured at the moment the user clicked close, so the
  // dialog can stay meaningful even if a task finishes while the prompt is up.
  let runningAtCloseTime = $state<string[]>([]);

  // Force-close the window. destroy() bypasses the close-requested listener so
  // we don't loop. If destroy fails for any reason (e.g. missing permission,
  // plugin error) we fall back to process.exit which is guaranteed to terminate.
  async function forceClose() {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().destroy();
    } catch {
      try {
        await exit(0);
      } catch {}
    }
  }

  onMount(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    // Tauri 2's documented pattern: always preventDefault inside the listener,
    // then take explicit responsibility for closing. The "if no tasks, return
    // without preventing" shortcut is unreliable across runtime versions.
    const unlistenPromise = win.onCloseRequested(async (event) => {
      event.preventDefault();
      if (tasks.active.length === 0) {
        await forceClose();
        return;
      }
      runningAtCloseTime = tasks.active.map((t) => t.label);
      confirmCloseOpen = true;
    });
    return () => {
      unlistenPromise.then((u) => u());
    };
  });

  async function confirmClose() {
    confirmCloseOpen = false;
    await forceClose();
  }

  // Reactive route-change hook. svelte-spa-router's `router` is a runes-powered
  // class, so a plain $effect that reads `router.location` triggers on every
  // navigation.
  $effect(() => {
    const loc = router.location;
    onRouteChange(loc);
  });

  const navGroups: Array<{
    label: string | null;
    items: Array<{
      href: string;
      label: string;
      icon: typeof LayoutDashboard;
      adminOnly?: boolean;
    }>;
  }> = [
    {
      label: null,
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/profiles", label: "Profiles", icon: Wand2 },
      ],
    },
    {
      label: "Clean up",
      items: [
        { href: "/bloatware", label: "Bloatware", icon: Package },
        { href: "/onedrive", label: "OneDrive", icon: OneDriveIcon },
        { href: "/ai", label: "AI & Copilot", icon: Sparkles },
      ],
    },
    {
      label: "Install",
      items: [
        { href: "/apps", label: "Apps", icon: Download },
        { href: "/install-media", label: "Install media", icon: Disc3 },
      ],
    },
    {
      label: "Customize",
      items: [
        { href: "/privacy", label: "Privacy", icon: Shield },
        { href: "/defender", label: "Defender", icon: ShieldCheck, adminOnly: true },
        { href: "/security", label: "Security hardening", icon: Lock, adminOnly: true },
        { href: "/browser", label: "Browser (Edge)", icon: Globe, adminOnly: true },
        { href: "/explorer", label: "Explorer", icon: FolderOpen },
        { href: "/taskbar", label: "Taskbar & Start", icon: Bell },
        { href: "/search", label: "Search", icon: Search },
        { href: "/notifications", label: "Notifications", icon: BellRing },
        { href: "/performance", label: "Performance", icon: Gauge },
        { href: "/memory", label: "Memory & caching", icon: MemoryStick, adminOnly: true },
      ],
    },
    {
      label: "Gaming",
      items: [
        { href: "/gaming", label: "Gaming tweaks", icon: Gamepad2, adminOnly: true },
        { href: "/gaming-session", label: "Gaming Session", icon: Zap, adminOnly: true },
        { href: "/per-game-profiles", label: "Per-game profiles", icon: Crosshair },
        { href: "/anti-cheat-compat", label: "Anti-cheat compat", icon: Swords },
        { href: "/msi-mode", label: "MSI mode manager", icon: CircuitBoard, adminOnly: true },
      ],
    },
    {
      label: "Network",
      items: [
        { href: "/hosts", label: "Hosts & blocklists", icon: ShieldOff, adminOnly: true },
        { href: "/network", label: "DNS & DoH", icon: NetworkIcon, adminOnly: true },
        { href: "/nic-tuning", label: "NIC tuning", icon: Cable, adminOnly: true },
        { href: "/latency-monitor", label: "Latency monitor", icon: Activity },
        { href: "/firewall", label: "Firewall", icon: Flame, adminOnly: true },
      ],
    },
    {
      label: "Updates & drivers",
      items: [
        { href: "/windows-update", label: "Windows Update", icon: HardDriveDownload },
        { href: "/drivers", label: "Drivers", icon: MonitorSmartphone },
        { href: "/updates", label: "Update settings", icon: RefreshCw },
      ],
    },
    {
      label: "System info",
      items: [
        { href: "/specs", label: "Specs", icon: Cpu },
        { href: "/startup", label: "Startup apps", icon: Rocket },
        { href: "/services", label: "Services", icon: Cog, adminOnly: true },
        { href: "/scheduled-tasks", label: "Scheduled tasks", icon: Clock, adminOnly: true },
        { href: "/developer", label: "Windows features", icon: Code2, adminOnly: true },
        { href: "/maintenance", label: "Maintenance", icon: Wrench, adminOnly: true },
        { href: "/recovery", label: "Recovery", icon: LifeBuoy, adminOnly: true },
      ],
    },
    {
      label: "Licensing",
      items: [{ href: "/activation", label: "Activation", icon: KeyRound }],
    },
    {
      label: "App",
      items: [
        { href: "/logs", label: "Activity log", icon: ScrollText },
        { href: "/settings", label: "Settings", icon: SettingsIcon },
      ],
    },
  ];

  function isActive(href: string) {
    const loc = router.location;
    if (href === "/") return loc === "/";
    return loc === href || loc.startsWith(href + "/");
  }

  async function onElevateClick() {
    if (admin.elevated || admin.requesting) return;
    const ok = await admin.relaunchElevated();
    if (!ok) toast.error("UAC declined", "Continuing in restricted mode.");
  }

  const panelVisible = $derived(tasks.tasks.length > 0 && tasks.panelOpen);
</script>

<div class="flex flex-col h-full text-foreground">
  <Titlebar title="Reclaim Your Windows">
    {#snippet actions()}
      {#if tasks.tasks.length > 0}
        <StatusPill
          onclick={() => tasks.togglePanel()}
          style="-webkit-app-region: no-drag"
          title={tasks.panelOpen ? "Hide terminal" : "Show terminal"}
        >
          {#if tasks.active.length > 0}
            <Loader2 class="size-3 animate-spin text-primary" />
            {tasks.active.length}
          {:else}
            <Terminal class="size-3" />
          {/if}
          Terminal
        </StatusPill>
      {/if}
      {#if isTauri() && admin.checked}
        {#if admin.elevated}
          <StatusPill
            tone="success"
            style="-webkit-app-region: no-drag"
            title="Running as administrator"
          >
            <ShieldCheck class="size-3" />
            Admin
          </StatusPill>
        {:else}
          <StatusPill
            tone="warning"
            onclick={onElevateClick}
            disabled={admin.requesting}
            style="-webkit-app-region: no-drag"
            title="Click to relaunch as administrator"
          >
            <ShieldAlert class="size-3" />
            {admin.requesting ? "UAC…" : "Elevate"}
          </StatusPill>
        {/if}
      {/if}
    {/snippet}
  </Titlebar>

  <div class="flex flex-1 min-h-0">
    <aside
      class="w-60 shrink-0 border-r border-hairline bg-surface-3 backdrop-blur-xl flex flex-col"
    >
      <nav class="flex-1 p-2 flex flex-col gap-5 pt-4 overflow-y-auto">
        {#each navGroups as group, gi (gi)}
          <div class="flex flex-col gap-0.5">
            {#if group.label}
              <div
                class="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70"
              >
                {group.label}
              </div>
            {/if}
            {#each group.items as item (item.href)}
              {@const active = isActive(item.href)}
              {@const locked = item.adminOnly && admin.checked && !admin.elevated}
              <a
                href={item.href}
                use:link
                class={cn(
                  "group relative flex items-center gap-2.5 rounded-md px-3 h-9 text-sm font-medium transition-all duration-200",
                  "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:rounded-r-full before:bg-primary before:transition-all before:duration-300",
                  active
                    ? "bg-gradient-to-r from-primary/15 to-transparent text-foreground before:h-5 before:opacity-100"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground before:h-0 before:opacity-0",
                )}
                title={locked ? "Requires administrator rights" : undefined}
              >
                <item.icon
                  class={cn(
                    "size-4 shrink-0 transition-all duration-200",
                    active ? "scale-110 text-primary" : "",
                  )}
                />
                <span>{item.label}</span>
                {#if locked}
                  <ShieldAlert class="size-3 ml-auto text-amber-600 dark:text-amber-400" />
                {:else if active}
                  <span class="ml-auto size-1.5 rounded-full bg-primary"></span>
                {/if}
              </a>
            {/each}
          </div>
        {/each}
      </nav>

    </aside>

    <main
      class="flex-1 overflow-auto"
      bind:this={mainEl}
      style={panelVisible ? `padding-bottom: ${tasks.panelHeight + 16}px` : undefined}
    >
      <div class="mx-auto max-w-6xl px-8 py-8">
        <svelte:boundary onerror={(e) => console.error("Route error:", e)}>
          {@render children?.()}
          {#snippet failed(error, reset)}
            <div class="rounded-2xl border border-destructive/40 bg-destructive/[0.06] p-8 max-w-xl mx-auto mt-12">
              <h2 class="text-xl font-semibold mb-2 text-destructive">Something broke on this page</h2>
              <p class="text-sm text-muted-foreground mb-4">
                The page crashed while rendering. Activity log and other pages should still work.
              </p>
              <pre class="text-xs font-mono bg-muted/40 rounded-md p-3 mb-4 overflow-auto max-h-40 whitespace-pre-wrap break-words">{String(error)}</pre>
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={reset}
                  class="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Retry
                </button>
                <a
                  href="/"
                  use:link
                  class="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium border border-input hover:bg-accent/40 transition-colors"
                >
                  Back to dashboard
                </a>
              </div>
            </div>
          {/snippet}
        </svelte:boundary>
      </div>
    </main>
  </div>
</div>

<Toaster />
<TerminalPanel />

<Dialog
  bind:open={confirmCloseOpen}
  title={runningAtCloseTime.length === 1
    ? "A task is still running"
    : `${runningAtCloseTime.length} tasks are still running`}
  description="Closing now will kill the running PowerShell processes. Long ops like DISM RestoreHealth or a Defender full scan won't be able to finish cleanly."
>
  {#if runningAtCloseTime.length > 0}
    <ul class="text-sm space-y-1.5 px-4 py-3 rounded-md bg-surface-3 border border-hairline">
      {#each runningAtCloseTime as label, i (i)}
        <li class="flex items-center gap-2">
          <Loader2 class="size-3.5 animate-spin text-primary shrink-0" />
          <span>{label}</span>
        </li>
      {/each}
    </ul>
  {/if}
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmCloseOpen = false)}>
      Keep running
    </Button>
    <Button variant="destructive" onclick={confirmClose}>
      <XIcon />
      Close anyway
    </Button>
  {/snippet}
</Dialog>
