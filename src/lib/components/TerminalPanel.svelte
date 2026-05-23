<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { tasks, type Task, resizeTask } from "$lib/tasks.svelte";
  import { theme } from "$lib/theme.svelte";
  import { cn } from "$lib/utils";
  import { Dialog, Button, toast } from "$lib/ui";
  import {
    Loader2,
    CheckCircle2,
    XCircle,
    CircleSlash,
    X,
    Trash2,
    ChevronDown,
    Terminal,
  } from "@lucide/svelte";

  const activeTask = $derived<Task | null>(
    tasks.tasks.find((t) => t.id === tasks.activeTabId) ??
      tasks.tasks[tasks.tasks.length - 1] ??
      null,
  );

  let resizing = $state(false);
  let cancelConfirmOpen = $state(false);
  let pendingCancelTaskId = $state<string | null>(null);

  function fmtElapsed(t: Task): string {
    const end = t.endedAt ?? Date.now();
    const ms = end - t.startedAt;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${r}s`;
  }

  function startResize(e: PointerEvent) {
    e.preventDefault();
    resizing = true;
    const startY = e.clientY;
    const startH = tasks.panelHeight;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const dy = startY - ev.clientY;
      tasks.setPanelHeight(startH + dy);
    };
    const onUp = (ev: PointerEvent) => {
      resizing = false;
      handle?.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onResizeKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 60 : 20;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      tasks.setPanelHeight(tasks.panelHeight + step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      tasks.setPanelHeight(tasks.panelHeight - step);
    }
  }

  // Live theme follow: re-apply the matching xterm theme to every open
  // terminal whenever the app's resolved theme flips light↔dark.
  $effect(() => {
    tasks.applyTheme(theme.resolved);
  });

  // Re-render elapsed time for running tasks once a second.
  let tick1s = $state(0);
  $effect(() => {
    if (!tasks.active.length) return;
    const h = setInterval(() => (tick1s = tick1s + 1), 1000);
    return () => clearInterval(h);
  });
  const elapsedMap = $derived.by(() => {
    tick1s;
    const m = new Map<string, string>();
    for (const t of tasks.tasks) m.set(t.id, fmtElapsed(t));
    return m;
  });

  // Mount a task's xterm Terminal into its host div. The same element instance
  // persists for the lifetime of the task, so this action runs exactly once per
  // task. ResizeObserver re-fits whenever the host changes size (panel resize,
  // sidebar toggle, etc.) and propagates the new cols/rows to the PTY.
  function mountTerm(node: HTMLDivElement, task: Task) {
    let ro: ResizeObserver | null = null;
    let opened = false;
    const openWhenReady = () => {
      if (opened || node.clientWidth === 0 || node.clientHeight === 0) return;
      opened = true;
      task.terminal.open(node);
      try {
        task.fit.fit();
      } catch {}
      ro = new ResizeObserver(() => {
        if (node.clientWidth === 0 || node.clientHeight === 0) return;
        try {
          task.fit.fit();
          resizeTask(task, task.terminal.cols, task.terminal.rows);
        } catch {}
      });
      ro.observe(node);
    };
    // If the host is visible right away, open immediately. Otherwise wait —
    // the activation effect re-tries once the host becomes visible.
    requestAnimationFrame(openWhenReady);
    return {
      update(newTask: Task) {
        // task object reference may change across re-renders; we just need it
        // available for the ResizeObserver callback closure, which is bound to
        // the original. That's fine — terminal/fit refs are stable per id.
      },
      destroy() {
        ro?.disconnect();
      },
    };
  }

  // When the active tab changes, fit the newly-shown terminal (it was likely
  // 0×0 while hidden) and inform Rust of the new size.
  $effect(() => {
    const id = tasks.activeTabId;
    const t = tasks.tasks.find((x) => x.id === id);
    if (!t) return;
    requestAnimationFrame(() => {
      try {
        t.fit.fit();
        resizeTask(t, t.terminal.cols, t.terminal.rows);
      } catch {}
    });
  });

  // When the panel height changes, refit the active terminal too — the
  // ResizeObserver does this but only after the layout settles.
  $effect(() => {
    tasks.panelHeight;
    const t = tasks.tasks.find((x) => x.id === tasks.activeTabId);
    if (!t) return;
    requestAnimationFrame(() => {
      try {
        t.fit.fit();
        resizeTask(t, t.terminal.cols, t.terminal.rows);
      } catch {}
    });
  });

  function tryCloseTab(t: Task, e: Event) {
    e.stopPropagation();
    if (t.status === "running") {
      pendingCancelTaskId = t.id;
      cancelConfirmOpen = true;
    } else {
      tasks.remove(t.id);
    }
  }

  async function confirmCancelTab() {
    const id = pendingCancelTaskId;
    cancelConfirmOpen = false;
    pendingCancelTaskId = null;
    if (!id) return;
    const t = tasks.tasks.find((x) => x.id === id);
    if (!t) return;
    await tasks.cancel(id);
    toast.show(`Cancelled ${t.label}`);
  }
</script>

{#if tasks.tasks.length > 0 && tasks.panelOpen}
  <div
    class="fixed left-60 right-0 bottom-0 z-30 bg-background border-t border-foreground/10 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] flex flex-col"
    style="height: {tasks.panelHeight}px"
  >
    <button
      type="button"
      aria-label="Resize terminal"
      class="absolute -top-1 left-0 right-0 h-2 cursor-ns-resize z-10 group flex items-center justify-center bg-transparent border-0 p-0"
      onpointerdown={startResize}
      onkeydown={onResizeKey}
    >
      <span
        class={cn(
          "h-0.5 rounded-full bg-foreground/15 transition-all w-12",
          resizing && "bg-primary w-24 h-1",
          "group-hover:bg-foreground/40 group-hover:w-24",
        )}
      ></span>
    </button>
    <div class="flex items-center h-9 border-b border-foreground/8 bg-foreground/[0.02]">
      <div class="flex items-center gap-1 px-2 overflow-x-auto flex-1 min-w-0">
        {#each tasks.tasks as t (t.id)}
          {@const isActive = activeTask?.id === t.id}
          <button
            type="button"
            onclick={() => tasks.focus(t.id)}
            class={cn(
              "group flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-md text-xs font-medium transition-colors shrink-0",
              isActive
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
            title={t.label}
          >
            {#if t.status === "running"}
              <Loader2 class="size-3 animate-spin text-primary" />
            {:else if t.status === "success"}
              <CheckCircle2 class="size-3 text-success" />
            {:else if t.status === "error"}
              <XCircle class="size-3 text-destructive" />
            {:else}
              <CircleSlash class="size-3 text-muted-foreground" />
            {/if}
            <span class="whitespace-nowrap">{t.label}</span>
            {#if t.status === "running"}
              <span class="text-[10px] text-muted-foreground tabular-nums ml-1">
                {elapsedMap.get(t.id)}
              </span>
            {/if}
            <span
              role="button"
              tabindex="0"
              aria-label="Close tab"
              class="ml-1 grid place-items-center size-4 rounded hover:bg-foreground/15 opacity-60 group-hover:opacity-100"
              onclick={(e) => tryCloseTab(t, e)}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") tryCloseTab(t, e);
              }}
            >
              <X class="size-2.5" />
            </span>
          </button>
        {/each}
      </div>
      <div class="flex items-center gap-0.5 pr-1 shrink-0">
        {#if tasks.tasks.some((t) => t.status !== "running")}
          <button
            type="button"
            class="grid place-items-center size-7 rounded hover:bg-foreground/8 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear completed"
            onclick={() => tasks.clearCompleted()}
          >
            <Trash2 class="size-3.5" />
          </button>
        {/if}
        <button
          type="button"
          class="grid place-items-center size-7 rounded hover:bg-foreground/8 text-muted-foreground hover:text-foreground transition-colors"
          title="Hide terminal"
          onclick={() => (tasks.panelOpen = false)}
        >
          <ChevronDown class="size-4" />
        </button>
      </div>
    </div>

    <div class="flex-1 relative">
      {#each tasks.tasks as t (t.id)}
        <div
          class={cn(
            "absolute inset-0 px-2 py-1",
            activeTask?.id !== t.id && "hidden",
          )}
        >
          <div class="h-full w-full" use:mountTerm={t}></div>
        </div>
      {/each}
    </div>

    {#if activeTask}
      <div
        class="flex items-center gap-2 h-7 px-4 border-t border-foreground/8 bg-foreground/[0.02] text-[11px] font-medium shrink-0"
      >
        {#if activeTask.status === "running"}
          <Loader2 class="size-3 animate-spin text-primary" />
          <span class="text-muted-foreground">Running</span>
          <span class="text-muted-foreground/60">·</span>
          <span class="tabular-nums text-muted-foreground">{elapsedMap.get(activeTask.id)}</span>
        {:else if activeTask.status === "success"}
          <CheckCircle2 class="size-3 text-success" />
          <span class="text-success">Finished cleanly</span>
          <span class="text-muted-foreground/60">·</span>
          <span class="text-muted-foreground tabular-nums">
            exit {activeTask.exitCode} · ran {fmtElapsed(activeTask)}
          </span>
        {:else if activeTask.status === "error"}
          <XCircle class="size-3 text-destructive" />
          <span class="text-destructive">Failed</span>
          <span class="text-muted-foreground/60">·</span>
          <span class="text-muted-foreground tabular-nums">
            exit {activeTask.exitCode} · ran {fmtElapsed(activeTask)}
          </span>
        {:else if activeTask.status === "cancelled"}
          <CircleSlash class="size-3 text-muted-foreground" />
          <span class="text-muted-foreground">Cancelled</span>
          <span class="text-muted-foreground/60">·</span>
          <span class="text-muted-foreground tabular-nums">
            ran {fmtElapsed(activeTask)}
          </span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<!-- Floating restore button when panel hidden but tasks exist -->
{#if tasks.tasks.length > 0 && !tasks.panelOpen}
  <button
    type="button"
    class="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 pl-3 pr-3.5 h-9 rounded-full bg-foreground text-background shadow-lg hover:bg-foreground/90 transition-all text-xs font-medium"
    onclick={() => (tasks.panelOpen = true)}
    title="Show terminal"
  >
    <Terminal class="size-3.5" />
    {#if tasks.active.length > 0}
      <Loader2 class="size-3 animate-spin" />
      {tasks.active.length} running
    {:else}
      Terminal
    {/if}
  </button>
{/if}

<Dialog
  bind:open={cancelConfirmOpen}
  title="Cancel this task?"
  description="The running PowerShell process will be killed. Any work it had partially done so far won't roll back automatically."
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (cancelConfirmOpen = false)}>Keep running</Button>
    <Button variant="destructive" onclick={confirmCancelTab}>
      <X />
      Cancel task
    </Button>
  {/snippet}
</Dialog>
