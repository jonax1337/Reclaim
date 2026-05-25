<script lang="ts" generics="T extends string">
  import type { Component } from "svelte";
  import { cn } from "$lib/utils";

  type Option = { value: T; label: string; icon?: Component };
  type Props = {
    options: Option[];
    value: T;
    onChange: (v: T) => void;
    class?: string;
  };

  let { options, value, onChange, class: klass }: Props = $props();
</script>

<div class={cn("flex gap-2", klass)}>
  {#each options as opt (opt.value)}
    {@const Icon = opt.icon}
    {@const active = value === opt.value}
    <button
      type="button"
      onclick={() => onChange(opt.value)}
      class={cn(
        "flex-1 flex flex-col items-center gap-2 py-4 rounded-lg border transition-all",
        active ? "border-primary bg-primary/5" : "border-input hover:bg-accent/40",
      )}
    >
      {#if Icon}
        <Icon class={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
      {/if}
      <span class="text-sm font-medium">{opt.label}</span>
    </button>
  {/each}
</div>
