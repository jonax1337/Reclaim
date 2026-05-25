<script lang="ts">
  import { Checkbox } from "$lib/ui";
  import { AlertTriangle } from "@lucide/svelte";
  import { cn } from "$lib/utils";
  import type { DiskSetupConfig } from "../types";
  import { sequence } from "../store.svelte";

  type Props = { id: string; config: DiskSetupConfig };
  let { id, config }: Props = $props();

  const field = "h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring";
</script>

<div class="space-y-3">
  <div class="flex items-start gap-3 px-3 py-2.5 rounded-md border bg-red-500/10 border-red-500/30">
    <AlertTriangle class="size-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
    <div class="text-xs leading-relaxed">
      <strong>Fully automated install.</strong> Setup will wipe the entire disk you specify below, partition GPT+ESP+MSR+OS, and install Windows without asking. There is no "are you sure" prompt during install. Wrong disk number = data loss. Use only if you know which disk number the target machine boots with.
    </div>
  </div>

  <label class="flex items-center gap-3">
    <span class="text-xs font-medium text-muted-foreground w-32">Target disk number</span>
    <input type="number" min="0" max="32" class={cn(field, "w-24 font-mono")}
      value={config.diskNumber}
      oninput={(e) => sequence.updateStepConfig<DiskSetupConfig>(id, { diskNumber: parseInt((e.currentTarget as HTMLInputElement).value, 10) || 0 })} />
    <span class="text-xs text-muted-foreground">0 = first disk (usually system on single-disk laptops)</span>
  </label>

  <button type="button"
    onclick={() => sequence.updateStepConfig<DiskSetupConfig>(id, { confirmed: !config.confirmed })}
    class={cn(
      "flex items-start gap-3 px-3 py-2.5 rounded-md text-left border w-full transition-colors",
      config.confirmed
        ? "border-red-500/40 bg-red-500/[0.08]"
        : "border-foreground/8 bg-foreground/[0.02] hover:bg-foreground/[0.04]"
    )}
  >
    <div class="pt-0.5 pointer-events-none"><Checkbox checked={config.confirmed} /></div>
    <div class="min-w-0">
      <div class="text-sm font-medium">I understand: Disk {config.diskNumber} will be wiped without confirmation during install.</div>
      <div class="text-xs text-muted-foreground">DiskConfiguration is only emitted when this checkbox is ticked.</div>
    </div>
  </button>
</div>
