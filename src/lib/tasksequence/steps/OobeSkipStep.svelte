<script lang="ts">
  import { Checkbox, SelectableTile } from "$lib/ui";
  import type { OobeSkipConfig } from "../types";
  import { sequence } from "../store.svelte";

  type Props = { id: string; config: OobeSkipConfig };
  let { id, config }: Props = $props();

  const items: Array<{ key: keyof OobeSkipConfig; title: string; desc: string }> = [
    { key: "skipMsAccount", title: "Force local account", desc: "Hide online-account screens; only a local admin is created." },
    { key: "skipEula", title: "Hide EULA page", desc: "Auto-accept the EULA." },
    { key: "skipOobePrivacy", title: "Pre-answer privacy prompts to OFF", desc: "ProtectYourPC=3, minimum-telemetry defaults." },
  ];
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
  {#each items as it (it.key)}
    {@const val = config[it.key]}
    <SelectableTile
      selected={val}
      onclick={() => sequence.updateStepConfig<OobeSkipConfig>(id, { [it.key]: !val } as Partial<OobeSkipConfig>)}
    >
      <div class="pt-0.5 pointer-events-none"><Checkbox checked={val} /></div>
      <div class="min-w-0">
        <div class="text-sm font-medium">{it.title}</div>
        <div class="text-xs text-muted-foreground">{it.desc}</div>
      </div>
    </SelectableTile>
  {/each}
</div>
