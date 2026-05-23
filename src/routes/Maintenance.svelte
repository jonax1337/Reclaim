<script lang="ts">
  import { Card, Button, Badge, Dialog, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Play,
    Eraser,
    Stethoscope,
    Wrench,
    HardDriveDownload,
    Network,
    MemoryStick,
    Zap,
    Sparkles,
    AlertTriangle,
    FolderOpen,
    File as FileIcon,
    Trash2,
    Shield,
    ShieldCheck,
    Bug,
    RotateCcw,
    Printer,
    Image,
    Type,
    Store,
    Flame,
    Activity,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { Checkbox } from "$lib/ui";
  import {
    isTauri,
    setPowerPlan,
    unlockUltimatePerformance,
    deletePowerPlan,
    launchCleanmgr,
    launchMemoryDiagnostic,
    type MaintenanceOp,
    type PowerPlan,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { tasks, runMaintenanceTask, runUnblockTask } from "$lib/tasks.svelte";
  import { cn } from "$lib/utils";
  import { powerPlansResource } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  type OpGroup = "defender" | "repair" | "cleanup" | "reset" | "network";

  type OpDef = {
    id: MaintenanceOp;
    title: string;
    description: string;
    duration: string;
    icon: typeof Wrench;
    warning?: string;
    group: OpGroup;
  };

  const OPS: OpDef[] = [
    // ---- Defender ----
    {
      id: "defender-status",
      title: "Defender status",
      description: "Snapshot of real-time protection, signature version, last scan times.",
      duration: "<5s",
      icon: ShieldCheck,
      group: "defender",
    },
    {
      id: "defender-sig-update",
      title: "Update virus definitions",
      description: "Pulls the latest Defender signatures via MpCmdRun.",
      duration: "<1 min",
      icon: RefreshCw,
      group: "defender",
    },
    {
      id: "defender-quick-scan",
      title: "Quick scan",
      description: "Scans the locations most commonly used by malware.",
      duration: "5–15 min",
      icon: Bug,
      group: "defender",
    },
    {
      id: "defender-full-scan",
      title: "Full scan",
      description: "Scans every file on every fixed drive. Long, but thorough.",
      duration: "1–6 h",
      icon: Bug,
      group: "defender",
    },
    {
      id: "defender-offline-scan",
      title: "Offline scan",
      description:
        "Reboots into a stand-alone scanner that can remove rootkits Windows can't touch while running.",
      duration: "reboot",
      icon: Shield,
      warning: "Windows will reboot shortly to perform the scan. Save your work first.",
      group: "defender",
    },

    // ---- Repair ----
    {
      id: "sfc",
      title: "SFC /scannow",
      description: "System File Checker — scans and repairs corrupted Windows system files.",
      duration: "5–15 min",
      icon: Stethoscope,
      group: "repair",
    },
    {
      id: "dism-check",
      title: "DISM CheckHealth",
      description: "Quick check whether the Windows image has any known corruption.",
      duration: "<1 min",
      icon: Stethoscope,
      group: "repair",
    },
    {
      id: "dism-scan",
      title: "DISM ScanHealth",
      description: "Deeper scan that records the component store state.",
      duration: "5–10 min",
      icon: Stethoscope,
      group: "repair",
    },
    {
      id: "dism-restore",
      title: "DISM RestoreHealth",
      description:
        "Repair the Windows image by pulling fresh component files from Windows Update.",
      duration: "10–30 min",
      icon: Wrench,
      group: "repair",
    },
    {
      id: "chkdsk-scan",
      title: "Check disk C: (scan)",
      description:
        "Online read-only scan of the system drive for file-system errors. Uses Repair-Volume.",
      duration: "5–20 min",
      icon: Activity,
      group: "repair",
    },
    {
      id: "chkdsk-spotfix",
      title: "Check disk C: (spot fix)",
      description:
        "Online fix for small file-system errors found during scan. Briefly locks the volume but no reboot needed.",
      duration: "1–5 min",
      icon: Wrench,
      group: "repair",
    },

    // ---- Cleanup ----
    {
      id: "winsxs-cleanup",
      title: "WinSxS cleanup",
      description: "Remove superseded versions of components from the side-by-side store.",
      duration: "5–20 min",
      icon: Eraser,
      group: "cleanup",
    },
    {
      id: "winsxs-resetbase",
      title: "WinSxS cleanup + ResetBase",
      description:
        "Removes all superseded versions and prevents future rollbacks. Frees the most space.",
      duration: "10–30 min",
      icon: Eraser,
      warning:
        "Installed updates can no longer be uninstalled after ResetBase. Recommended only on stable systems.",
      group: "cleanup",
    },
    {
      id: "temp-cleanup",
      title: "Temp folder cleanup",
      description: "Removes contents of %TEMP% and C:\\Windows\\Temp. Skips files in use.",
      duration: "<1 min",
      icon: Eraser,
      group: "cleanup",
    },

    // ---- Reset ----
    {
      id: "wu-components-reset",
      title: "Windows Update components reset",
      description:
        "Stops update services, renames SoftwareDistribution + catroot2, restarts services. Fixes most WU errors.",
      duration: "<1 min",
      icon: RotateCcw,
      group: "reset",
    },
    {
      id: "spooler-reset",
      title: "Print spooler reset",
      description:
        "Stops the spooler, clears all stuck print jobs, restarts the service.",
      duration: "<1 min",
      icon: Printer,
      group: "reset",
    },
    {
      id: "icon-cache-reset",
      title: "Icon cache rebuild",
      description:
        "Restarts Explorer and clears the icon + thumbnail caches. Fixes blank or wrong icons.",
      duration: "<1 min",
      icon: Image,
      warning: "Explorer is restarted — open windows close, the taskbar blinks.",
      group: "reset",
    },
    {
      id: "font-cache-reset",
      title: "Font cache rebuild",
      description: "Clears Windows' font cache. Fixes garbled or missing fonts.",
      duration: "<1 min",
      icon: Type,
      group: "reset",
    },
    {
      id: "store-reset",
      title: "Microsoft Store reset",
      description: "Runs wsreset to clear the Store cache. The Store re-opens automatically.",
      duration: "<1 min",
      icon: Store,
      group: "reset",
    },

    // ---- Network ----
    {
      id: "network-reset",
      title: "Network stack reset",
      description:
        "Resets Winsock + TCP/IP, releases & renews leases, flushes DNS. Fixes most networking weirdness.",
      duration: "<1 min",
      icon: Network,
      warning: "Reboot recommended after this completes.",
      group: "network",
    },
    {
      id: "firewall-reset",
      title: "Firewall reset",
      description:
        "Resets Windows Firewall to factory defaults. Wipes all custom rules and per-app exceptions.",
      duration: "<1 min",
      icon: Flame,
      warning: "All custom firewall rules will be removed.",
      group: "network",
    },
  ];

  const GROUP_TITLES: Record<OpGroup, string> = {
    defender: "Windows Defender",
    repair: "Repair",
    cleanup: "Cleanup & disk",
    reset: "Reset",
    network: "Network",
  };

  const GROUP_ORDER: OpGroup[] = ["defender", "repair", "cleanup", "reset", "network"];

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);
  const powerRes = $derived(canFetch ? powerPlansResource() : null);
  const powerPlans = $derived<PowerPlan[]>(powerRes?.data ?? []);
  const powerLoading = $derived(powerRes?.loading ?? false);
  const powerRefreshing = $derived(powerRes?.revalidating ?? false);
  let powerBusy = $state<string | null>(null);

  let deleteConfirmOpen = $state(false);
  let pendingDelete = $state<PowerPlan | null>(null);

  let pendingOp = $state<OpDef | null>(null);
  let warnOpen = $state(false);

  const PROTECTED_GUIDS = new Set([
    "381b4222-f694-41f0-9685-ff5bb260df2e",
    "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
    "a1841308-3541-4fab-bc81-f71556f20b4a",
  ]);

  function isUltimatePlan(p: PowerPlan): boolean {
    return /ultima[t]/i.test(p.name);
  }
  function isProtected(p: PowerPlan): boolean {
    return PROTECTED_GUIDS.has(p.guid.toLowerCase());
  }

  async function reloadPowerPlans() {
    if (!canFetch) return;
    invalidate("maintenance.powerplans");
    await powerRes?.refresh();
  }

  function isRunning(opId: MaintenanceOp): boolean {
    return tasks.hasRunning(opId);
  }

  async function runOp(op: OpDef) {
    if (isRunning(op.id)) {
      tasks.panelOpen = true;
      return;
    }
    log.info("maintenance.run", op.title, "Started");
    const task = await runMaintenanceTask(op.id, op.title);
    if (task.status === "success") {
      log.success("maintenance.run", op.title, "Finished cleanly");
      toast.success(`${op.title} finished`);
    } else if (task.status === "error") {
      log.error(
        "maintenance.run",
        op.title,
        `Failed (exit ${task.exitCode ?? "?"})`,
      );
      toast.error(`${op.title} failed`, `Exit code ${task.exitCode ?? "?"}`);
    }
  }

  function startOp(op: OpDef) {
    if (op.warning) {
      pendingOp = op;
      warnOpen = true;
      return;
    }
    void runOp(op);
  }

  function confirmWarn() {
    const op = pendingOp;
    warnOpen = false;
    pendingOp = null;
    if (op) void runOp(op);
  }

  async function applyPowerPlan(p: PowerPlan) {
    if (powerBusy || p.active) return;
    powerBusy = p.guid;
    try {
      await setPowerPlan(p.guid);
      log.success("power.set", p.name, `Activated power plan ${p.name}`);
      toast.success(`Power plan: ${p.name}`);
      await reloadPowerPlans();
    } catch (e) {
      log.error("power.set", p.name, "Set failed", String(e));
      toast.error("Power plan change failed", String(e));
    } finally {
      powerBusy = null;
    }
  }

  async function doUnlockUltimate() {
    if (powerBusy) return;
    powerBusy = "unlock";
    try {
      await unlockUltimatePerformance();
      log.success("power.unlock", "Ultimate Performance", "Plan duplicated");
      toast.success("Ultimate Performance unlocked", "It now appears in the list below.");
      await reloadPowerPlans();
    } catch (e) {
      log.error("power.unlock", "Ultimate Performance", "Unlock failed", String(e));
      toast.error("Unlock failed", String(e));
    } finally {
      powerBusy = null;
    }
  }

  async function doCleanmgr() {
    try {
      await launchCleanmgr();
      toast.success("Disk Cleanup opened", "Pick options, then click OK.");
    } catch (e) {
      toast.error("Could not launch cleanmgr", String(e));
    }
  }

  async function doMemDiag() {
    try {
      await launchMemoryDiagnostic();
      toast.success("Memory Diagnostic opened");
    } catch (e) {
      toast.error("Could not launch mdsched", String(e));
    }
  }

  const hasUltimate = $derived(powerPlans.some(isUltimatePlan));

  function askDelete(p: PowerPlan) {
    pendingDelete = p;
    deleteConfirmOpen = true;
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    deleteConfirmOpen = false;
    powerBusy = target.guid;
    try {
      await deletePowerPlan(target.guid);
      log.success("power.set", target.name, `Deleted plan ${target.name}`);
      toast.success(`${target.name} deleted`);
      await reloadPowerPlans();
    } catch (e) {
      log.error("power.set", target.name, "Delete failed", String(e));
      toast.error("Delete failed", String(e));
    } finally {
      powerBusy = null;
      pendingDelete = null;
    }
  }

  function groupOps(g: OpGroup) {
    return OPS.filter((o) => o.group === g);
  }

  // ---- Mass file unblock ----
  let unblockTarget = $state("");
  let unblockRecursive = $state(true);

  const unblockRunning = $derived(tasks.hasRunning("unblock"));

  async function pickUnblockFolder() {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose folder to unblock",
      });
      if (picked && typeof picked === "string") unblockTarget = picked;
    } catch (e) {
      toast.error("Could not open folder picker", String(e));
    }
  }

  async function pickUnblockFile() {
    try {
      const picked = await openDialog({
        directory: false,
        multiple: false,
        title: "Choose file to unblock",
      });
      if (picked && typeof picked === "string") unblockTarget = picked;
    } catch (e) {
      toast.error("Could not open file picker", String(e));
    }
  }

  async function runUnblock() {
    if (unblockRunning) {
      tasks.panelOpen = true;
      return;
    }
    const target = unblockTarget.trim();
    if (!target) {
      toast.error("Pick a folder or file first");
      return;
    }
    log.info("maintenance.run", "Mass file unblock", `Target: ${target}`);
    const task = await runUnblockTask(target, unblockRecursive);
    if (task.status === "success") {
      log.success("maintenance.run", "Mass file unblock", "Unblock finished");
      toast.success("Unblock finished");
    } else if (task.status === "error") {
      log.error("maintenance.run", "Mass file unblock", `Failed (exit ${task.exitCode ?? "?"})`);
      toast.error("Unblock failed", `Exit code ${task.exitCode ?? "?"}`);
    }
  }
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">System maintenance</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {#if !isTauri()}
        Browser preview — maintenance ops need the built app.
      {:else if admin.checked && !admin.elevated}
        Maintenance operations need administrator rights.
      {:else}
        Run several at once — output streams into the terminal panel at the bottom.
      {/if}
    </p>
  </div>
