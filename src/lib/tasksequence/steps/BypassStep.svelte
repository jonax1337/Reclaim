<script lang="ts">
  import { Checkbox } from "$lib/ui";
  import { cn } from "$lib/utils";
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
    <button
      type="button"
      onclick={() => sequence.updateStepConfig<BypassConfig>(id, { [it.key]: !val } as Partial<BypassConfig>)}
      class={cn(
        "flex items-start gap-3 px-3 py-2.5 rounded-md text-left border transition-colors",
        val
          ? "border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.09]"
          : "border-foreground/8 bg-foreground/[0.02] hover:bg-foreground/[0.04]",
      )}
    >
      <div class="pt-0.5 pointer-events-none"><Checkbox checked={val} /></div>
      <div class="min-w-0">
        <div class="text-sm font-medium">{it.title}</div>
        <div class="text-xs text-muted-foreground">{it.desc}</div>
      </div>
    </button>
  {/each}
</div>
