<script lang="ts">
  import { Checkbox, Badge, SelectableTile, TextLink } from "$lib/ui";
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
    <TextLink onclick={selectRecommended}>Recommended</TextLink>
    <TextLink onclick={selectAll}>All</TextLink>
    <TextLink tone="muted" onclick={clear}>Clear</TextLink>
  </div>

  <div class="space-y-3 max-h-[500px] overflow-y-auto pr-2">
    {#each [...groups()] as [group, entries] (group)}
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5">
          {GROUP_LABELS[group as keyof typeof GROUP_LABELS]}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {#each entries as b (b.pattern)}
            <SelectableTile size="sm" selected={selected.has(b.pattern)} onclick={() => toggle(b.pattern)}>
              <div class="pt-0.5 pointer-events-none"><Checkbox checked={selected.has(b.pattern)} /></div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-medium truncate">{b.title}</span>
                  {#if b.warning}<Badge variant="outline" class="text-[9px] px-1 py-0 border-amber-500/40">⚠</Badge>{/if}
                </div>
                <div class="font-mono text-[10px] text-muted-foreground truncate">{b.pattern}</div>
              </div>
            </SelectableTile>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
