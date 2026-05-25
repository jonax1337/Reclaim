<script lang="ts">
  import type { Snippet } from "svelte";
  import { X, CheckSquare } from "@lucide/svelte";
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  type Props = {
    count: number;
    label?: string;
    onClear?: () => void;
    children?: Snippet;
  };
  let { count, label = "selected", onClear, children }: Props = $props();
</script>

{#if count > 0}
  <div
    class="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-2xl border border-hairline-strong bg-card/85 backdrop-blur-xl pl-4 pr-2 py-2 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.35)]"
    in:fly={{ y: 24, duration: 240, easing: cubicOut }}
    out:fly={{ y: 24, duration: 180, easing: cubicOut }}
  >
    <CheckSquare class="size-4 text-primary" />
    <span class="text-sm font-medium tabular-nums whitespace-nowrap">
      <span class="text-foreground">{count}</span>
      <span class="text-muted-foreground">{label}</span>
    </span>
    <span class="h-5 w-px bg-border mx-1"></span>
    <div class="flex items-center gap-1.5">
      {@render children?.()}
    </div>
    {#if onClear}
      <button
        type="button"
        onclick={onClear}
        aria-label="Clear selection"
        class="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <X class="size-4" />
      </button>
    {/if}
  </div>
{/if}
