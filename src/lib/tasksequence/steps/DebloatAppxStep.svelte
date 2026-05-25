<script lang="ts">
  import { Checkbox, Badge } from "$lib/ui";
  import { cn } from "$lib/utils";
  import type { DebloatAppxConfig } from "../types";
  import { sequence } from "../store.svelte";
  import { BLOATWARE, GROUP_LABELS, type BloatwareEntry } from "$lib/tweaks/bloatware";

  type Props = { id: string; config: DebloatAppxConfig };
  let { id, config }: Props = $props();

  const selected = $derived(new Set(config.patterns));
  const groups = $derived(() => {
    const map = new Map<string, BloatwareEntry[]>();
    for (const b of BLOATWARE) {
      const arr = map.get(b.group) ?? [];
      arr.push(b);
      map.set(b.group, arr);
    }
    return map;
  });

  function toggle(pattern: string) {
    const next = new Set(selected);
    if (next.has(pattern)) next.delete(pattern);
    else next.add(pattern);
    sequence.updateStepConfig<DebloatAppxConfig>(id, { patterns: [...next] });
  }

  function selectAll() {
    sequence.updateStepConfig<DebloatAppxConfig>(id, {
      patterns: BLOATWARE.map((b) => b.pattern),
    });
  }
  function selectRecommended() {
    sequence.updateStepConfig<DebloatAppxConfig>(id, {
      patterns: BLOATWARE.filter((b) => b.recommended).map((b) => b.pattern),
    });
  }
  function clear() {
    sequence.updateStepConfig<DebloatAppxConfig>(id, { patterns: [] });
  }
</script>

<div class="space-y-3">
  <div class="flex items-center gap-2 flex-wrap text-xs">
    <span class="text-muted-foreground">{selected.size} / {BLOATWARE.length} selected</span>
    <span class="text-muted-foreground/40">·</span>
    <button type="button" class="text-primary hover:underline" onclick={selectRecommended}>Recommended</button>
    <button type="button" class="text-primary hover:underline" onclick={selectAll}>All</button>
    <button type="button" class="text-muted-foreground hover:text-foreground" onclick={clear}>Clear</button>
  </div>

  <div class="space-y-3 max-h-[500px] overflow-y-auto pr-2">
    {#each [...groups()] as [group, entries] (group)}
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5">
          {GROUP_LABELS[group as keyof typeof GROUP_LABELS]}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {#each entries as b (b.pattern)}
            <button type="button" onclick={() => toggle(b.pattern)}
              class={cn(
                "flex items-start gap-2 px-2.5 py-2 rounded-md text-left border transition-colors text-xs",
                selected.has(b.pattern)
                  ? "border-primary/30 bg-primary/[0.06]"
                  : "border-foreground/8 bg-foreground/[0.02] hover:bg-foreground/[0.04]"
              )}>
              <div class="pt-0.5 pointer-events-none"><Checkbox checked={selected.has(b.pattern)} /></div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-medium truncate">{b.title}</span>
                  {#if b.warning}<Badge variant="outline" class="text-[9px] px-1 py-0 border-amber-500/40">⚠</Badge>{/if}
                </div>
                <div class="font-mono text-[10px] text-muted-foreground truncate">{b.pattern}</div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
