<script lang="ts">
  import { Select as SelectPrimitive, type WithoutChildrenOrChild } from "bits-ui";
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";

  type Props = WithoutChildrenOrChild<SelectPrimitive.ContentProps> & {
    class?: string;
    portalProps?: SelectPrimitive.PortalProps;
    children?: Snippet;
  };

  let {
    ref = $bindable(null),
    class: klass,
    sideOffset = 6,
    portalProps,
    children,
    ...rest
  }: Props = $props();
</script>

<SelectPrimitive.Portal {...portalProps}>
  <SelectPrimitive.Content
    bind:ref
    {sideOffset}
    class={cn(
      "relative z-50 max-h-[min(420px,var(--bits-select-content-available-height))] min-w-[var(--bits-select-anchor-width)]",
      "overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
      "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
      klass,
    )}
    {...rest}
  >
    <SelectPrimitive.Viewport class="p-1 max-h-[400px] overflow-y-auto">
      {@render children?.()}
    </SelectPrimitive.Viewport>
  </SelectPrimitive.Content>
</SelectPrimitive.Portal>
