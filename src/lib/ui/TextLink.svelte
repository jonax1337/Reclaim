<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";

  type Props = {
    onclick?: (e: MouseEvent) => void;
    size?: "xs" | "sm";
    tone?: "primary" | "muted";
    class?: string;
    children?: Snippet;
  };

  let { onclick, size = "xs", tone = "primary", class: klass, children }: Props = $props();

  const sizeCls = $derived(size === "xs" ? "text-xs" : "text-sm");
  const toneCls = $derived(
    tone === "muted"
      ? "text-muted-foreground hover:text-foreground"
      : "text-primary hover:underline",
  );
</script>

<button
  type="button"
  {onclick}
  class={cn("transition-colors", toneCls, sizeCls, klass)}
>
  {@render children?.()}
</button>
