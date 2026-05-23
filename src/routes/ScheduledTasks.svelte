<script lang="ts">
  import { Card, Button, Badge, toast, Dialog } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Search,
    AlertTriangle,
    Clock,
    Play,
    Trash2,
    Power,
    ChevronRight,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    setScheduledTask,
    runScheduledTask,
    deleteScheduledTask,
    type ScheduledTask,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { cn } from "$lib/utils";
  import { scheduledTasksResource } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  // Tasks worth surfacing even when "hide Microsoft" is on. Path + name combined.
  const NOTABLE: Record<string, string> = {
    "\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser":
      "CEIP — collects compatibility telemetry for Microsoft.",
    "\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater":
      "Collects program inventory for the Compatibility Appraiser.",
    "\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator":
      "Uploads CEIP data to Microsoft.",
    "\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip":
      "Reports USB device telemetry.",
    "\\Microsoft\\Windows\\Customer Experience Improvement Program\\KernelCeipTask":
      "Reports kernel telemetry.",
    "\\Microsoft\\Windows\\Autochk\\Proxy":
      "Uploads autochk telemetry as part of SQM.",
    "\\Microsoft\\Windows\\Maps\\MapsToastTask":
      "Maps telemetry / toast notifications.",
    "\\Microsoft\\Windows\\Maps\\MapsUpdateTask":
      "Downloads pre-cached map data — unused on most setups.",
    "\\Microsoft\\Windows\\Feedback\\Siuf\\DmClient":
      "Feedback Hub telemetry uploader.",
    "\\Microsoft\\Windows\\Feedback\\Siuf\\DmClientOnScenarioDownload":
      "Feedback Hub scenario downloader.",
    "\\Microsoft\\Windows\\Windows Error Reporting\\QueueReporting":
      "Uploads queued crash reports.",
    "\\Microsoft\\Windows\\NetTrace\\GatherNetworkInfo":
      "Periodic network configuration snapshot.",
    "\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector":
      "Disk diagnostic data uploader.",
  };

  function isNotable(t: ScheduledTask): string | undefined {
    return NOTABLE[t.path.replace(/\\$/, "") + "\\" + t.name];
  }

  let filter = $state("");
  let hideMicrosoft = $state(true);
  let expandedPaths = $state<Set<string>>(new Set());

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);
  const tasksRes = $derived(canFetch ? scheduledTasksResource() : null);
  const rawTasks = $derived<ScheduledTask[]>(tasksRes?.data ?? []);
  const loading = $derived(tasksRes?.loading ?? false);
  const refreshing = $derived(tasksRes?.revalidating ?? false);

  // Optimistic state overrides per "path|name" key.
  let stateOverrides = $state<Map<string, string>>(new Map());
  let removed = $state<Set<string>>(new Set());

  const tasks = $derived<ScheduledTask[]>(
    rawTasks
      .filter((t) => !removed.has(t.path + "|" + t.name))
      .map((t) => {
        const k = t.path + "|" + t.name;
        const o = stateOverrides.get(k);
        return o ? { ...t, state: o } : t;
      }),
  );

  let busy = $state<Set<string>>(new Set());

  let confirmDeleteOpen = $state(false);
  let pendingDelete = $state<ScheduledTask | null>(null);

  async function reload() {
    if (!canFetch) return;
    invalidate("schtasks.list");
    stateOverrides = new Map();
    removed = new Set();
    await tasksRes?.refresh();
  }

  // Group tasks by path for the tree view. Within a path, tasks are sorted
  // by name. Paths are sorted alphabetically.
  type Group = { path: string; tasks: ScheduledTask[] };
  const filtered = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    let list = tasks;
    if (hideMicrosoft && !q) {
      list = list.filter((t) => {
        const isMs = t.path.startsWith("\\Microsoft\\");
        return !isMs || isNotable(t);
      });
    }
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.path.toLowerCase().includes(q) ||
          t.author.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }
    return list;
  });

  const groups = $derived.by<Group[]>(() => {
    const map = new Map<string, ScheduledTask[]>();
    for (const t of filtered) {
      const arr = map.get(t.path) ?? [];
      arr.push(t);
      map.set(t.path, arr);
    }
    return Array.from(map.entries())
      .map(([path, tasks]) => ({
        path,
        tasks: tasks.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  });

  const totalCount = $derived(tasks.length);
  const shownCount = $derived(filtered.length);
  const notableInList = $derived(tasks.filter(isNotable).length);

  function toggleGroup(path: string) {
    const next = new Set(expandedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    expandedPaths = next;
  }

  function stateColor(s: string): "success" | "outline" | "warning" | "default" | "destructive" {
    if (s === "Running") return "success";
    if (s === "Ready") return "default";
    if (s === "Disabled") return "outline";
    if (s === "Queued") return "warning";
    return "outline";
  }

  function fmtRun(s: string | null): string {
    if (!s) return "—";
    try {
      const d = new Date(s);
      return d.toLocaleString();
    } catch {
      return s;
    }
  }

  function fmtResult(n: number): string {
    if (n === 0) return "OK";
    if (n === 267011) return "Has not run";
    if (n === 267009) return "Currently running";
    return `0x${(n >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
  }

  async function toggleTask(t: ScheduledTask) {
    const k = t.path + "|" + t.name;
    if (busy.has(k)) return;
    const enable = t.state === "Disabled";
    busy = new Set(busy).add(k);
    try {
      await setScheduledTask(t.path, t.name, enable);
      const next = new Map(stateOverrides);
      next.set(k, enable ? "Ready" : "Disabled");
      stateOverrides = next;
      log.success(
        "schtasks.toggle",
        t.path + t.name,
        `${t.state} → ${enable ? "Ready" : "Disabled"}`,
      );
      toast.success(`${t.name}: ${enable ? "Enabled" : "Disabled"}`);
    } catch (e) {
      toast.error("Toggle failed", String(e));
      log.error("schtasks.toggle", t.path + t.name, "Failed", String(e));
    } finally {
      const after = new Set(busy);
      after.delete(k);
      busy = after;
    }
  }

  async function runNow(t: ScheduledTask) {
    const k = t.path + "|" + t.name;
    if (busy.has(k)) return;
    busy = new Set(busy).add(k);
    try {
      await runScheduledTask(t.path, t.name);
      log.success("schtasks.run", t.path + t.name, "Triggered task");
      toast.success(`Started ${t.name}`);
    } catch (e) {
      toast.error("Run failed", String(e));
      log.error("schtasks.run", t.path + t.name, "Failed", String(e));
    } finally {
      const after = new Set(busy);
      after.delete(k);
      busy = after;
    }
  }

  function askDelete(t: ScheduledTask) {
    pendingDelete = t;
    confirmDeleteOpen = true;
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const t = pendingDelete;
    confirmDeleteOpen = false;
    pendingDelete = null;
    const k = t.path + "|" + t.name;
    if (busy.has(k)) return;
    busy = new Set(busy).add(k);
    try {
      await deleteScheduledTask(t.path, t.name);
      removed = new Set(removed).add(k);
      log.success("schtasks.delete", t.path + t.name, "Task deleted");
      toast.success(`Deleted ${t.name}`);
    } catch (e) {
      toast.error("Delete failed", String(e));
      log.error("schtasks.delete", t.path + t.name, "Failed", String(e));
    } finally {
      const after = new Set(busy);
      after.delete(k);
      busy = after;
    }
  }
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Scheduled tasks</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {#if loading}
        Querying tasks…
      {:else if isTauri()}
        {#if hideMicrosoft && !filter}
          Showing <span class="font-medium text-foreground tabular-nums">{shownCount}</span>
          of {totalCount} tasks
          {#if notableInList > 0}
            · <span class="text-warning">{notableInList} notable</span>
          {/if}
        {:else}
          Showing <span class="font-medium text-foreground tabular-nums">{shownCount}</span>
          of {totalCount} tasks
        {/if}
        {#if refreshing}
          · <span class="text-muted-foreground/70">refreshing…</span>
        {/if}
      {:else}
        Browser preview — scheduled task queries require the built app.
      {/if}
    </p>
  </div>
  <div class="flex items-center gap-2">
    <Button
      variant="outline"
      onclick={() => (hideMicrosoft = !hideMicrosoft)}
      disabled={loading}
    >
      {hideMicrosoft ? "Show Microsoft tasks" : "Hide Microsoft tasks"}
    </Button>
    <Button variant="outline" onclick={reload} disabled={loading || !canFetch}>
      <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  </div>
</header>

{#if isTauri() && admin.checked && !admin.elevated}
  <AdminBanner
    title="Scheduled task control needs administrator"
    description="Reading hidden system tasks and changing them requires elevated rights. Click here to relaunch with UAC."
    declinedToast="Scheduled task control requires admin."
  />
{:else if isTauri() && !loading}
  <div class="mb-4 flex items-center gap-2">
    <div class="flex-1 relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <input
        type="text"
        bind:value={filter}
        placeholder="Filter by name, path, author, or description…"
        class="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-card text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
      />
    </div>
  </div>
{/if}

{#if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Loading scheduled tasks…
  </div>
{:else if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — scheduled tasks need the built app.
    </div>
  </Card>
{:else if groups.length === 0}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      No tasks match.
    </div>
  </Card>
{:else}
  <div class="flex flex-col gap-2">
    {#each groups as group (group.path)}
      {@const expanded = filter.length > 0 || expandedPaths.has(group.path)}
      <Card class="overflow-hidden gap-0 py-0 card-inset">
        <button
          type="button"
          onclick={() => toggleGroup(group.path)}
          class="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-accent/40 transition-colors text-left"
        >
          <ChevronRight
            class={cn("size-3.5 text-muted-foreground transition-transform", expanded ? "rotate-90" : "")}
          />
          <span class="text-sm font-mono text-foreground/80 truncate flex-1">
            {group.path === "\\" ? "\\ (root)" : group.path}
          </span>
          <Badge variant="outline">{group.tasks.length}</Badge>
        </button>
        {#if expanded}
          <div class="border-t border-foreground/8">
            {#each group.tasks as t (t.path + "|" + t.name)}
              {@const k = t.path + "|" + t.name}
              {@const isBusy = busy.has(k)}
              {@const note = isNotable(t)}
              <div
                class={cn(
                  "flex items-start gap-3 py-3 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors",
                  note ? "bg-amber-500/[0.04]" : "",
                )}
              >
                <div class="grid place-items-center size-8 rounded-md bg-accent/60 shrink-0">
                  <Clock
                    class={cn(
                      "size-3.5",
                      t.state === "Running"
                        ? "text-success"
                        : t.state === "Disabled"
                          ? "text-muted-foreground/50"
                          : "text-muted-foreground",
                    )}
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-medium truncate">{t.name}</span>
                    <Badge variant={stateColor(t.state)}>{t.state}</Badge>
                    {#if note}
                      <Badge variant="warning">
                        <AlertTriangle class="size-2.5" />
                        Notable
                      </Badge>
                    {/if}
                  </div>
                  {#if note}
                    <p class="text-xs text-foreground/70 mt-1 leading-relaxed">{note}</p>
                  {:else if t.description}
                    <p class="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                      {t.description}
                    </p>
                  {/if}
                  <div class="text-[10px] text-muted-foreground/60 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {#if t.author}<span>by {t.author}</span>{/if}
                    {#if t.actions}<span class="font-mono">{t.actions}</span>{/if}
                    <span>last: {fmtRun(t.lastRun)} ({fmtResult(t.lastResult)})</span>
                    {#if t.nextRun}<span>next: {fmtRun(t.nextRun)}</span>{/if}
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 pt-0.5">
                  {#if isBusy}
                    <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
                  {/if}
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => runNow(t)}
                    disabled={isBusy || t.state === "Disabled"}
                    title="Run now"
                  >
                    <Play />
                  </Button>
                  <Button
                    size="sm"
                    variant={t.state === "Disabled" ? "default" : "outline"}
                    onclick={() => toggleTask(t)}
                    disabled={isBusy}
                  >
                    <Power />
                    {t.state === "Disabled" ? "Enable" : "Disable"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => askDelete(t)}
                    disabled={isBusy}
                    title="Delete task"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </Card>
    {/each}
  </div>
{/if}

<Dialog
  bind:open={confirmDeleteOpen}
  title={pendingDelete ? `Delete '${pendingDelete.name}'?` : ""}
  description={pendingDelete
    ? `This permanently removes the task from ${pendingDelete.path}. Built-in Windows tasks may be recreated by Windows Update or system maintenance.`
    : ""}
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmDeleteOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={confirmDelete}>
      <Trash2 />
      Delete task
    </Button>
  {/snippet}
</Dialog>
