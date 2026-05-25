<script lang="ts">
  import { Checkbox } from "$lib/ui";
  import { cn } from "$lib/utils";
  import type { RegTweaksConfig } from "../types";
  import { sequence } from "../store.svelte";
  import { ALL_TWEAKS, type Tweak } from "$lib/tweaks/catalog";

  type Props = { id: string; config: RegTweaksConfig };
  let { id, config }: Props = $props();

  // Only RegOp tweaks can be applied via autounattend (ShellOp can't be ported).
  const portable = $derived(
    ALL_TWEAKS.filter((t) => t.apply.some((op) => op.kind === "reg")),
  );

  const selected = $derived(new Set(config.tweakIds));

  const grouped = $derived(() => {
    const map = new Map<string, Tweak[]>();
    for (const t of portable) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  function toggle(tid: string) {
    const next = new Set(selected);
    if (next.has(tid)) next.delete(tid);
    else next.add(tid);
    sequence.updateStepConfig<RegTweaksConfig>(id, { tweakIds: [...next] });
  }
  function selectRecommended() {
    sequence.updateStepConfig<RegTweaksConfig>(id, {
      tweakIds: portable.filter((t) => t.recommended).map((t) => t.id),
    });
  }
  function selectAll() {
    sequence.updateStepConfig<RegTweaksConfig>(id, {
      tweakIds: portable.map((t) => t.id),
    });
  }
  function clear() {
    sequence.updateStepConfig<RegTweaksConfig>(id, { tweakIds: [] });
  }
</script>

<div class="space-y-3">
  <div class="flex items-center gap-2 flex-wrap text-xs">
    <span class="text-muted-foreground">{selected.size} / {portable.length} reg-portable tweaks selected</span>
    <span class="text-muted-foreground/40">·</span>
    <button type="button" class="text-primary hover:underline" onclick={selectRecommended}>Recommended</button>
    <button type="button" class="text-primary hover:underline" onclick={selectAll}>All portable</button>
    <button type="button" class="text-muted-foreground hover:text-foreground" onclick={clear}>Clear</button>
  </div>

  <div class="space-y-3 max-h-[500px] overflow-y-auto pr-2">
    {#each grouped() as [cat, items] (cat)}
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5">
          {cat}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {#each items as t (t.id)}
            <button type="button" onclick={() => toggle(t.id)}
              class={cn(
                "flex items-start gap-2 px-2.5 py-2 rounded-md text-left border transition-colors text-xs",
                selected.has(t.id)
                  ? "border-primary/30 bg-primary/[0.06]"
                  : "border-foreground/8 bg-foreground/[0.02] hover:bg-foreground/[0.04]"
              )}>
              <div class="pt-0.5 pointer-events-none"><Checkbox checked={selected.has(t.id)} /></div>
              <div class="min-w-0 flex-1">
                <div class="font-medium truncate">{t.title}</div>
                <div class="text-[10px] text-muted-foreground line-clamp-1">{t.description}</div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
