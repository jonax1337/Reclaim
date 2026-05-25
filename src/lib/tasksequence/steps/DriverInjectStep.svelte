<script lang="ts">
  import { Button, TextInput } from "$lib/ui";
  import { FolderOpen, Cpu } from "@lucide/svelte";
  import type { DriverInjectConfig } from "../types";
  import { sequence } from "../store.svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";

  type Props = { id: string; config: DriverInjectConfig };
  let { id, config }: Props = $props();

  async function pickFolder() {
    try {
      const picked = await openDialog({ directory: true, multiple: false });
      if (typeof picked === "string") {
        sequence.updateStepConfig<DriverInjectConfig>(id, { folderPath: picked });
      }
    } catch {}
  }
</script>

<div class="space-y-3">
  <p class="text-xs text-muted-foreground flex items-start gap-2">
    <Cpu class="size-3.5 mt-0.5 shrink-0" />
    <span>Folder must contain <code class="font-mono">.inf</code> / <code class="font-mono">.sys</code> / <code class="font-mono">.cat</code> driver packages. They land in <code class="font-mono">\$OEM$\$1\Drivers</code> on the install medium; Setup scans + installs all matching ones automatically.</span>
  </p>

  <div class="flex items-stretch gap-2">
    <TextInput readonly mono value={config.folderPath} placeholder="Pick a folder…" class="flex-1 text-[12px]" />
    <Button variant="outline" onclick={pickFolder}>
      <FolderOpen class="size-4" />
      Browse
    </Button>
  </div>
</div>
