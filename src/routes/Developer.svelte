<script lang="ts">
  import { onMount } from "svelte";
  import {
    Loader2,
    RefreshCw,
    Power,
    PowerOff,
    AlertTriangle,
    CheckCircle2,
    HelpCircle,
    Terminal as TerminalIcon,
    Boxes,
    Container,
    Server,
    Cpu,
    HardDrive,
  } from "@lucide/svelte";
  import { Card, Button, Badge, PageHeader, toast } from "$lib/ui";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import { admin } from "$lib/admin.svelte";
  import {
    isTauri,
    listOptionalFeatures,
    listWslDistros,
    devDriveInfo,
    type DevFeature,
    type WslDistro,
    type DevDriveInfo,
  } from "$lib/tweaks/bridge";
  import { runDevFeatureTask, tasks } from "$lib/tasks.svelte";
  import { log } from "$lib/log.svelte";
  import { cn } from "$lib/utils";

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);

  let features = $state<DevFeature[]>([]);
  let distros = $state<WslDistro[]>([]);
  let devDrive = $state<DevDriveInfo | null>(null);
  let loading = $state(true);
  let refreshing = $state(false);

  async function load() {
    if (!canFetch) {
      loading = false;
      return;
    }
    try {
      const [f, d, dd] = await Promise.all([
        listOptionalFeatures(),
        listWslDistros().catch(() => [] as WslDistro[]),
        devDriveInfo().catch(
          () => ({ supported: false, build: 0, note: "Unavailable." }) as DevDriveInfo,
        ),
      ]);
      features = f;
      distros = d;
      devDrive = dd;
    } catch (e) {
      toast.error("Could not query developer features", String(e));
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  async function refresh() {
    refreshing = true;
    await load();
  }

  $effect(() => {
    if (canFetch && loading) void load();
  });

  onMount(() => {
    void load();
  });

  function stateLabel(state: string): string {
    switch (state) {
      case "Enabled":
        return "Enabled";
      case "Disabled":
        return "Disabled";
      case "EnablePending":
        return "Reboot to finish enabling";
      case "DisablePending":
        return "Reboot to finish disabling";
      default:
        return state || "Unknown";
    }
  }

  function stateClass(state: string): string {
    switch (state) {
      case "Enabled":
        return "bg-success/15 text-success border-success/30";
      case "Disabled":
        return "bg-muted/50 text-muted-foreground border-muted/60";
      case "EnablePending":
      case "DisablePending":
        return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
      default:
        return "bg-muted/50 text-muted-foreground border-muted/60";
    }
  }

  function stateIcon(state: string) {
    if (state === "Enabled") return CheckCircle2;
    if (state === "EnablePending" || state === "DisablePending") return AlertTriangle;
    if (state === "Disabled") return PowerOff;
    return HelpCircle;
  }

  function featureIcon(category: string) {
    if (category === "wsl") return Boxes;
    if (category === "hyperv") return Server;
    if (category === "sandbox") return Container;
    return Cpu;
  }

  function isRunning(feature: DevFeature, enable: boolean): boolean {
    const opId = `dev-feature:${feature.name}:${enable ? "on" : "off"}`;
    return tasks.hasRunning(opId);
  }

  async function toggle(feature: DevFeature, enable: boolean) {
    log.info(
      "dev-feature",
      feature.displayName,
      `${enable ? "Enabling" : "Disabling"} ${feature.name}`,
    );
    const task = await runDevFeatureTask(feature.name, feature.displayName, enable);
    if (task.status === "success") {
      toast.success(
        `${feature.displayName} ${enable ? "enabled" : "disabled"}`,
        "Reboot to finish applying the change.",
      );
      await refresh();
    } else if (task.status !== "running") {
      toast.error(`${enable ? "Enable" : "Disable"} failed`, "See terminal output.");
    }
  }

  const grouped = $derived.by(() => {
    const map: Record<string, DevFeature[]> = {};
    for (const f of features) {
      (map[f.category] ??= []).push(f);
    }
    return map;
  });

  const groupOrder: Array<{ key: string; label: string; description: string }> = [
    {
      key: "wsl",
      label: "Linux on Windows",
      description:
        "WSL and the virtualization layer it depends on. Enable both to run Linux distros with wsl.exe.",
    },
    {
      key: "hyperv",
      label: "Virtualization",
      description:
        "Hyper-V Manager and the third-party hypervisor API used by VirtualBox / Docker Desktop / Android emulators.",
    },
    {
      key: "sandbox",
      label: "Windows Sandbox",
      description: "Throwaway desktop VM that resets on every close — Pro / Enterprise only.",
    },
  ];
</script>

<PageHeader
  title="Developer"
  description="Windows optional features that ship disabled by default — WSL, Hyper-V, the third-party hypervisor API and Windows Sandbox. Backed by DISM; a reboot is usually required after a change."
/>

<AdminBanner
  description="Enabling or disabling Windows features goes through DISM and requires administrator rights. Reading the current state also requires elevation."
/>

{#if !isTauri()}
  <Card class="p-6">
    <p class="text-sm text-muted-foreground">
      Browser preview — Windows feature management is only available inside the Tauri app.
    </p>
  </Card>
{:else if !admin.elevated}
  <Card class="p-6">
    <p class="text-sm text-muted-foreground">
      Elevate Reclaim to inspect and toggle Windows optional features.
    </p>
  </Card>
{:else}
  <div class="flex items-center justify-between mb-3 px-1 min-h-9">
    <div class="text-xs text-muted-foreground">
      {#if loading}
        <span class="inline-flex items-center gap-1.5">
          <Loader2 class="size-3 animate-spin" />
          Querying DISM…
        </span>
      {:else}
        <span>{features.length} feature{features.length === 1 ? "" : "s"} tracked</span>
      {/if}
    </div>
    <Button size="sm" variant="outline" onclick={refresh} disabled={refreshing || loading}>
      {#if refreshing}
        <Loader2 class="animate-spin" />
      {:else}
        <RefreshCw />
      {/if}
      Refresh
    </Button>
  </div>

  <div class="flex flex-col gap-6">
    {#each groupOrder as group (group.key)}
      {@const list = grouped[group.key] ?? []}
      {#if list.length > 0}
        <section class="flex flex-col gap-2">
          <div class="px-1">
            <h2 class="text-sm font-semibold tracking-tight">{group.label}</h2>
            <p class="text-xs text-muted-foreground mt-0.5">{group.description}</p>
          </div>
          <Card class="overflow-hidden gap-0 py-0 card-inset">
            {#each list as f (f.name)}
              {@const Icon = featureIcon(f.category)}
              {@const StateIcon = stateIcon(f.state)}
              {@const enabling = isRunning(f, true)}
              {@const disabling = isRunning(f, false)}
              {@const busy = enabling || disabling}
              {@const isOn = f.state === "Enabled" || f.state === "DisablePending"}
              <div
                class="flex items-start gap-3 px-4 py-3.5 border-b border-foreground/[0.06] last:border-b-0"
              >
                <div
                  class="size-9 shrink-0 rounded-md bg-foreground/[0.04] border border-foreground/[0.08] flex items-center justify-center"
                >
                  <Icon class="size-4 text-muted-foreground" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-medium">{f.displayName}</span>
                    <span
                      class={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
                        stateClass(f.state),
                      )}
                    >
                      <StateIcon class="size-3" />
                      {stateLabel(f.state)}
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                  <p class="text-[10px] font-mono text-muted-foreground/70 mt-1">
                    {f.name}
                  </p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  {#if isOn}
                    <Button
                      size="sm"
                      variant="outline"
                      onclick={() => toggle(f, false)}
                      disabled={busy}
                    >
                      {#if disabling}
                        <Loader2 class="animate-spin" />
                      {:else}
                        <PowerOff />
                      {/if}
                      Disable
                    </Button>
                  {:else}
                    <Button size="sm" onclick={() => toggle(f, true)} disabled={busy}>
                      {#if enabling}
                        <Loader2 class="animate-spin" />
                      {:else}
                        <Power />
                      {/if}
                      Enable
                    </Button>
                  {/if}
                </div>
              </div>
            {/each}
          </Card>
        </section>
      {/if}
    {/each}

    <section class="flex flex-col gap-2">
      <div class="px-1">
        <h2 class="text-sm font-semibold tracking-tight">WSL distros</h2>
        <p class="text-xs text-muted-foreground mt-0.5">
          Linux distributions installed via <code class="text-[11px]">wsl --install</code> or
          the Microsoft Store. Install / uninstall is done with the CLI — this list is
          read-only.
        </p>
      </div>
      <Card class="overflow-hidden gap-0 py-0 card-inset">
        {#if distros.length === 0}
          <div class="px-4 py-6 text-center text-xs text-muted-foreground">
            No distributions installed. Run
            <code class="text-[11px]">wsl --install -d Ubuntu</code> in a terminal to add one.
          </div>
        {:else}
          {#each distros as d (d.name)}
            <div
              class="flex items-center gap-3 px-4 py-3 border-b border-foreground/[0.06] last:border-b-0"
            >
              <TerminalIcon class="size-4 text-muted-foreground shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium">{d.name}</span>
                  {#if d.default}
                    <Badge variant="outline" class="text-[10px]">default</Badge>
                  {/if}
                  <Badge
                    variant="outline"
                    class={cn(
                      "text-[10px]",
                      d.state === "Running"
                        ? "border-success/40 text-success"
                        : "border-muted/60 text-muted-foreground",
                    )}
                  >
                    {d.state}
                  </Badge>
                </div>
              </div>
              <span class="text-[11px] font-mono text-muted-foreground">WSL{d.version}</span>
            </div>
          {/each}
        {/if}
      </Card>
    </section>

    {#if devDrive}
      <section class="flex flex-col gap-2">
        <div class="px-1">
          <h2 class="text-sm font-semibold tracking-tight">Dev Drive</h2>
          <p class="text-xs text-muted-foreground mt-0.5">
            ReFS-backed volume optimized for source code, build artifacts and package caches.
            Up to 30 % faster on developer workloads.
          </p>
        </div>
        <Card class="overflow-hidden card-inset">
          <div class="flex items-start gap-3 px-4 py-3.5">
            <div
              class="size-9 shrink-0 rounded-md bg-foreground/[0.04] border border-foreground/[0.08] flex items-center justify-center"
            >
              <HardDrive class="size-4 text-muted-foreground" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium">Dev Drive status</span>
                <span
                  class={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
                    devDrive.supported
                      ? "bg-success/15 text-success border-success/30"
                      : "bg-muted/50 text-muted-foreground border-muted/60",
                  )}
                >
                  {devDrive.supported ? "Supported" : "Not supported"}
                </span>
              </div>
              <p class="text-xs text-muted-foreground mt-1">{devDrive.note}</p>
              {#if devDrive.supported}
                <p class="text-[11px] text-muted-foreground/80 mt-1">
                  Settings → System → Storage → Disks &amp; volumes → Create dev drive.
                </p>
              {/if}
            </div>
          </div>
        </Card>
      </section>
    {/if}
  </div>
{/if}
