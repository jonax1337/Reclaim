<script lang="ts">
  import { Select as SelectPrimitive, type WithoutChild } from "bits-ui";
  import { cn } from "$lib/utils";

  type Props = WithoutChild<SelectPrimitive.GroupHeadingProps> & {
    class?: string;
  };

  let {
    ref = $bindable(null),
    class: klass,
    children,
    ...rest
  }: Props = $props();
</script>

<SelectPrimitive.GroupHeading
  bind:ref
  class={cn(
    "px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70",
    klass,
  )}
  {...rest}
>
  {@render children?.()}
</SelectPrimitive.GroupHeading>
