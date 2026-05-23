<script lang="ts">
  import { Card, Button, BulkActionBar, toast } from "$lib/ui";
  import { Loader2, Wand2, RotateCcw, ShieldAlert, ArrowRight, Eye } from "@lucide/svelte";
  import type { Tweak } from "$lib/tweaks/catalog";
  import {
    applyTweak,
    revertTweak,
    getTweakState,
    tweakRequiresAdmin,
    type TweakState,
  } from "$lib/tweaks/executor";
  import { isTauri } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { tweakStatesResource, K_TWEAK_STATES } from "$lib/route-cache.svelte";
  import { setCached } from "$lib/cache.svelte";
  import TweakRow from "./TweakRow.svelte";
  import TweakPreviewDialog from "./TweakPreviewDialog.svelte";

  type Props = { tweaks: Tweak[] };
  let { tweaks }: Props = $props();

  const statesRes = tweakStatesResource();
  const allStates = $derived<Record<string, TweakState>>(statesRes.data ?? {});
  // Show the loading bar only on the very first fetch (no cached data yet).
  const loading = $derived(statesRes.loading && !statesRes.data);

  let busy = $state(false);
  let selected = $state<Set<string>>(new Set());
  let previewOpen = $state(false);
  let previewMode = $state<"apply" | "revert">("apply");

  const visibleTweaks = $derived(
    !isTauri() || !admin.checked || admin.elevated
      ? tweaks
      : tweaks.filter((t) => !tweakRequiresAdmin(t)),
  );
  const hiddenCount = $derived(tweaks.length - visibleTweaks.length);

  function patchState(id: string, next: TweakState) {
    const merged = { ...(statesRes.data ?? {}), [id]: next };
    setCached(K_TWEAK_STATES, merged);
  }

  async function runBatch(
    items: Tweak[],
    op: (t: Tweak) => Promise<void>,
    desiredState: TweakState,
    okLabel: string,
  ): Promise<void> {
    if (busy) return;
    busy = true;
    let ok = 0;
    let fail = 0;
    for (const t of items) {
      try {
        await op(t);
        patchState(t.id, desiredState);
        ok++;
      } catch {
        fail++;
        // Re-read the real state so the UI isn't stuck on a wrong optimistic value.
        try {
          patchState(t.id, await getTweakState(t));
        } catch {
          /* leave as-is */
        }
      }
    }
    busy = false;
    if (fail === 0) {
      toast.success(`${ok} tweak${ok === 1 ? "" : "s"} ${okLabel}`);
    } else {
      toast.warning(
        `${ok} ${okLabel}, ${fail} failed`,
        "Some tweaks may need administrator rights.",
      );
    }
  }

  async function applyRecommended() {
    const recs = visibleTweaks.filter((t) => t.recommended && allStates[t.id] !== "on");
    await runBatch(recs, applyTweak, "on", "enabled");
  }

  async function revertAll() {
    const active = visibleTweaks.filter((t) => allStates[t.id] === "on");
    await runBatch(active, revertTweak, "off", "reverted");
  }

  async function applySelected() {
    const items = visibleTweaks.filter((t) => selected.has(t.id) && allStates[t.id] !== "on");
    await runBatch(items, applyTweak, "on", "enabled");
    selected = new Set();
  }

  async function revertSelected() {
    const items = visibleTweaks.filter((t) => selected.has(t.id) && allStates[t.id] === "on");
    await runBatch(items, revertTweak, "off", "reverted");
    selected = new Set();
  }

  function selectAll() {
    selected = new Set(visibleTweaks.map((t) => t.id));
  }

  function clearSelection() {
    selected = new Set();
  }

  const recommendedPending = $derived(
    visibleTweaks.filter((t) => t.recommended && allStates[t.id] !== "on").length,
  );
  const activeCount = $derived(visibleTweaks.filter((t) => allStates[t.id] === "on").length);
  const selectedActiveCount = $derived(
    [...selected].filter((id) => allStates[id] === "on").length,
  );
  const selectedInactiveCount = $derived(
    [...selected].filter((id) => allStates[id] !== "on").length,
  );

  const previewTweaks = $derived(
    previewMode === "revert"
      ? visibleTweaks.filter((t) => selected.has(t.id) && allStates[t.id] === "on")
      : visibleTweaks.filter((t) => selected.has(t.id) && allStates[t.id] !== "on"),
  );

  function openPreview(mode: "apply" | "revert") {
    previewMode = mode;
    previewOpen = true;
  }

  async function confirmPreview() {
    previewOpen = false;
    if (previewMode === "revert") await revertSelected();
    else await applySelected();
  }
