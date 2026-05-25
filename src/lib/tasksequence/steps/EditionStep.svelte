<script lang="ts">
  import { Checkbox, Select } from "$lib/ui";
  import { cn } from "$lib/utils";
  import type { EditionConfig } from "../types";
  import { sequence } from "../store.svelte";
  import { listWin11Editions, isTauri, type Win11Edition } from "$lib/tweaks/bridge";

  type Props = { id: string; config: EditionConfig };
  let { id, config }: Props = $props();

  let editions = $state<Win11Edition[]>([]);
  $effect(() => {
    if (!isTauri()) return;
    listWin11Editions().then((e) => (editions = e)).catch(() => {});
  });

  const selectedEdition = $derived(editions.find((e) => e.key === config.selectedKey));

  const fieldClass = "h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring";
  const labelClass = "flex flex-col gap-1.5";
  const labelTextClass = "text-xs font-medium text-muted-foreground";
</script>

<div class="space-y-4">
  <p class="text-xs text-muted-foreground">
    Microsoft-published KMS client setup keys tell Setup which SKU to install. These are
    <strong>edition-selection</strong> keys, not activation keys — activate separately after install.
  </p>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
    <label class={labelClass}>
      <span class={labelTextClass}>Edition</span>
      <Select.Root
        type="single"
        value={config.selectedKey}
        disabled={config.useCustomKey}
        onValueChange={(v) => {
          const ed = editions.find((x) => x.key === v);
          sequence.updateStepConfig<EditionConfig>(id, { selectedKey: v, editionName: ed?.label ?? null });
        }}
      >
        <Select.Trigger>
          <span>{selectedEdition?.label ?? "Pick an edition"}</span>
        </Select.Trigger>
        <Select.Content>
          {#each editions as e (e.key)}
            <Select.Item value={e.key} label={e.label}>{e.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </label>
    <label class="flex items-center gap-2 cursor-pointer select-none h-9">
      <Checkbox checked={config.useCustomKey}
        onCheckedChange={(v) => sequence.updateStepConfig<EditionConfig>(id, { useCustomKey: !!v })} />
      <span class="text-sm">Use my own product key</span>
    </label>
  </div>
  {#if config.useCustomKey}
    <label class={labelClass}>
      <span class={labelTextClass}>Product key</span>
      <input type="text" class={cn(fieldClass, "font-mono uppercase tracking-wider")}
        placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
        value={config.customKey}
        oninput={(e) => sequence.updateStepConfig<EditionConfig>(id, { customKey: (e.currentTarget as HTMLInputElement).value })} />
    </label>
  {/if}
</div>
