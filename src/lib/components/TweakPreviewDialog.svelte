<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { X, Wand2, RotateCcw, Loader2, ShieldAlert, AlertTriangle, RefreshCcw, FileCode2, KeyRound } from "@lucide/svelte";
  import { Button, Badge } from "$lib/ui";
  import type { Snippet } from "svelte";
  import type { Tweak, TweakOp, RegOp, ShellOp } from "$lib/tweaks/catalog";
  import type { TweakState } from "$lib/tweaks/executor";
  import { tweakRequiresAdmin } from "$lib/tweaks/executor";

  type Mode = "apply" | "revert";

  type Props = {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    title: string;
    subtitle?: string;
    tweaks: Tweak[];
    states?: Record<string, TweakState>;
    mode?: Mode;
    confirmLabel?: string;
    onConfirm?: () => void | Promise<void>;
    busy?: boolean;
    footer?: Snippet;
  };

  let {
    open = $bindable(false),
    onOpenChange,
    title,
    subtitle,
    tweaks,
    states,
    mode = "apply",
    confirmLabel,
    onConfirm,
    busy = false,
    footer,
  }: Props = $props();

  const categoryLabel: Record<string, string> = {
    privacy: "Privacy",
    ai: "AI",
    explorer: "Explorer",
    search: "Search",
    taskbar: "Taskbar",
    updates: "Updates",
    performance: "Performance",
    notifications: "Notifications",
    bloatware: "Bloatware",
  };

  const restartLabel: Record<string, string> = {
    explorer: "Explorer restart",
    logon: "Sign-out required",
    system: "Reboot required",
  };

  function opsFor(t: Tweak): TweakOp[] {
    return mode === "revert" && t.revert ? t.revert : t.apply;
  }

  function fmtRegValue(v: number | string | undefined, type: string): string {
    if (v === undefined) return "—";
    if (typeof v === "number") {
      if (type === "DWORD" || type === "QWORD") {
        return `${v} (0x${v.toString(16).toUpperCase()})`;
      }
      return String(v);
    }
    return `"${v}"`;
  }

  function shortPath(p: string): { head: string; tail: string } {
    const parts = p.split("\\");
    if (parts.length <= 4) return { head: "", tail: p };
    const tail = parts.slice(-3).join("\\");
    const head = parts.slice(0, parts.length - 3).join("\\");
    return { head: head + "\\", tail };
  }
</script>

