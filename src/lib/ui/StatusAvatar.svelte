<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import { cn } from "$lib/utils";

  type Props = {
    tone?: "neutral" | "muted" | "success" | "warning" | "primary";
    icon?: Component;
    class?: string;
    children?: Snippet;
  };

  let { tone = "neutral", icon: Icon, class: klass, children }: Props = $props();

  const base = "grid place-items-center size-16 rounded-2xl shadow-sm shrink-0 ring-1 ring-foreground/5";
  const tones = {
    neutral: "bg-white dark:bg-surface-4",
    muted: "bg-surface-4 text-muted-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    primary: "bg-primary/15 text-primary",
  };
  const toneCls = $derived(tones[tone]);
</script>

<div class={cn(base, toneCls, klass)}>
  {#if Icon}<Icon class="size-8" />{/if}
  {@render children?.()}
</div>
