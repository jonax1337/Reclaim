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
  import { Button, Badge, PageHeader, SectionHeading, ListCard, ListRow, StatusPill, RowIcon, EmptyState, toast } from "$lib/ui";
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

  function stateTone(state: string): "success" | "warning" | "muted" {
    switch (state) {
      case "Enabled":
        return "success";
      case "EnablePending":
      case "DisablePending":
        return "warning";
      default:
        return "muted";
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
  <EmptyState>
    Browser preview — Windows feature management is only available inside the Tauri app.
  </EmptyState>
{:else if !admin.elevated}
  <EmptyState>Elevate Reclaim to inspect and toggle Windows optional features.</EmptyState>
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
        <section>
          <SectionHeading title={group.label} description={group.description} />
          <ListCard>
            {#each list as f (f.name)}
              {@const Icon = featureIcon(f.category)}
              {@const StateIcon = stateIcon(f.state)}
              {@const enabling = isRunning(f, true)}
              {@const disabling = isRunning(f, false)}
              {@const busy = enabling || disabling}
              {@const isOn = f.state === "Enabled" || f.state === "DisablePending"}
              <ListRow density="md">
                <RowIcon icon={Icon} />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-medium">{f.displayName}</span>
                    <StatusPill tone={stateTone(f.state)} icon={StateIcon}>
                      {stateLabel(f.state)}
                    </StatusPill>
                  </div>
                  <p class="text-xs text-muted-foreground mt-1 leading-relaxed">{f.description}</p>
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
              </ListRow>
            {/each}
          </ListCard>
        </section>
      {/if}
    {/each}

    <section>
      <SectionHeading
        title="WSL distros"
        description="Linux distributions installed via wsl --install or the Microsoft Store. Install / uninstall is done with the CLI — this list is read-only."
      />
      <ListCard>
        {#if distros.length === 0}
          <div class="px-4 py-6 text-center text-xs text-muted-foreground">
            No distributions installed. Run
            <code class="text-[11px]">wsl --install -d Ubuntu</code> in a terminal to add one.
          </div>
        {:else}
          {#each distros as d (d.name)}
            <ListRow align="center">
              <RowIcon icon={TerminalIcon} />
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
            </ListRow>
          {/each}
        {/if}
      </ListCard>
    </section>

    {#if devDrive}
      <section>
        <SectionHeading
          title="Dev Drive"
          description="ReFS-backed volume optimized for source code, build artifacts and package caches. Up to 30 % faster on developer workloads."
        />
        <ListCard>
          <ListRow density="md">
            <RowIcon icon={HardDrive} />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium">Dev Drive status</span>
                <StatusPill tone={devDrive.supported ? "success" : "muted"}>
                  {devDrive.supported ? "Supported" : "Not supported"}
                </StatusPill>
              </div>
              <p class="text-xs text-muted-foreground mt-1">{devDrive.note}</p>
              {#if devDrive.supported}
                <p class="text-[11px] text-muted-foreground/80 mt-1">
                  Settings → System → Storage → Disks &amp; volumes → Create dev drive.
                </p>
              {/if}
            </div>
          </ListRow>
        </ListCard>
      </section>
    {/if}
  </div>
{/if}
