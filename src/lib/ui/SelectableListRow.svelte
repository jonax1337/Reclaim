<script lang="ts">
  import type { Snippet } from "svelte";
  import RowAccent from "./RowAccent.svelte";
  import { cn } from "$lib/utils";

  type Props = {
    selected?: boolean;
    disabled?: boolean;
    density?: "sm" | "md";
    class?: string;
    children?: Snippet;
  };

  let {
    selected = false,
    disabled = false,
    density = "sm",
    class: klass,
    children,
  }: Props = $props();

  const py = $derived(density === "md" ? "py-4" : "py-3");
</script>

<label
  class={cn(
    "relative flex items-start gap-3 px-5 border-b last:border-b-0 transition-colors select-none",
    py,
    disabled
      ? "opacity-60 hover:opacity-80"
      : selected
        ? "bg-primary/[0.06] hover:bg-primary/[0.09] cursor-pointer"
        : "hover:bg-accent/30 cursor-pointer",
    klass,
  )}
>
  <RowAccent active={selected} strong />
  {@render children?.()}
</label>
