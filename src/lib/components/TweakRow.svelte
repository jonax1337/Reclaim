<script lang="ts">
  import { Switch, Checkbox, Badge, toast } from "$lib/ui";
  import { Sparkles, RotateCcw, AlertTriangle, Loader2 } from "@lucide/svelte";
  import type { Tweak } from "$lib/tweaks/catalog";
  import { applyTweak, revertTweak, type TweakState } from "$lib/tweaks/executor";
  import { restartExplorer } from "$lib/tweaks/bridge";
  import { cn } from "$lib/utils";

  type Props = {
    tweak: Tweak;
    state: TweakState;
    selected?: boolean;
    onChange?: (newState: TweakState) => void;
    onSelectChange?: (selected: boolean) => void;
  };
  let {
    tweak,
    state: tweakState,
    selected = false,
    onChange,
    onSelectChange,
  }: Props = $props();

  let busy = $state(false);
  let localOn = $state(false);

  $effect(() => {
    localOn = tweakState === "on";
  });

  async function toggle(next: boolean) {
    if (busy) return;
    const prev = localOn;
    localOn = next;
    busy = true;
    try {
      if (next) {
        await applyTweak(tweak);
        toast.success(`${tweak.title} enabled`);
      } else {
        await revertTweak(tweak);
        toast.success(`${tweak.title} reverted`);
      }
      onChange?.(next ? "on" : "off");
      if (tweak.requiresRestart === "explorer") {
        toast.action(
          "Restart Explorer?",
          {
            label: "Restart now",
            onClick: async () => {
              await restartExplorer();
              toast.success("Explorer restarted");
            },
          },
          { description: "Change becomes visible after restarting Explorer." },
        );
      } else if (tweak.requiresRestart === "logon") {
        toast.warning(
          "Sign out required",
          "Sign out and back in for the change to take effect.",
        );
      } else if (tweak.requiresRestart === "system") {
        toast.warning("Reboot required", "Restart your PC for the change to take effect.");
      }
    } catch (e) {
      toast.error("Failed", String(e));
      localOn = prev;
    } finally {
      busy = false;
    }
  }

  function onRowClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    // Ignore clicks on interactive controls (switch + checkbox handle their own state).
    if (t.closest("[data-no-select]")) return;
    onSelectChange?.(!selected);
  }
</script>

<div
  role="button"
  tabindex="0"
  onclick={onRowClick}
  onkeydown={(e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onSelectChange?.(!selected);
    }
  }}
  class={cn(
    "relative flex items-start gap-3 py-4 px-5 border-b last:border-b-0 transition-colors cursor-pointer select-none outline-none",
    selected
      ? "bg-primary/[0.08] hover:bg-primary/[0.10]"
      : localOn
        ? "bg-primary/[0.03] hover:bg-primary/[0.06]"
        : "hover:bg-accent/40",
    "focus-visible:bg-accent/60",
  )}
>
  <span
    class={cn(
      "absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-all duration-300",
      selected ? "bg-primary opacity-100" : localOn ? "bg-primary/60 opacity-100" : "opacity-0",
    )}
    aria-hidden="true"
  ></span>

  <div class="pt-0.5 shrink-0" data-no-select>
    <Checkbox
      checked={selected}
      onCheckedChange={(v) => onSelectChange?.(v === true)}
    />
  </div>

  <div class="flex-1 min-w-0">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-sm font-medium">{tweak.title}</span>
      {#if tweak.recommended}
        <Badge variant="success">
          <Sparkles class="size-2.5" />
          Recommended
        </Badge>
      {/if}
      {#if tweak.requiresRestart}
        <Badge variant="warning">
          <RotateCcw class="size-2.5" />
          {tweak.requiresRestart === "explorer"
            ? "Explorer"
            : tweak.requiresRestart === "logon"
              ? "Sign out"
              : "Reboot"}
        </Badge>
      {/if}
      {#if tweak.warning}
        <Badge variant="warning">
          <AlertTriangle class="size-2.5" />
          Caution
        </Badge>
      {/if}
    </div>
    <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
      {tweak.description}
      {#if tweak.warning}
        <span class="block text-amber-700 dark:text-amber-400 mt-1">{tweak.warning}</span>
      {/if}
    </p>
  </div>

  <div class="flex items-center gap-2 shrink-0 pt-0.5" data-no-select>
    {#if busy}
      <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
    {/if}
    <Switch checked={localOn} onCheckedChange={toggle} disabled={busy} />
  </div>
</div>
