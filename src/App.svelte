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
  import Defaults from "./routes/Defaults.svelte";
  import Personalization from "./routes/Personalization.svelte";
  import Explorer from "./routes/Explorer.svelte";
  import Search from "./routes/Search.svelte";
  import Taskbar from "./routes/Taskbar.svelte";
  import Updates from "./routes/Updates.svelte";
  import WindowsUpdate from "./routes/WindowsUpdate.svelte";
  import Drivers from "./routes/Drivers.svelte";
  import Performance from "./routes/Performance.svelte";
  import Hosts from "./routes/Hosts.svelte";
  import Network from "./routes/Network.svelte";
  import Firewall from "./routes/Firewall.svelte";
  import Apps from "./routes/Apps.svelte";
  import Notifications from "./routes/Notifications.svelte";
  import Maintenance from "./routes/Maintenance.svelte";
  import Profiles from "./routes/Profiles.svelte";
  import ProfileBuilder from "./routes/ProfileBuilder.svelte";
  import OneDrive from "./routes/OneDrive.svelte";
  import ContextMenu from "./routes/ContextMenu.svelte";
  import Defender from "./routes/Defender.svelte";
  import Specs from "./routes/Specs.svelte";
  import Startup from "./routes/Startup.svelte";
  import Services from "./routes/Services.svelte";
  import ScheduledTasks from "./routes/ScheduledTasks.svelte";
  import Logs from "./routes/Logs.svelte";
  import Settings from "./routes/Settings.svelte";
  import NotFound from "./routes/NotFound.svelte";
  import { onMount } from "svelte";
  import { log } from "$lib/log.svelte";
  import { isTauri } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { kickoffStartupPreloads } from "$lib/startup-preload.svelte";

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
    ["/defaults", Defaults],
    ["/personalization", Personalization],
    ["/explorer", Explorer],
    ["/search", Search],
    ["/taskbar", Taskbar],
    ["/performance", Performance],
    ["/hosts", Hosts],
    ["/network", Network],
    ["/firewall", Firewall],
    ["/apps", Apps],
    ["/notifications", Notifications],
    ["/maintenance", Maintenance],
    ["/profiles", Profiles],
    ["/profile-builder", ProfileBuilder],
    ["/onedrive", OneDrive],
    ["/context-menu", ContextMenu],
    ["/defender", Defender],
    ["/updates", Updates],
    ["/windows-update", WindowsUpdate],
    ["/drivers", Drivers],
    ["/specs", Specs],
    ["/startup", Startup],
    ["/services", Services],
    ["/scheduled-tasks", ScheduledTasks],
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
