<script lang="ts">
  import { Select as SelectPrimitive, type WithoutChild } from "bits-ui";
  import { Check } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  type Props = WithoutChild<SelectPrimitive.ItemProps> & {
    class?: string;
  };

  let {
    ref = $bindable(null),
    class: klass,
    value,
    label,
    children,
    ...rest
  }: Props = $props();
</script>

<SelectPrimitive.Item
  bind:ref
  {value}
  {label}
  class={cn(
    "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none",
    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    klass,
  )}
  {...rest}
>
  {#snippet children({ selected, highlighted })}
    <span class="absolute right-2 flex size-3.5 items-center justify-center">
      {#if selected}
        <Check class="size-3.5 text-primary" />
      {/if}
    </span>
    {#if children}{@render children?.({ selected, highlighted })}{:else}{label}{/if}
  {/snippet}
</SelectPrimitive.Item>
