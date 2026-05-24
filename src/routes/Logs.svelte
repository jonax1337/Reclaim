<script lang="ts">
  import { Card, Button, Badge, PageHeader, toast } from "$lib/ui";
  import { Trash2, Info, CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronRight, Download } from "@lucide/svelte";
  import { log, ACTION_LABELS, type LogEntry, type LogLevel } from "$lib/log.svelte";
  import { isTauri, readActivityLog } from "$lib/tweaks/bridge";
  import { save as saveDialog } from "@tauri-apps/plugin-dialog";
  import { writeTextFile } from "$lib/tweaks/bridge";
  import { cn } from "$lib/utils";

  let exporting = $state(false);

  function entriesToText(entries: LogEntry[]): string {
    return entries
      .slice()
      .reverse()
      .map((e) => {
        const ts = new Date(e.ts).toISOString();
        const label = ACTION_LABELS[e.action] ?? e.action;
        const head = `[${ts}] ${e.level.toUpperCase().padEnd(7)} ${label} — ${e.target}: ${e.message}`;
        return e.details ? `${head}\n    ${e.details.replace(/\n/g, "\n    ")}` : head;
      })
      .join("\n");
  }

  async function exportLog() {
    if (exporting) return;
    exporting = true;
    try {
      const date = new Date().toISOString().slice(0, 10);
      const defaultName = `reclaim-activity-${date}.log`;
      let content = "";
      if (isTauri()) {
        // Prefer the on-disk JSON-lines mirror — it covers older entries that
        // may have rotated out of the 500-entry in-memory ring.
        try {
          content = await readActivityLog();
        } catch {}
      }
      if (!content) {
        // Fallback to the in-memory entries formatted as a flat text log.
        content = entriesToText(log.entries);
      }
      if (!content) {
        toast.error("Nothing to export");
        return;
      }
      if (!isTauri()) {
        // Browser preview: trigger a download via Blob.
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultName;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Activity log downloaded");
        return;
      }
      const picked = await saveDialog({
        title: "Export activity log",
        defaultPath: defaultName,
        filters: [
          { name: "Log file", extensions: ["log"] },
          { name: "JSON Lines", extensions: ["jsonl"] },
          { name: "Text", extensions: ["txt"] },
        ],
      });
      if (!picked) return;
      await writeTextFile(picked, content);
      toast.success("Activity log exported");
    } catch (e) {
      toast.error("Export failed", String(e));
    } finally {
      exporting = false;
    }
  }

  let expanded = $state<Set<number>>(new Set());
  let levelFilter = $state<LogLevel | "all">("all");

  function toggleExpand(id: number) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function levelIcon(level: LogLevel) {
    return level === "success"
      ? CheckCircle2
      : level === "warn"
        ? AlertCircle
        : level === "error"
          ? XCircle
          : Info;
  }
  function levelColor(level: LogLevel) {
    return level === "success"
      ? "text-success"
      : level === "warn"
        ? "text-warning"
        : level === "error"
          ? "text-destructive"
          : "text-muted-foreground";
  }
  function levelBadge(level: LogLevel) {
    return level === "success"
      ? "success"
      : level === "warn"
        ? "warning"
        : level === "error"
          ? "destructive"
          : "outline";
  }

  const filtered = $derived(
    levelFilter === "all" ? log.entries : log.entries.filter((e) => e.level === levelFilter),
  );

  const counts = $derived.by(() => {
    const c = { info: 0, success: 0, warn: 0, error: 0 };
    for (const e of log.entries) c[e.level]++;
    return c;
  });
</script>

<PageHeader title="Activity log">
  {#snippet actions()}
    <div class="flex gap-2">
      <Button
        variant="outline"
        onclick={exportLog}
        disabled={exporting || log.entries.length === 0}
      >
        <Download />
        Export…
      </Button>
      <Button
        variant="outline"
        onclick={() => log.clear()}
        disabled={log.entries.length === 0}
      >
        <Trash2 />
        Clear log
      </Button>
    </div>
  {/snippet}
  Every tweak, removal and system action — last {log.entries.length === 500
    ? "500"
    : log.entries.length} events.
</PageHeader>

<div class="flex flex-wrap gap-2 mb-4">
  {#each [
    { value: "all", label: "All", count: log.entries.length },
    { value: "success", label: "Success", count: counts.success },
    { value: "info", label: "Info", count: counts.info },
    { value: "warn", label: "Warnings", count: counts.warn },
    { value: "error", label: "Errors", count: counts.error },
  ] as f (f.value)}
    <button
      type="button"
      onclick={() => (levelFilter = f.value as LogLevel | "all")}
      class={cn(
        "inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-colors border",
        levelFilter === f.value
          ? "border-primary bg-primary/10 text-primary"
          : "border-input hover:bg-accent/40 text-muted-foreground",
      )}
    >
      {f.label}
      <span class="tabular-nums text-[10px] opacity-70">({f.count})</span>
    </button>
  {/each}
</div>

{#if log.entries.length === 0}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      No activity yet — apply or revert a tweak and it'll show up here.
    </div>
  </Card>
{:else if filtered.length === 0}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      No entries matching this filter.
    </div>
  </Card>
{:else}
  <Card class="overflow-hidden gap-0 py-0 card-inset">
    {#each filtered as e (e.id)}
      {@const Icon = levelIcon(e.level)}
      {@const isOpen = expanded.has(e.id)}
      <div class="border-b last:border-b-0">
        <button
          type="button"
          onclick={() => e.details && toggleExpand(e.id)}
          class={cn(
            "w-full flex items-start gap-3 py-3 px-5 text-left transition-colors",
            e.details ? "cursor-pointer hover:bg-accent/30" : "cursor-default",
          )}
        >
          <Icon class={cn("size-4 shrink-0 mt-0.5", levelColor(e.level))} />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <Badge variant={levelBadge(e.level) as never}>
                {ACTION_LABELS[e.action]}
              </Badge>
              <span class="text-sm font-medium truncate">{e.target}</span>
            </div>
            <p class="text-xs text-muted-foreground mt-0.5">{e.message}</p>
            {#if isOpen && e.details}
              <pre
                class="mt-2 text-[11px] font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-words"
              >{e.details}</pre>
            {/if}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-[10px] text-muted-foreground tabular-nums font-mono">
              {formatTime(e.ts)}
            </span>
            {#if e.details}
              {#if isOpen}
                <ChevronDown class="size-3.5 text-muted-foreground" />
              {:else}
                <ChevronRight class="size-3.5 text-muted-foreground" />
              {/if}
            {/if}
          </div>
        </button>
      </div>
    {/each}
  </Card>
{/if}
