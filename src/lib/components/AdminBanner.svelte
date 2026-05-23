<script lang="ts">
  import { ShieldAlert, ArrowRight } from "@lucide/svelte";
  import { admin } from "$lib/admin.svelte";
  import { isTauri } from "$lib/tweaks/bridge";
  import { toast } from "$lib/ui";

  type Props = {
    title?: string;
    description: string;
    declinedToast?: string;
  };

  let {
    title = "Administrator rights needed",
    description,
    declinedToast = "Continuing in restricted mode.",
  }: Props = $props();

  async function onClick() {
    const ok = await admin.relaunchElevated();
    if (!ok) toast.error("UAC declined", declinedToast);
  }
</script>

{#if isTauri() && admin.checked && !admin.elevated}
  <button
    type="button"
    onclick={onClick}
    disabled={admin.requesting}
    aria-label="Relaunch with administrator rights"
    class="w-full text-left rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 p-4 flex items-start gap-3 disabled:opacity-60 group mb-6"
  >
    <ShieldAlert class="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
    <div class="flex-1">
      <h3 class="text-sm font-semibold text-amber-900 dark:text-amber-200">{title}</h3>
      <p class="text-xs text-amber-800/80 dark:text-amber-200/80 mt-1">{description}</p>
    </div>
    <ArrowRight
      class="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-1 transition-transform group-hover:translate-x-0.5"
    />
  </button>
{/if}
