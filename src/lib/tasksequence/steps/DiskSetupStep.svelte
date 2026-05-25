<script lang="ts">
  import { Checkbox, SelectableTile, InfoBanner } from "$lib/ui";
  import { cn } from "$lib/utils";
  import type { DiskSetupConfig } from "../types";
  import { sequence } from "../store.svelte";

  type Props = { id: string; config: DiskSetupConfig };
  let { id, config }: Props = $props();

  const field = "h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring";
</script>

<div class="space-y-3">
  <InfoBanner tone="error" size="xs">
    <strong>Fully automated install.</strong> Setup will wipe the entire disk you specify below, partition GPT+ESP+MSR+OS, and install Windows without asking. There is no "are you sure" prompt during install. Wrong disk number = data loss. Use only if you know which disk number the target machine boots with.
  </InfoBanner>

  <label class="flex items-center gap-3">
    <span class="text-xs font-medium text-muted-foreground w-32">Target disk number</span>
    <input type="number" min="0" max="32" class={cn(field, "w-24 font-mono")}
      value={config.diskNumber}
      oninput={(e) => sequence.updateStepConfig<DiskSetupConfig>(id, { diskNumber: parseInt((e.currentTarget as HTMLInputElement).value, 10) || 0 })} />
    <span class="text-xs text-muted-foreground">0 = first disk (usually system on single-disk laptops)</span>
  </label>

  <SelectableTile
    selected={config.confirmed}
    tone="danger"
    class="w-full"
    onclick={() => sequence.updateStepConfig<DiskSetupConfig>(id, { confirmed: !config.confirmed })}
  >
    <div class="pt-0.5 pointer-events-none"><Checkbox checked={config.confirmed} /></div>
    <div class="min-w-0">
      <div class="text-sm font-medium">I understand: Disk {config.diskNumber} will be wiped without confirmation during install.</div>
      <div class="text-xs text-muted-foreground">DiskConfiguration is only emitted when this checkbox is ticked.</div>
    </div>
  </SelectableTile>
</div>
