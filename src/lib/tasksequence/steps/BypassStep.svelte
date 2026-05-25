<script lang="ts">
  import { Checkbox, SelectableTile } from "$lib/ui";
  import type { BypassConfig } from "../types";
  import { sequence } from "../store.svelte";

  type Props = { id: string; config: BypassConfig };
  let { id, config }: Props = $props();

  const items: Array<{ key: keyof BypassConfig; title: string; desc: string }> = [
    { key: "bypassTpm", title: "TPM 2.0 check", desc: "Install on machines without a TPM 2.0 module." },
    { key: "bypassSecureBoot", title: "Secure Boot check", desc: "Install on machines without Secure Boot." },
    { key: "bypassRam", title: "RAM check", desc: "Install on machines with <4 GB RAM." },
    { key: "bypassStorage", title: "Storage check", desc: "Skip the 64 GB minimum-disk requirement." },
    { key: "bypassCpu", title: "CPU check", desc: "Install on unsupported CPUs." },
    { key: "bypassNro", title: "BypassNRO (skip network requirement)", desc: "Skip the 'must connect to internet' OOBE wall." },
  ];
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
  {#each items as it (it.key)}
    {@const val = config[it.key]}
    <SelectableTile
      selected={val}
      onclick={() => sequence.updateStepConfig<BypassConfig>(id, { [it.key]: !val } as Partial<BypassConfig>)}
    >
      <div class="pt-0.5 pointer-events-none"><Checkbox checked={val} /></div>
      <div class="min-w-0">
        <div class="text-sm font-medium">{it.title}</div>
        <div class="text-xs text-muted-foreground">{it.desc}</div>
      </div>
    </SelectableTile>
  {/each}
</div>