<DialogPrimitive.Root bind:open onOpenChange={(v) => onOpenChange?.(v)}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogPrimitive.Content
      class="fixed left-1/2 top-1/2 z-50 flex w-[min(960px,calc(100vw-2rem))] max-h-[min(820px,calc(100vh-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col border bg-card shadow-lg rounded-xl overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    >
      <header class="relative px-6 pt-5 pb-4 border-b border-hairline-strong">
        <div class="pr-10">
          <DialogPrimitive.Title class="text-lg font-semibold leading-none tracking-tight">
            {title}
          </DialogPrimitive.Title>
          {#if subtitle}
            <DialogPrimitive.Description class="mt-2 text-sm text-muted-foreground leading-relaxed">
              {subtitle}
            </DialogPrimitive.Description>
          {/if}
        </div>
        <DialogPrimitive.Close
          class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none"
        >
          <X class="size-4" />
          <span class="sr-only">Close</span>
        </DialogPrimitive.Close>
      </header>

      <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {#if tweaks.length === 0}
          <div class="text-center text-sm text-muted-foreground py-10">
            Nothing to show.
          </div>
        {/if}
        {#each tweaks as t (t.id)}
          {@const ops = opsFor(t)}
          {@const state = states?.[t.id]}
          {@const adminOnly = tweakRequiresAdmin(t)}
          <article
            class="rounded-xl border border-hairline-strong bg-surface-1 hover:bg-surface-2 transition-colors"
          >
            <header class="flex items-start gap-3 px-4 pt-3.5 pb-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-sm font-semibold leading-tight">{t.title}</h3>
                  {#if state === "on"}
                    <Badge variant="success" class="text-[10px] px-1.5 py-0">Active</Badge>
                  {:else if state === "off"}
                    <Badge variant="secondary" class="text-[10px] px-1.5 py-0">Inactive</Badge>
                  {/if}
                  {#if t.recommended}
                    <Badge variant="default" class="text-[10px] px-1.5 py-0">Recommended</Badge>
                  {/if}
                  {#if adminOnly}
                    <Badge variant="outline" class="text-[10px] px-1.5 py-0 gap-1">
                      <ShieldAlert class="size-3" />
                      Admin
                    </Badge>
                  {/if}
                  {#if t.requiresRestart}
                    <Badge variant="outline" class="text-[10px] px-1.5 py-0 gap-1">
                      <RefreshCcw class="size-3" />
                      {restartLabel[t.requiresRestart] ?? t.requiresRestart}
                    </Badge>
                  {/if}
                  <span class="text-[10px] uppercase tracking-wider text-muted-foreground/70 ml-auto">
                    {categoryLabel[t.category] ?? t.category}
                  </span>
                </div>
                <p class="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {t.description}
                </p>
              </div>
            </header>

            {#if t.warning}
              <div class="mx-4 mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex gap-2">
                <AlertTriangle class="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p class="text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
                  {t.warning}
                </p>
              </div>
            {/if}

            <div class="px-4 pb-3.5 space-y-1.5">
              {#each ops as op, i (i)}
                {#if op.kind === "reg"}
                  {@const r = op as RegOp}
                  {@const sp = shortPath(r.path)}
                  <div
                    class="rounded-lg border border-hairline-strong bg-background/60 px-3 py-2"
                  >
                    <div class="flex items-center gap-2 text-[11px] font-mono">
                      <KeyRound class="size-3 text-muted-foreground shrink-0" />
                      <span class="text-muted-foreground">{r.hive}</span>
                      <span class="text-muted-foreground/40">\</span>
                      {#if sp.head}
                        <span class="text-muted-foreground/60 truncate">{sp.head}</span>
                      {/if}
                      <span class="text-foreground/80">{sp.tail}</span>
                      <span class="text-muted-foreground/40">\</span>
                      <span class="text-foreground font-semibold">{r.name}</span>
                    </div>
                    <div class="mt-1.5 flex items-center gap-2 text-[11px]">
                      <Badge variant="outline" class="text-[10px] px-1.5 py-0 font-mono">
                        REG_{r.type}
                      </Badge>
                      {#if r.defaultValue !== undefined}
                        <span class="font-mono text-muted-foreground line-through decoration-foreground/30">
                          {fmtRegValue(r.defaultValue, r.type)}
                        </span>
                        <span class="text-muted-foreground/60">→</span>
                      {/if}
                      <span class="font-mono text-foreground font-semibold">
                        {fmtRegValue(r.value, r.type)}
                      </span>
                      {#if r.deleteOnRevert}
                        <span class="text-[10px] text-muted-foreground/70 ml-auto">
                          (removed on revert)
                        </span>
                      {/if}
                    </div>
                  </div>
                {:else}
                  {@const s = op as ShellOp}
                  <div
                    class="rounded-lg border border-hairline-strong bg-background/60 px-3 py-2"
                  >
                    <div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      <FileCode2 class="size-3" />
                      PowerShell
                      {#if s.elevated}
                        <Badge variant="outline" class="text-[10px] px-1.5 py-0 gap-1">
                          <ShieldAlert class="size-3" />
                          Elevated
                        </Badge>
                      {/if}
                    </div>
                    <pre class="text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all text-foreground/85">{s.script}</pre>
                  </div>
                {/if}
              {/each}
            </div>
          </article>
        {/each}
      </div>

      <footer
        class="flex items-center justify-end gap-2 px-6 py-4 border-t border-hairline-strong bg-surface-chrome"
      >
        {#if footer}
          {@render footer()}
        {:else}
          <Button variant="outline" onclick={() => (open = false)} disabled={busy}>
            Cancel
          </Button>
          {#if onConfirm}
            <Button onclick={() => onConfirm?.()} disabled={busy || tweaks.length === 0}>
              {#if busy}
                <Loader2 class="animate-spin" />
                Working…
              {:else if mode === "revert"}
                <RotateCcw />
                {confirmLabel ?? `Revert ${tweaks.length}`}
              {:else}
                <Wand2 />
                {confirmLabel ?? `Apply ${tweaks.length}`}
              {/if}
            </Button>
          {/if}
        {/if}
      </footer>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
