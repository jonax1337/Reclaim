<script lang="ts">
  import { Select as SelectPrimitive, type WithoutChild } from "bits-ui";
  import { ChevronDown } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  type Props = WithoutChild<SelectPrimitive.TriggerProps> & {
    class?: string;
  };

  let {
    ref = $bindable(null),
    class: klass,
    children,
    ...rest
  }: Props = $props();
</script>

<SelectPrimitive.Trigger
  bind:ref
  class={cn(
    "flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm",
    "ring-offset-background placeholder:text-muted-foreground transition-colors",
    "data-[placeholder]:text-muted-foreground",
    "focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring",
    "hover:border-foreground/20",
    "data-[state=open]:border-ring data-[state=open]:ring-ring/50 data-[state=open]:ring-[3px]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "[&>span]:line-clamp-1 [&>span]:text-left [&>span]:flex-1 [&>span]:truncate",
    klass,
  )}
  {...rest}
>
  {@render children?.()}
  <ChevronDown class="size-4 opacity-60 shrink-0 ml-2" />
</SelectPrimitive.Trigger>
