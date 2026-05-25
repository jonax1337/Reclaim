<script lang="ts">
  import { ShieldAlert, ArrowRight } from "@lucide/svelte";
  import { admin } from "$lib/admin.svelte";
  import { isTauri } from "$lib/tweaks/bridge";
  import { toast } from "$lib/ui";
  import { cn } from "$lib/utils";

  type Props = {
    title?: string;
    description?: string;
    hint?: string;
    size?: "sm" | "md";
    class?: string;
    declinedToast?: string;
    requireAutoCheck?: boolean;
  };

  let {
    title = "Administrator rights needed",
    description,
    hint,
    size = "md",
    class: klass,
    declinedToast = "Continuing in restricted mode.",
    requireAutoCheck = true,
  }: Props = $props();

  async function onClick() {
    const ok = await admin.relaunchElevated();
    if (!ok) toast.error("UAC declined", declinedToast);
  }

  const show = $derived(
    !requireAutoCheck || (isTauri() && admin.checked && !admin.elevated),
  );
</script>

{#if show}
  {#if size === "sm"}
    <button
      type="button"
      onclick={onClick}
      disabled={admin.requesting}
      aria-label="Relaunch with administrator rights"
      class={cn(
        "w-full mb-4 text-left rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200 px-4 py-3 flex items-center gap-3 disabled:opacity-60 group",
        klass,
      )}
    >
      <ShieldAlert class="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <div class="flex-1 text-xs">
        <span class="font-semibold text-amber-900 dark:text-amber-200">{title}</span>
        {#if hint}
          <span class="text-amber-800/80 dark:text-amber-200/80">{hint}</span>
        {/if}
      </div>
      <ArrowRight
        class="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 transition-transform group-hover:translate-x-0.5"
      />
    </button>
  {:else}
    <button
      type="button"
      onclick={onClick}
      disabled={admin.requesting}
      aria-label="Relaunch with administrator rights"
      class={cn(
        "w-full text-left rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 p-4 flex items-start gap-3 disabled:opacity-60 group mb-6",
        klass,
      )}
    >
      <ShieldAlert class="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div class="flex-1">
        <h3 class="text-sm font-semibold text-amber-900 dark:text-amber-200">{title}</h3>
        {#if description}
          <p class="text-xs text-amber-800/80 dark:text-amber-200/80 mt-1">{description}</p>
        {/if}
      </div>
      <ArrowRight
        class="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-1 transition-transform group-hover:translate-x-0.5"
      />
    </button>
  {/if}
{/if}
