<script lang="ts">
  import { cn } from "$lib/utils";

  type Props = {
    active?: boolean;
    strong?: boolean;
    class?: string;
  };

  let { active = false, strong = false, class: klass }: Props = $props();
  const bg = $derived(strong ? "bg-primary" : "bg-primary/60");
</script>

<span
  class={cn(
    "absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-all",
    active ? `${bg} opacity-100` : "opacity-0",
    klass,
  )}
  aria-hidden="true"
></span>
