<script lang="ts">
  import { Checkbox } from "$lib/ui";
  import { cn } from "$lib/utils";
  import type { PrivacyConfig } from "../types";
  import { sequence } from "../store.svelte";

  type Props = { id: string; config: PrivacyConfig };
  let { id, config }: Props = $props();

  const items: Array<{ key: keyof PrivacyConfig; title: string; desc: string }> = [
    { key: "disableTelemetry", title: "Disable telemetry", desc: "AllowTelemetry=0 (Security only)." },
    { key: "disableAdvertisingId", title: "Disable advertising ID", desc: "Per-user privacy flag." },
    { key: "disableLocation", title: "Disable location tracking", desc: "Machine-wide location policy off." },
    { key: "disableTailoredExperiences", title: "Disable tailored experiences", desc: "Personalized ads/tips." },
    { key: "disableFindMyDevice", title: "Disable Find My Device", desc: "Disables location reporting for find." },
    { key: "disableInkingTyping", title: "Disable inking/typing data", desc: "Stops handwriting + typing collection." },
    { key: "disableDiagnosticData", title: "Cap diagnostic data", desc: "MaxTelemetryAllowed=1 (Basic)." },
    { key: "disableCortana", title: "Disable Cortana", desc: "AllowCortana=0." },
  ];
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
  {#each items as it (it.key)}
    {@const val = config[it.key]}
    <button type="button"
      onclick={() => sequence.updateStepConfig<PrivacyConfig>(id, { [it.key]: !val } as Partial<PrivacyConfig>)}
      class={cn(
        "flex items-start gap-3 px-3 py-2.5 rounded-md text-left border transition-colors",
        val ? "border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.09]"
            : "border-foreground/8 bg-foreground/[0.02] hover:bg-foreground/[0.04]"
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
