<script lang="ts">
  import { Switch as SwitchPrimitive } from "bits-ui";
  import { cn } from "$lib/utils";

  type Props = SwitchPrimitive.RootProps & { class?: string };

  let {
    class: klass,
    checked = $bindable(false),
    ref = $bindable(null),
    disabled,
    ...rest
  }: Props = $props();
</script>

<SwitchPrimitive.Root
  bind:ref
  bind:checked
  {disabled}
  class={cn(
    "peer relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors outline-none",
    "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input/70 dark:data-[state=unchecked]:bg-input",
    "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    klass,
  )}
  {...rest}
>
  <SwitchPrimitive.Thumb
    class={cn(
      "pointer-events-none block size-[18px] rounded-full bg-background shadow-md ring-0 transition-transform",
      "data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0",
    )}
  />
</SwitchPrimitive.Root>
