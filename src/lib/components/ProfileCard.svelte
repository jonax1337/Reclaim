<script lang="ts">
  import { Card, CardContent, Button, toast } from "$lib/ui";
  import { ChevronRight } from "@lucide/svelte";
  import type { Profile } from "$lib/tweaks/profiles";
  import { resolveProfileTweaks, profileAppliedStats } from "$lib/tweaks/profiles";
  import { applyTweak, getTweakState, type TweakState } from "$lib/tweaks/executor";
  import { tweakStatesResource, K_TWEAK_STATES } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";
  import ProfileIcon from "./ProfileIcon.svelte";
  import TweakPreviewDialog from "./TweakPreviewDialog.svelte";

  type Props = { profile: Profile; onApplied?: () => void };
  let { profile, onApplied }: Props = $props();

  let open = $state(false);
  let busy = $state(false);

  const tweaks = $derived(resolveProfileTweaks(profile));
  const statesRes = tweakStatesResource();
  const states = $derived<Record<string, TweakState>>(statesRes.data ?? {});
  const stats = $derived(profileAppliedStats(profile, states));

  async function applyAll() {
    if (busy) return;
    busy = true;
    let ok = 0;
    let skipped = 0;
    let fail = 0;
    for (const t of tweaks) {
      try {
        const s = await getTweakState(t);
        if (s === "on") {
          skipped++;
          continue;
        }
        await applyTweak(t);
        ok++;
      } catch {
        fail++;
      }
    }
    busy = false;
    open = false;
    invalidate(K_TWEAK_STATES);
    await statesRes.refresh();
    if (fail === 0) {
      toast.success(
        `${profile.name} applied`,
        `${ok} tweak${ok === 1 ? "" : "s"} enabled${skipped > 0 ? `, ${skipped} already on` : ""}.`,
      );
    } else {
      toast.warning(
        `${profile.name} partially applied`,
        `${ok} enabled, ${fail} failed (may need admin), ${skipped} already on.`,
      );
    }
    onApplied?.();
  }
</script>

<Card class="card-inset overflow-hidden relative group hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 py-0">
  <CardContent class="py-5">
    <div class="flex items-start justify-between gap-3 mb-1">
      <div class="min-w-0">
        <div class="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {profile.tagline}
        </div>
        <h3 class="text-base font-semibold mt-0.5">{profile.name}</h3>
      </div>
      <div
        class="shrink-0 grid place-items-center size-9 rounded-lg bg-foreground/[0.06] text-foreground/80 ring-1 ring-inset ring-foreground/5"
      >
        <ProfileIcon name={profile.gradient} class="size-4" />
      </div>
    </div>
    <p class="text-xs text-muted-foreground leading-relaxed line-clamp-3 min-h-[3rem]">
      {profile.description}
    </p>
    <div class="mt-3">
      <div class="flex items-baseline justify-between text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">
        <span>{stats.applied} / {stats.total} applied</span>
        <span class="tabular-nums">{stats.percent}%</span>
      </div>
      <div class="h-1 rounded-full bg-muted overflow-hidden">
        <div
          class="h-full rounded-full bg-primary transition-all duration-500"
          style="width: {stats.percent}%"
        ></div>
      </div>
    </div>
    <div class="flex justify-end mt-4">
      <Button size="sm" variant="outline" onclick={() => (open = true)}>
        Preview
        <ChevronRight class="size-3" />
      </Button>
    </div>
  </CardContent>
</Card>

<TweakPreviewDialog
  bind:open
  title={`Apply '${profile.name}'?`}
  subtitle={`This will enable ${tweaks.length} tweak${tweaks.length === 1 ? "" : "s"}. Already-active tweaks are skipped. Everything is reversible.`}
  {tweaks}
  mode="apply"
  confirmLabel="Apply profile"
  onConfirm={applyAll}
  busy={busy}
/>