</header>

{#if isTauri() && admin.checked && !admin.elevated}
  <AdminBanner
    title="Maintenance needs administrator"
    description="DISM, SFC, Defender scans, power-plan changes, and resets all require elevated rights. Click to relaunch with UAC."
    declinedToast="Maintenance requires admin."
  />
{:else if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — maintenance ops need the built app.
    </div>
  </Card>
{:else}
  {#each GROUP_ORDER as g (g)}
    <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
      {GROUP_TITLES[g]}
    </h2>
    <Card class="overflow-hidden gap-0 py-0 card-inset mb-6">
      {#each groupOps(g) as op (op.id)}
        {@const running = isRunning(op.id)}
        <div
          class="flex items-start gap-3 py-3 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors"
        >
          <div
            class={cn(
              "grid place-items-center size-8 rounded-md shrink-0",
              running ? "bg-primary/20 text-primary" : "bg-primary/15 text-primary",
            )}
          >
            {#if running}
              <Loader2 class="size-4 animate-spin" />
            {:else}
              <op.icon class="size-4" />
            {/if}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium">{op.title}</span>
              <Badge variant="outline">{op.duration}</Badge>
              {#if op.warning}
                <Badge variant="warning">
                  <AlertTriangle class="size-2.5" />
                  Caution
                </Badge>
              {/if}
              {#if running}
                <Badge variant="success">Running</Badge>
              {/if}
            </div>
            <p class="text-xs text-muted-foreground mt-1 leading-relaxed">{op.description}</p>
            {#if op.warning}
              <p class="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
                {op.warning}
              </p>
            {/if}
          </div>
          <div class="shrink-0 pt-0.5">
            {#if running}
              <Button size="sm" variant="outline" onclick={() => (tasks.panelOpen = true)}>
                Show output
              </Button>
            {:else}
              <Button size="sm" onclick={() => startOp(op)}>
                <Play />
                Run
              </Button>
            {/if}
          </div>
        </div>
      {/each}
      {#if g === "cleanup"}
        <div class="flex items-start gap-3 py-3 px-5 border-b hover:bg-accent/30 transition-colors">
          <div class="grid place-items-center size-8 rounded-md bg-primary/15 text-primary shrink-0">
            <HardDriveDownload class="size-4" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium">Disk Cleanup (cleanmgr)</span>
              <Badge variant="outline">GUI</Badge>
            </div>
            <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
              Opens the classic Disk Cleanup utility so you can pick what to remove.
            </p>
          </div>
          <div class="shrink-0 pt-0.5">
            <Button size="sm" variant="outline" onclick={doCleanmgr}>
              <Play />
              Open
            </Button>
          </div>
        </div>
        <div class="flex items-start gap-3 py-3 px-5 hover:bg-accent/30 transition-colors">
          <div class="grid place-items-center size-8 rounded-md bg-primary/15 text-primary shrink-0">
            <MemoryStick class="size-4" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium">Memory diagnostic</span>
              <Badge variant="outline">Reboots</Badge>
            </div>
            <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
              Schedules a RAM test on next reboot via mdsched.exe.
            </p>
          </div>
          <div class="shrink-0 pt-0.5">
            <Button size="sm" variant="outline" onclick={doMemDiag}>
              <Play />
              Open
            </Button>
          </div>
        </div>
      {/if}
    </Card>
  {/each}

  <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2 mt-6">
    Files
  </h2>
  <Card class="card-inset mb-6 py-0">
    <div class="px-5 py-4 space-y-3">
      <p class="text-xs text-muted-foreground leading-relaxed">
        Strips <code class="font-mono text-[11px]">Zone.Identifier</code> (Mark-of-the-Web) from a folder
        or single file via <code class="font-mono text-[11px]">Unblock-File</code>. Useful for big downloads
        where every extracted file would otherwise trigger a SmartScreen prompt.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex-1 min-w-[16rem]">
          <input
            type="text"
            bind:value={unblockTarget}
            placeholder="Folder or file to unblock…"
            class="w-full h-9 rounded-md border border-input bg-card px-3 text-sm font-mono outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
            disabled={unblockRunning}
          />
        </div>
        <Button variant="outline" onclick={pickUnblockFolder} disabled={unblockRunning}>
          <FolderOpen />
          Folder…
        </Button>
        <Button variant="outline" onclick={pickUnblockFile} disabled={unblockRunning}>
          <FileIcon />
          File…
        </Button>
        {#if unblockRunning}
          <Button variant="outline" onclick={() => (tasks.panelOpen = true)}>
            Show output
          </Button>
        {:else}
          <Button onclick={runUnblock} disabled={!unblockTarget.trim()}>
            <Play />
            Unblock
          </Button>
        {/if}
      </div>
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <Checkbox bind:checked={unblockRecursive} disabled={unblockRunning} />
        <span class="text-sm">
          Recurse into subfolders
          <span class="text-muted-foreground">— folder targets only</span>
        </span>
      </label>
    </div>
  </Card>

  <div class="flex items-center justify-between mb-2 mt-6">
    <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
      Power plans
    </h2>
    <Button variant="outline" onclick={reloadPowerPlans} disabled={powerLoading}>
      <RefreshCw class={powerLoading || powerRefreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  </div>
  {#if powerLoading}
    <div class="grid place-items-center py-16 text-sm text-muted-foreground">
      <Loader2 class="size-5 animate-spin mb-2" />
      Reading power plans…
    </div>
  {:else if powerPlans.length === 0}
    <Card class="card-inset">
      <div class="px-6 py-8 text-center text-sm text-muted-foreground">
        No power plans returned.
      </div>
    </Card>
  {:else}
    <Card class="overflow-hidden gap-0 py-0 card-inset">
      {#each powerPlans as p (p.guid)}
        {@const isBusy = powerBusy === p.guid}
        <div
          class="flex items-center gap-3 py-3 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors"
        >
          <div class="grid place-items-center size-8 rounded-md bg-accent/60 shrink-0">
            <Zap class={cn("size-4", p.active ? "text-success" : "text-muted-foreground")} />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium">{p.name}</span>
              {#if p.active}
                <Badge variant="success">Active</Badge>
              {/if}
            </div>
            <p class="text-[10px] text-muted-foreground/60 mt-1 font-mono">{p.guid}</p>
          </div>
          <div class="shrink-0 flex items-center gap-2">
            {#if isBusy}
              <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
            {/if}
            {#if !p.active}
              <Button
                size="sm"
                variant="outline"
                onclick={() => applyPowerPlan(p)}
                disabled={!!powerBusy}
              >
                Activate
              </Button>
            {/if}
            {#if !p.active}
              <Button
                size="sm"
                variant="outline"
                onclick={() => askDelete(p)}
                disabled={!!powerBusy || isProtected(p)}
                title={isProtected(p)
                  ? "Built-in Windows plan — cannot be deleted"
                  : "Delete this power plan"}
              >
                <Trash2 />
              </Button>
            {/if}
          </div>
        </div>
      {/each}
    </Card>
    {#if !hasUltimate}
      <div class="mt-3 flex">
        <Button variant="outline" onclick={doUnlockUltimate} disabled={!!powerBusy}>
          {#if powerBusy === "unlock"}
            <Loader2 class="animate-spin" />
          {:else}
            <Sparkles />
          {/if}
          Unlock Ultimate Performance
        </Button>
      </div>
    {/if}
  {/if}
{/if}

<Dialog
  bind:open={deleteConfirmOpen}
  title={pendingDelete ? `Delete '${pendingDelete.name}'?` : "Delete power plan?"}
  description="This permanently removes the power plan from Windows. The active plan and built-in Windows schemes cannot be deleted."
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (deleteConfirmOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={confirmDelete}>
      <Trash2 />
      Delete plan
    </Button>
  {/snippet}
</Dialog>

<Dialog
  bind:open={warnOpen}
  title={pendingOp ? `Run '${pendingOp.title}'?` : "Confirm"}
  description={pendingOp?.warning ?? ""}
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => ((warnOpen = false), (pendingOp = null))}>
      Cancel
    </Button>
    <Button onclick={confirmWarn}>
      <Play />
      Run anyway
    </Button>
  {/snippet}
</Dialog>
