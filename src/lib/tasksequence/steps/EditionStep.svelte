<script lang="ts">
  import { Checkbox, Select, FormField, TextInput } from "$lib/ui";
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
</script>

<div class="space-y-4">
  <p class="text-xs text-muted-foreground">
    Microsoft-published KMS client setup keys tell Setup which SKU to install. These are
    <strong>edition-selection</strong> keys, not activation keys — activate separately after install.
  </p>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
    <FormField label="Edition">
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
    </FormField>
    <label class="flex items-center gap-2 cursor-pointer select-none h-9">
      <Checkbox checked={config.useCustomKey}
        onCheckedChange={(v) => sequence.updateStepConfig<EditionConfig>(id, { useCustomKey: !!v })} />
      <span class="text-sm">Use my own product key</span>
    </label>
  </div>
  {#if config.useCustomKey}
    <FormField label="Product key">
      <TextInput
        mono
        class="uppercase tracking-wider"
        placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
        value={config.customKey}
        oninput={(e) => sequence.updateStepConfig<EditionConfig>(id, { customKey: (e.currentTarget as HTMLInputElement).value })}
      />
    </FormField>
  {/if}
</div>