</script>

{#if hiddenCount > 0}
  <button
    type="button"
    onclick={async () => {
      const ok = await admin.relaunchElevated();
      if (!ok) toast.error("UAC declined", "Continuing in restricted mode.");
    }}
    disabled={admin.requesting}
    class="w-full mb-4 text-left rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200 px-4 py-3 flex items-center gap-3 disabled:opacity-60 group"
  >
    <ShieldAlert class="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
    <div class="flex-1 text-xs">
      <span class="font-semibold text-amber-900 dark:text-amber-200">
        {hiddenCount} admin-only tweak{hiddenCount === 1 ? "" : "s"} hidden
      </span>
      <span class="text-amber-800/80 dark:text-amber-200/80">
        · click to relaunch with UAC
      </span>
    </div>
    <ArrowRight
      class="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 transition-transform group-hover:translate-x-0.5"
    />
  </button>
{/if}

<div class="flex items-center justify-between mb-3 px-1 min-h-9">
  <div class="flex items-center gap-3 text-xs">
    {#if loading}
      <span class="inline-flex items-center gap-1.5 text-muted-foreground">
        <Loader2 class="size-3 animate-spin" />
        Loading status…
      </span>
    {:else}
      <span>
        <span class="font-medium text-foreground tabular-nums">{activeCount}</span>
        <span class="text-muted-foreground">of {visibleTweaks.length} active</span>
      </span>
      {#if statesRes.revalidating}
        <span class="text-muted-foreground/70">refreshing…</span>
      {/if}
      {#if visibleTweaks.length > 0}
        <button
          type="button"
          onclick={selectAll}
          class="text-muted-foreground hover:text-foreground transition-colors"
        >
          select all
        </button>
      {/if}
    {/if}
  </div>
  <div class="flex items-center gap-2">
    {#if recommendedPending > 0}
      <Button size="sm" onclick={applyRecommended} disabled={busy}>
        <Wand2 />
        Apply recommended ({recommendedPending})
      </Button>
    {/if}
    {#if activeCount > 0}
      <Button size="sm" variant="outline" onclick={revertAll} disabled={busy}>
        <RotateCcw />
        Revert all
      </Button>
    {/if}
  </div>
</div>

{#if visibleTweaks.length === 0}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      All tweaks in this category require administrator rights. Elevate to see them.
    </div>
  </Card>
{:else}
  <Card class="overflow-hidden gap-0 py-0 card-inset">
    {#each visibleTweaks as t (t.id)}
      <TweakRow
        tweak={t}
        state={allStates[t.id] ?? "unknown"}
        selected={selected.has(t.id)}
        onChange={(s) => patchState(t.id, s)}
        onSelectChange={(v) => {
          const next = new Set(selected);
          if (v) next.add(t.id);
          else next.delete(t.id);
          selected = next;
        }}
      />
    {/each}
  </Card>
{/if}

<BulkActionBar count={selected.size} onClear={clearSelection}>
  {#if selectedInactiveCount > 0 || selectedActiveCount > 0}
    <Button
      size="sm"
      variant="ghost"
      onclick={() => openPreview(selectedInactiveCount > 0 ? "apply" : "revert")}
      disabled={busy}
    >
      <Eye />
      Preview
    </Button>
  {/if}
  {#if selectedInactiveCount > 0}
    <Button size="sm" onclick={applySelected} disabled={busy}>
      <Wand2 />
      Apply ({selectedInactiveCount})
    </Button>
  {/if}
  {#if selectedActiveCount > 0}
    <Button size="sm" variant="outline" onclick={revertSelected} disabled={busy}>
      <RotateCcw />
      Revert ({selectedActiveCount})
    </Button>
  {/if}
</BulkActionBar>

<TweakPreviewDialog
  bind:open={previewOpen}
  title={previewMode === "revert" ? "Revert selected tweaks?" : "Apply selected tweaks?"}
  subtitle={previewMode === "revert"
    ? `Review the ${previewTweaks.length} change${previewTweaks.length === 1 ? "" : "s"} that will be undone.`
    : `Review the ${previewTweaks.length} change${previewTweaks.length === 1 ? "" : "s"} that will be made. Reversible.`}
  tweaks={previewTweaks}
  states={allStates}
  mode={previewMode}
  onConfirm={confirmPreview}
  busy={busy}
/>
