<script lang="ts">
  import { Select } from "$lib/ui";
  import { cn } from "$lib/utils";
  import type { CustomCmdConfig, Hook } from "../types";
  import { HOOK_LABELS } from "../types";
  import { sequence } from "../store.svelte";

  type Props = { id: string; config: CustomCmdConfig };
  let { id, config }: Props = $props();

  const fieldClass = "h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring";
  const textareaClass = "rounded-md border border-input bg-card px-3 py-2 text-sm font-mono outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring";
  const labelClass = "flex flex-col gap-1.5";
  const labelTextClass = "text-xs font-medium text-muted-foreground";

  const HOOKS: Hook[] = ["windowsPE", "specialize", "oobeSystem", "setupcomplete", "firstlogon"];
</script>

<div class="space-y-3">
  <label class={labelClass}>
    <span class={labelTextClass}>Description (shown in setup logs)</span>
    <input type="text" class={fieldClass}
      value={config.description}
      placeholder="e.g. Install custom certificate"
      oninput={(e) => sequence.updateStepConfig<CustomCmdConfig>(id, { description: (e.currentTarget as HTMLInputElement).value })} />
  </label>

  <label class={labelClass}>
    <span class={labelTextClass}>Hook (when does this run?)</span>
    <Select.Root
      type="single"
      value={config.hook}
      onValueChange={(v) => sequence.updateStepConfig<CustomCmdConfig>(id, { hook: v as Hook })}
    >
      <Select.Trigger><span>{HOOK_LABELS[config.hook]}</span></Select.Trigger>
      <Select.Content>
        {#each HOOKS as h (h)}
          <Select.Item value={h} label={HOOK_LABELS[h]}>{HOOK_LABELS[h]}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </label>

  <label class={labelClass}>
    <span class={labelTextClass}>Command line</span>
    <textarea rows="4" class={cn(textareaClass, "w-full text-[12px]")}
      placeholder={"cmd /c reg add HKLM\\Software\\... /v Foo /t REG_DWORD /d 1 /f\nor\npowershell -NoProfile -Command \"Set-Service -Name Bar -StartupType Disabled\""}
      value={config.command}
      oninput={(e) => sequence.updateStepConfig<CustomCmdConfig>(id, { command: (e.currentTarget as HTMLTextAreaElement).value })}
    ></textarea>
  </label>
  <p class="text-[11px] text-muted-foreground">
    Single line preferred. For PowerShell, wrap in <code class="px-1 rounded bg-foreground/10 font-mono">cmd /c powershell -NoProfile -Command "…"</code>.
    Use the right hook: <strong>specialize</strong> = SYSTEM before any user exists,
    <strong>setupcomplete</strong> = SYSTEM after OOBE, <strong>firstlogon</strong> = new user's context.
  </p>
</div>
