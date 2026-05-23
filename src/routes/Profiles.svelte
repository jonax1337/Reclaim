<script lang="ts">
  import { push } from "svelte-spa-router";
  import { Card, Button, Badge, Dialog, toast } from "$lib/ui";
  import {
    Plus,
    Upload,
    Download,
    Edit3,
    Trash2,
    Wand2,
    Loader2,
  } from "@lucide/svelte";
  import ProfileIcon from "$lib/components/ProfileIcon.svelte";
  import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
  import { isTauri, readTextFile, writeTextFile } from "$lib/tweaks/bridge";
  import {
    PROFILES,
    parseEnvelope,
    resolveProfileTweaks,
    toEnvelope,
    type Profile,
  } from "$lib/tweaks/profiles";
  import { customProfiles } from "$lib/tweaks/customProfiles.svelte";
  import { profileEdit } from "$lib/tweaks/profileEdit.svelte";
  import { applyTweak, getTweakState } from "$lib/tweaks/executor";
  import { log } from "$lib/log.svelte";

  let busy = $state<string | null>(null);
  let deleteOpen = $state(false);
  let pendingDelete = $state<Profile | null>(null);

  function startNew() {
    profileEdit.startNew();
    push("/profile-builder");
  }

  function startEdit(p: Profile) {
    profileEdit.startEdit(p);
    push("/profile-builder");
  }

  async function doImport() {
    if (!isTauri()) {
      toast.error("Browser preview", "Import needs the built app.");
      return;
    }
    try {
      const picked = await openDialog({
        title: "Import Reclaim profile",
        multiple: false,
        filters: [{ name: "Reclaim profile", extensions: ["reclaim", "json"] }],
      });
      if (!picked) return;
      const path = typeof picked === "string" ? picked : picked[0];
      const raw = await readTextFile(path);
      const { profile, unknownTweakIds } = parseEnvelope(raw);
      customProfiles.upsert(profile);
      log.success("tweak.apply", profile.name, `Imported profile (${profile.tweakIds.length} tweaks)`);
      if (unknownTweakIds.length > 0) {
        toast.warning(
          `Imported '${profile.name}' with ${unknownTweakIds.length} unknown tweak${unknownTweakIds.length === 1 ? "" : "s"} skipped`,
          unknownTweakIds.slice(0, 3).join(", ") + (unknownTweakIds.length > 3 ? ", …" : ""),
        );
      } else {
        toast.success(`Imported '${profile.name}'`);
      }
    } catch (e) {
      toast.error("Import failed", String(e));
    }
  }

  async function doExport(p: Profile) {
    if (!isTauri()) {
      toast.error("Browser preview", "Export needs the built app.");
      return;
    }
    busy = p.id;
    try {
      const defaultName = (p.name || "profile").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
      const picked = await saveDialog({
        title: `Export '${p.name}'`,
        defaultPath: `${defaultName}.reclaim`,
        filters: [{ name: "Reclaim profile", extensions: ["reclaim"] }],
      });
      if (!picked) return;
      const json = JSON.stringify(toEnvelope(p), null, 2);
      await writeTextFile(picked, json);
      toast.success(`Exported '${p.name}'`);
    } catch (e) {
      toast.error("Export failed", String(e));
    } finally {
      busy = null;
    }
  }

  function askDelete(p: Profile) {
    pendingDelete = p;
    deleteOpen = true;
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    deleteOpen = false;
    customProfiles.remove(target.id);
    toast.success(`Deleted '${target.name}'`);
    pendingDelete = null;
  }

  async function applyProfile(p: Profile) {
    if (busy) return;
    busy = p.id;
    const tweaks = resolveProfileTweaks(p);
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
    busy = null;
    if (fail === 0) {
      toast.success(
        `${p.name} applied`,
        `${ok} enabled${skipped > 0 ? `, ${skipped} already on` : ""}.`,
      );
    } else {
      toast.warning(
        `${p.name} partially applied`,
        `${ok} enabled, ${fail} failed (may need admin), ${skipped} already on.`,
      );
    }
  }
</script>

<header class="mb-6 flex flex-wrap items-center justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Profiles</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Built-in presets plus your own — exportable as JSON for sharing.
    </p>
  </div>
  <div class="flex items-center gap-2">
    <Button variant="outline" onclick={doImport}>
      <Upload />
      Import…
    </Button>
    <Button onclick={startNew}>
      <Plus />
      New profile
    </Button>
  </div>
