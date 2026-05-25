<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";

  type Props = {
    selected?: boolean;
    onclick?: () => void;
    disabled?: boolean;
    tone?: "default" | "danger";
    size?: "sm" | "md";
    class?: string;
    children?: Snippet;
  };

  let {
    selected = false,
    onclick,
    disabled = false,
    tone = "default",
    size = "md",
    class: klass,
    children,
  }: Props = $props();

  const padding = $derived(size === "sm" ? "gap-2 px-2.5 py-2 text-xs" : "gap-3 px-3 py-2.5");
  const state = $derived(
    selected
      ? tone === "danger"
        ? "border-destructive/40 bg-destructive/[0.08] hover:bg-destructive/[0.12]"
        : "border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.09]"
      : "border-hairline bg-surface-1 hover:bg-surface-3",
  );
</script>

<button
  type="button"
  {onclick}
  {disabled}
  class={cn(
    "flex items-start text-left rounded-md border transition-colors disabled:opacity-50 disabled:pointer-events-none",
    padding,
    state,
    klass,
  )}
>
  {@render children?.()}
</button>
