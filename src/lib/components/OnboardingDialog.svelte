<script lang="ts">
  import { onMount } from "svelte";
  import { Dialog, Button, Checkbox, toast } from "$lib/ui";
  import { Wand2, History, Sparkles, ShieldCheck, Loader2 } from "@lucide/svelte";
  import { isTauri, createRestorePoint } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { prefs } from "$lib/prefs.svelte";
  import { PROFILES, resolveProfileTweaks } from "$lib/tweaks/profiles";
  import { applyTweak, getTweakState } from "$lib/tweaks/executor";
  import { log } from "$lib/log.svelte";

  let open = $state(false);
  let busy = $state(false);
  let createSnapshot = $state(true);
  let applyBasics = $state(true);

  onMount(async () => {
    await prefs.ready;
    if (!prefs.onboarded && isTauri()) {
      open = true;
    }
  });

  async function dismiss(action: "completed" | "skipped") {
    prefs.setOnboarded(true);
    open = false;
    if (action === "completed") {
      toast.success("Welcome to Reclaim", "You can revisit choices any time from Profiles.");
    }
  }

  async function runSetup() {
    if (busy) return;
    busy = true;
    try {
      if (createSnapshot) {
        try {
          const r = await createRestorePoint("Reclaim — first run");
          if (r.success) {
            log.success("system.restore_point", "First run", "Restore point created");
          } else {
            log.warn("system.restore_point", "First run", "Restore point skipped", r.stderr);
          }
        } catch (e) {
          log.warn("system.restore_point", "First run", "Restore point failed", String(e));
        }
      }

      if (applyBasics) {
        const basics = PROFILES.find((p) => p.id === "reclaim-basics");
        if (basics) {
          const tweaks = resolveProfileTweaks(basics);
          let ok = 0;
          let fail = 0;
          for (const t of tweaks) {
            try {
              const s = await getTweakState(t);
              if (s === "on") continue;
              await applyTweak(t);
              ok++;
            } catch {
              fail++;
            }
          }
          log.success("tweak.apply", basics.name, `First run applied ${ok} tweak${ok === 1 ? "" : "s"}${fail > 0 ? `, ${fail} failed` : ""}`);
        }
      }
      await dismiss("completed");
    } finally {
      busy = false;
    }
  }
</script>

<Dialog
  bind:open
  title="Welcome to Reclaim"
  description="A quick optional setup. Skip if you'd rather poke around first — both options can be done later from Settings and Profiles."
  class="max-w-xl"
>
  <div class="space-y-3 py-1">
    {#if admin.checked && !admin.elevated}
      <div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
        <ShieldCheck class="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p class="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
          Some tweaks need administrator rights. You can elevate any time via the Elevate button in
          the title bar — restricted-mode tweaks are skipped silently.
        </p>
      </div>
    {/if}

    <label class="flex items-start gap-3 p-3 rounded-lg border border-foreground/10 hover:bg-accent/30 transition-colors cursor-pointer">
      <div class="pt-0.5">
        <Checkbox bind:checked={createSnapshot} disabled={busy} />
      </div>
      <History class="size-4 text-muted-foreground mt-0.5 shrink-0" />
      <div class="flex-1 min-w-0">
        <span class="text-sm font-medium">Create a system restore point</span>
        <p class="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          A safety net so you can roll back if anything misbehaves. Needs administrator rights and
          System Protection enabled — skipped silently otherwise.
        </p>
      </div>
    </label>

    <label class="flex items-start gap-3 p-3 rounded-lg border border-foreground/10 hover:bg-accent/30 transition-colors cursor-pointer">
      <div class="pt-0.5">
        <Checkbox bind:checked={applyBasics} disabled={busy} />
      </div>
      <Sparkles class="size-4 text-muted-foreground mt-0.5 shrink-0" />
      <div class="flex-1 min-w-0">
        <span class="text-sm font-medium">Apply the Reclaim Basics profile</span>
        <p class="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          A conservative set of recommended tweaks (telemetry off, ads off, sane defaults).
          Every tweak is reversible.
        </p>
      </div>
    </label>
  </div>

  {#snippet footer()}
    <Button variant="outline" onclick={() => dismiss("skipped")} disabled={busy}>Skip</Button>
    <Button onclick={runSetup} disabled={busy || (!createSnapshot && !applyBasics)}>
      {#if busy}
        <Loader2 class="animate-spin" />
        Setting up…
      {:else}
        <Wand2 />
        Get started
      {/if}
    </Button>
  {/snippet}
</Dialog>
