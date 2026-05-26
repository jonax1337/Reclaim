<script lang="ts">
  import { router } from "svelte-spa-router";
  import type { Component } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import Layout from "$lib/components/Layout.svelte";
  import Dashboard from "./routes/Dashboard.svelte";
  import Bloatware from "./routes/Bloatware.svelte";
  import Privacy from "./routes/Privacy.svelte";
  import AI from "./routes/AI.svelte";
  import Browser from "./routes/Browser.svelte";
  import Explorer from "./routes/Explorer.svelte";
  import Search from "./routes/Search.svelte";
  import Taskbar from "./routes/Taskbar.svelte";
  import Updates from "./routes/Updates.svelte";
  import WindowsUpdate from "./routes/WindowsUpdate.svelte";
  import Drivers from "./routes/Drivers.svelte";
  import Performance from "./routes/Performance.svelte";
  import Memory from "./routes/Memory.svelte";
  import Gaming from "./routes/Gaming.svelte";
  import GamingSession from "./routes/GamingSession.svelte";
  import PerGameProfiles from "./routes/PerGameProfiles.svelte";
  import Developer from "./routes/Developer.svelte";
  import Hosts from "./routes/Hosts.svelte";
  import Network from "./routes/Network.svelte";
  import Firewall from "./routes/Firewall.svelte";
  import Apps from "./routes/Apps.svelte";
  import InstallMedia from "./routes/InstallMedia.svelte";
  import Notifications from "./routes/Notifications.svelte";
  import Maintenance from "./routes/Maintenance.svelte";
  import Profiles from "./routes/Profiles.svelte";
  import ProfileBuilder from "./routes/ProfileBuilder.svelte";
  import OneDrive from "./routes/OneDrive.svelte";
  import Recovery from "./routes/Recovery.svelte";
  import Defender from "./routes/Defender.svelte";
  import Security from "./routes/Security.svelte";
  import Specs from "./routes/Specs.svelte";
  import Startup from "./routes/Startup.svelte";
  import Services from "./routes/Services.svelte";
  import ScheduledTasks from "./routes/ScheduledTasks.svelte";
  import Activation from "./routes/Activation.svelte";
  import Logs from "./routes/Logs.svelte";
  import Settings from "./routes/Settings.svelte";
  import NotFound from "./routes/NotFound.svelte";
  import { onMount } from "svelte";
  import { push as routerPush } from "svelte-spa-router";
  import { log } from "$lib/log.svelte";
  import { isTauri } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { kickoffStartupPreloads } from "$lib/startup-preload.svelte";
  import { service } from "$lib/service.svelte";
  import { runPersistenceCheck } from "$lib/persistence/checker";
  import { migrateLegacyProfiles } from "$lib/persistence/migrate";
  import { maybeCheckDriverUpdates, maybeCheckWindowsUpdates } from "$lib/persistence/updateChecker";
  import { toast } from "$lib/ui";

  // Keep-alive routing: every visited route stays mounted forever; inactive
  // ones are hidden via the `hidden` attribute. This preserves transient
  // component state (selection, filters, in-progress download text, etc.)
  // across navigation — leaving Apps mid-install and returning shows the same
  // streaming status text instead of a blank loading state.
  const routes: Array<[string, Component]> = [
    ["/", Dashboard],
    ["/bloatware", Bloatware],
    ["/privacy", Privacy],
    ["/ai", AI],
    ["/browser", Browser],
    ["/explorer", Explorer],
    ["/search", Search],
    ["/taskbar", Taskbar],
    ["/performance", Performance],
    ["/memory", Memory],
    ["/gaming", Gaming],
    ["/gaming-session", GamingSession],
    ["/per-game-profiles", PerGameProfiles],
    ["/developer", Developer],
    ["/hosts", Hosts],
    ["/network", Network],
    ["/firewall", Firewall],
    ["/apps", Apps],
    ["/install-media", InstallMedia],
    ["/notifications", Notifications],
    ["/maintenance", Maintenance],
    ["/profiles", Profiles],
    ["/profile-builder", ProfileBuilder],
    ["/onedrive", OneDrive],
    ["/recovery", Recovery],
    ["/defender", Defender],
    ["/security", Security],
    ["/updates", Updates],
    ["/windows-update", WindowsUpdate],
    ["/drivers", Drivers],
    ["/specs", Specs],
    ["/startup", Startup],
    ["/services", Services],
    ["/scheduled-tasks", ScheduledTasks],
    ["/activation", Activation],
    ["/logs", Logs],
    ["/settings", Settings],
  ];
  const NOT_FOUND_PATH = "*";
  const definedPaths = new Set(routes.map(([p]) => p));

  const currentPath = $derived(
    definedPaths.has(router.location) ? router.location : NOT_FOUND_PATH,
  );

  // Tracks every route the user has ever visited this session. Once added,
  // entries are never removed — that's the whole point of keep-alive.
  const visited = new SvelteSet<string>(["/"]);
  $effect(() => {
    visited.add(currentPath);
  });

  onMount(async () => {
    if (!isTauri()) return;
    log.info("system.boot", "Reclaim", "Session started");
    await admin.refresh();
    kickoffStartupPreloads();

    // Boot the background service: wait for service.json to hydrate, then
    // subscribe to the Rust-emitted ticks and wire navigation.
    await service.ready;
    // Resolve any v0.15.1 legacy persistedProfiles into the new flat
    // persist.tweakIds set + tear down old `\Reclaim\Persist-<profile-id>`
    // scheduled tasks. No-op when nothing legacy is found.
    void migrateLegacyProfiles();
    service.setNavigateHandler((route) => {
      try {
        routerPush(route);
      } catch {}
    });
    service.onTick(async (source) => {
      log.info(
        "service.tick",
        source === "manual" ? "Manual check" : "Scheduled check",
        "Background check started",
      );
      try {
        await runPersistenceCheck();
      } catch {}
      try {
        await maybeCheckWindowsUpdates(source === "manual");
      } catch {}
      try {
        await maybeCheckDriverUpdates(source === "manual");
      } catch {}
    });
    await service.attach();

    // Hint once: first time the window closes while keep-in-tray is on, let
    // the user know the app stays alive. Triggered via beforeunload because
    // Tauri runs prevent_close in Rust — JS never sees it directly, but the
    // window's visibility change is enough to fire a hint at runtime.
    if (!service.config.hasShownTrayHint && service.config.keepInTray) {
      window.addEventListener(
        "blur",
        async () => {
          if (service.config.hasShownTrayHint) return;
          if (document.visibilityState === "hidden") {
            await service.markTrayHintShown();
            toast.show("Reclaim is still running in the system tray", {
              description:
                "On Windows 11 new tray icons live in the ^ overflow drawer next to the clock — drag Reclaim onto the taskbar to pin it. Right-click → Quit Reclaim to exit fully.",
              duration: 12000,
            });
          }
        },
        { once: false },
      );
    }
  });
</script>

<Layout>
  {#each routes as [path, Comp] (path)}
    {#if visited.has(path)}
      <div hidden={currentPath !== path}>
        <Comp />
      </div>
    {/if}
  {/each}
  {#if currentPath === NOT_FOUND_PATH}
    <div>
      <NotFound />
    </div>
  {/if}
</Layout>
