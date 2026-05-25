<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import Checkbox from "./Checkbox.svelte";
  import { cn } from "$lib/utils";

  type Props = {
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
    disabled?: boolean;
    icon?: Component;
    label?: string;
    class?: string;
    children?: Snippet;
  };

  let {
    checked = $bindable(false),
    onCheckedChange,
    disabled = false,
    icon: Icon,
    label,
    class: klass,
    children,
  }: Props = $props();
</script>

<label
  class={cn(
    "flex items-start gap-3 p-3 rounded-lg border border-hairline-strong hover:bg-accent/30 transition-colors cursor-pointer",
    disabled && "opacity-60 cursor-not-allowed",
    klass,
  )}
>
  <div class="pt-0.5">
    <Checkbox bind:checked {onCheckedChange} {disabled} />
  </div>
  {#if Icon}
    <Icon class="size-4 text-muted-foreground mt-0.5 shrink-0" />
  {/if}
  <div class="flex-1 min-w-0">
    {#if label}<span class="text-sm font-medium">{label}</span>{/if}
    {@render children?.()}
  </div>
</label>
