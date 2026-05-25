<script lang="ts">
  import { Checkbox } from "$lib/ui";
  import { cn } from "$lib/utils";
  import type { AppsInstallConfig } from "../types";
  import { sequence } from "../store.svelte";
  import { UNIQUE_APPS, GROUP_LABELS, GROUP_ORDER, type AppEntry } from "$lib/apps/catalog";

  type Props = { id: string; config: AppsInstallConfig };
  let { id, config }: Props = $props();

  const selected = $derived(new Set(config.wingetIds));

  const grouped = $derived(() => {
    const map = new Map<string, AppEntry[]>();
    for (const a of UNIQUE_APPS) {
      const arr = map.get(a.group) ?? [];
      arr.push(a);
      map.set(a.group, arr);
    }
    return GROUP_ORDER
      .map((g) => [g, map.get(g) ?? []] as const)
      .filter(([, arr]) => arr.length > 0);
  });

  function toggle(wid: string) {
    const next = new Set(selected);
    if (next.has(wid)) next.delete(wid);
    else next.add(wid);
    sequence.updateStepConfig<AppsInstallConfig>(id, { wingetIds: [...next] });
  }
  function clear() {
    sequence.updateStepConfig<AppsInstallConfig>(id, { wingetIds: [] });
  }
</script>

<div class="space-y-3">
  <p class="text-xs text-muted-foreground">
    Installed silently via <code class="font-mono">winget install</code> in setupcomplete.cmd, after OOBE
    completes and the network is up. Apps install in the new user's context but as SYSTEM.
  </p>
  <div class="flex items-center gap-2 flex-wrap text-xs">
    <span class="text-muted-foreground">{selected.size} apps selected</span>
    <span class="text-muted-foreground/40">·</span>
    <button type="button" class="text-muted-foreground hover:text-foreground" onclick={clear}>Clear</button>
  </div>

  <div class="space-y-3 max-h-[500px] overflow-y-auto pr-2">
    {#each grouped() as [g, apps] (g)}
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5">
          {GROUP_LABELS[g as keyof typeof GROUP_LABELS]}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {#each apps as a (a.id)}
            <button type="button" onclick={() => toggle(a.id)}
              class={cn(
                "flex items-start gap-2 px-2.5 py-2 rounded-md text-left border transition-colors text-xs",
                selected.has(a.id)
                  ? "border-primary/30 bg-primary/[0.06]"
                  : "border-foreground/8 bg-foreground/[0.02] hover:bg-foreground/[0.04]"
              )}>
              <div class="pt-0.5 pointer-events-none"><Checkbox checked={selected.has(a.id)} /></div>
              <div class="min-w-0 flex-1">
                <div class="font-medium truncate">{a.name}</div>
                <div class="font-mono text-[10px] text-muted-foreground truncate">{a.id}</div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