</header>

<h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
  Built-in
</h2>
<Card class="overflow-hidden gap-0 py-0 card-inset mb-6">
  {#each PROFILES as p (p.id)}
    {@const isBusy = busy === p.id}
    {@const tweakCount = resolveProfileTweaks(p).length}
    <div class="flex items-start gap-3 py-3 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors">
      <div class="grid place-items-center size-9 rounded-md shrink-0 bg-foreground/[0.06] text-foreground/80 ring-1 ring-inset ring-foreground/5">
        <ProfileIcon name={p.gradient} class="size-4" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-medium">{p.name}</span>
          <Badge variant="outline">{tweakCount} tweaks</Badge>
        </div>
        <p class="text-xs text-muted-foreground mt-1 leading-relaxed">{p.description}</p>
      </div>
      <div class="shrink-0 flex items-center gap-2 pt-0.5">
        {#if isBusy}
          <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
        {/if}
        <Button size="sm" variant="outline" onclick={() => doExport(p)} disabled={!!busy} title="Export as JSON" aria-label="Export {p.name} as JSON">
          <Download />
        </Button>
        <Button size="sm" onclick={() => applyProfile(p)} disabled={!!busy}>
          <Wand2 />
          Apply
        </Button>
      </div>
    </div>
  {/each}
</Card>

<h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2 mt-6">
  Custom ({customProfiles.items.length})
</h2>

{#if customProfiles.items.length === 0}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground space-y-3">
      <p>No custom profiles yet.</p>
      <p class="text-xs text-muted-foreground/70">
        Build your own with hand-picked tweaks, or import a JSON profile someone shared with you.
      </p>
      <div class="flex justify-center gap-2 pt-2">
        <Button size="sm" variant="outline" onclick={doImport}>
          <Upload />
          Import
        </Button>
        <Button size="sm" onclick={startNew}>
          <Plus />
          New profile
        </Button>
      </div>
    </div>
  </Card>
{:else}
  <Card class="overflow-hidden gap-0 py-0 card-inset">
    {#each customProfiles.items as p (p.id)}
      {@const isBusy = busy === p.id}
      {@const tweakCount = resolveProfileTweaks(p).length}
      <div class="flex items-start gap-3 py-3 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors">
        <div class="grid place-items-center size-9 rounded-md shrink-0 bg-foreground/[0.06] text-foreground/80 ring-1 ring-inset ring-foreground/5">
          <ProfileIcon name={p.gradient} class="size-4" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium">{p.name}</span>
            <Badge variant="default">Custom</Badge>
            <Badge variant="outline">{tweakCount} tweaks</Badge>
            {#if p.bloatwarePatterns?.length}
              <Badge variant="outline">{p.bloatwarePatterns.length} bloatware</Badge>
            {/if}
          </div>
          <p class="text-xs text-muted-foreground mt-1 leading-relaxed">{p.description}</p>
        </div>
        <div class="shrink-0 flex items-center gap-2 pt-0.5">
          {#if isBusy}
            <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
          {/if}
          <Button size="sm" variant="outline" onclick={() => startEdit(p)} disabled={!!busy} title="Edit" aria-label="Edit {p.name}">
            <Edit3 />
          </Button>
          <Button size="sm" variant="outline" onclick={() => doExport(p)} disabled={!!busy} title="Export as JSON" aria-label="Export {p.name} as JSON">
            <Download />
          </Button>
          <Button size="sm" variant="outline" onclick={() => askDelete(p)} disabled={!!busy} title="Delete" aria-label="Delete {p.name}">
            <Trash2 />
          </Button>
          <Button size="sm" onclick={() => applyProfile(p)} disabled={!!busy}>
            <Wand2 />
            Apply
          </Button>
        </div>
      </div>
    {/each}
  </Card>
{/if}

<Dialog
  bind:open={deleteOpen}
  title={pendingDelete ? `Delete '${pendingDelete.name}'?` : "Delete profile?"}
  description="The profile will be removed from this device. Exported JSON files are kept."
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (deleteOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={confirmDelete}>
      <Trash2 />
      Delete
    </Button>
  {/snippet}
</Dialog>
