<script lang="ts">
  import { onMount } from "svelte";
  import {
    Button,
    Card,
    CardContent,
    Badge,
    Dialog,
    PageHeader,
    EmptyState,
    Select,
    FormField,
    TextInput,
    Switch,
    InfoBanner,
    toast,
  } from "$lib/ui";
  import {
    Loader2,
    Plus,
    Trash2,
    FolderOpen,
    AlertTriangle,
    Gamepad2,
    Folder,
  } from "@lucide/svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { isTauri, getFileIcons } from "$lib/tweaks/bridge";
  import { log } from "$lib/log.svelte";
  import {
    gameProfiles,
    syncProfileToRegistry,
    removeProfileFromRegistry,
    type GameProfile,
    type GpuPreference,
  } from "$lib/games/store.svelte";

  let busyIds = $state<Set<string>>(new Set());
  let removeOpen = $state(false);
  let pendingRemove = $state<GameProfile | null>(null);

  // Load icons lazily for any profile that doesn't have one yet.
  onMount(async () => {
    if (!isTauri()) return;
    const missing = gameProfiles.items.filter((p) => !p.iconBase64).map((p) => p.exePath);
    if (missing.length === 0) return;
    try {
      const icons = await getFileIcons(missing);
      for (const p of gameProfiles.items) {
        const png = icons[p.exePath];
        if (png) gameProfiles.update(p.id, { iconBase64: png });
      }
    } catch {
      // Icon extraction is cosmetic — fail silently.
    }
  });

  async function pickGame() {
    if (!isTauri()) {
      toast.error("Browser preview", "Need the built app to pick a file.");
      return;
    }
    try {
      const result = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Game executable", extensions: ["exe"] }],
      });
      if (!result || Array.isArray(result)) return;
      const path = result as string;
      if (gameProfiles.findByExePath(path)) {
        toast.warning("Already tracked", "This executable already has a profile.");
        return;
      }
      const name = path.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? "Game";
      const profile = gameProfiles.add({
        name,
        exePath: path,
        gpuPreference: "high-performance",
        disableFullscreenOptimizations: true,
        highDpiAware: false,
        runAsAdmin: false,
      });
      // Pre-apply immediately so a fresh add already takes effect.
      busyIds = new Set([...busyIds, profile.id]);
      try {
        await syncProfileToRegistry(profile);
        log.success("tweak.apply", profile.name, "Per-game profile created");
      } catch (e) {
        toast.error("Could not write registry", (e as Error).message);
      } finally {
        busyIds.delete(profile.id);
        busyIds = new Set(busyIds);
      }
      // Fetch its icon.
      try {
        const icons = await getFileIcons([path]);
        if (icons[path]) gameProfiles.update(profile.id, { iconBase64: icons[path] });
      } catch {}
    } catch (e) {
      toast.error("Picker failed", (e as Error).message);
    }
  }

  async function persistChange(p: GameProfile, patch: Partial<GameProfile>) {
    gameProfiles.update(p.id, patch);
    const next = gameProfiles.items.find((x) => x.id === p.id);
    if (!next) return;
    busyIds = new Set([...busyIds, p.id]);
    try {
      await syncProfileToRegistry(next);
    } catch (e) {
      toast.error("Could not apply change", (e as Error).message);
    } finally {
      busyIds.delete(p.id);
      busyIds = new Set(busyIds);
    }
  }

  function askRemove(p: GameProfile) {
    pendingRemove = p;
    removeOpen = true;
  }

  async function doRemove() {
    const p = pendingRemove;
    if (!p) return;
    removeOpen = false;
    pendingRemove = null;
    try {
      await removeProfileFromRegistry(p);
    } catch {}
    gameProfiles.remove(p.id);
    log.info("tweak.revert", p.name, "Per-game profile removed");
  }

  const GPU_LABELS: Record<GpuPreference, string> = {
    auto: "System default",
    "power-save": "Power-saving GPU",
    "high-performance": "High-performance GPU",
  };

  function gameFolder(exePath: string): string {
    const idx = Math.max(exePath.lastIndexOf("\\"), exePath.lastIndexOf("/"));
    return idx > 0 ? exePath.slice(0, idx) : exePath;
  }

  async function openFolder(p: GameProfile) {
    if (!isTauri()) return;
    try {
      // Use the opener plugin via dynamic import to avoid bundling for browser preview.
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(gameFolder(p.exePath));
    } catch (e) {
      toast.error("Could not open folder", (e as Error).message);
    }
  }
</script>

<PageHeader title="Per-game profiles">
  {#snippet actions()}
    <Button onclick={pickGame} disabled={!isTauri()}>
      <Plus />
      Add game
    </Button>
  {/snippet}
  GPU preference, fullscreen-optimization override and DPI scaling — applied per executable.
  Settings live in your user registry (no admin needed) and survive reboots.
</PageHeader>

{#if !isTauri()}
  <EmptyState>Browser preview — Per-game profiles needs the built app.</EmptyState>
{:else if gameProfiles.items.length === 0}
  <EmptyState>
    No games tracked yet. Click <span class="font-semibold">Add game</span> to pick an
    <code>.exe</code> and configure per-game GPU + compatibility settings.
  </EmptyState>
{:else}
  <InfoBanner tone="info">
    Reclaim writes these into <code>HKCU\Software\Microsoft\DirectX\UserGpuPreferences</code> and
    the per-user AppCompat <code>Layers</code> key — the same registry locations the Windows
    Settings → Graphics page uses. Removing a profile cleans them out.
  </InfoBanner>

  <div class="space-y-3">
    {#each gameProfiles.items as p (p.id)}
      {@const isBusy = busyIds.has(p.id)}
      <Card class="card-inset">
        <CardContent>
          <div class="flex items-start gap-4">
            {#if p.iconBase64}
              <img
                src={`data:image/png;base64,${p.iconBase64}`}
                alt=""
                class="size-12 rounded-md shrink-0"
              />
            {:else}
              <div class="size-12 rounded-md bg-surface-2 border border-hairline grid place-items-center shrink-0">
                <Gamepad2 class="size-6 text-muted-foreground/60" />
              </div>
            {/if}
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={p.name}
                  onblur={(e) => persistChange(p, { name: (e.currentTarget as HTMLInputElement).value })}
                  class="text-sm font-semibold bg-transparent border-0 px-0 focus:outline-none focus:ring-0 min-w-0"
                />
                {#if isBusy}
                  <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
                {/if}
              </div>
              <p class="text-xs text-muted-foreground mt-1 truncate font-mono">{p.exePath}</p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" onclick={() => openFolder(p)} title="Open folder">
                <Folder class="size-4" />
              </Button>
              <Button variant="ghost" size="icon" onclick={() => askRemove(p)} title="Remove">
                <Trash2 class="size-4" />
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <FormField label="GPU preference">
              <Select.Root
                type="single"
                value={p.gpuPreference}
                onValueChange={(v) =>
                  persistChange(p, { gpuPreference: (v ?? "auto") as GpuPreference })}
              >
                <Select.Trigger>
                  <span>{GPU_LABELS[p.gpuPreference]}</span>
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="auto" label="System default">{GPU_LABELS.auto}</Select.Item>
                  <Select.Item value="power-save" label="Power-saving GPU">
                    {GPU_LABELS["power-save"]}
                  </Select.Item>
                  <Select.Item value="high-performance" label="High-performance GPU">
                    {GPU_LABELS["high-performance"]}
                  </Select.Item>
                </Select.Content>
              </Select.Root>
            </FormField>

            <div class="space-y-2">
              <label class="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-surface-2 border border-hairline">
                <div class="min-w-0">
                  <div class="text-sm font-medium">Disable fullscreen optimizations</div>
                  <div class="text-xs text-muted-foreground mt-0.5">
                    Forces real exclusive fullscreen — tighter frame pacing for DX11 titles.
                  </div>
                </div>
                <Switch
                  checked={p.disableFullscreenOptimizations}
                  onCheckedChange={(v) => persistChange(p, { disableFullscreenOptimizations: v })}
                />
              </label>
              <label class="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-surface-2 border border-hairline">
                <div class="min-w-0">
                  <div class="text-sm font-medium">High-DPI aware (override)</div>
                  <div class="text-xs text-muted-foreground mt-0.5">
                    Bypass Windows DPI scaling — fixes blurry UI in older games on hi-DPI displays.
                  </div>
                </div>
                <Switch
                  checked={p.highDpiAware}
                  onCheckedChange={(v) => persistChange(p, { highDpiAware: v })}
                />
              </label>
              <label class="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-surface-2 border border-hairline">
                <div class="min-w-0">
                  <div class="text-sm font-medium flex items-center gap-2">
                    Run as administrator
                    <Badge variant="warning">
                      <AlertTriangle class="size-2.5" />
                      UAC
                    </Badge>
                  </div>
                  <div class="text-xs text-muted-foreground mt-0.5">
                    Triggers a UAC prompt on launch. Some anti-cheat suites refuse to start without
                    it.
                  </div>
                </div>
                <Switch
                  checked={p.runAsAdmin}
                  onCheckedChange={(v) => persistChange(p, { runAsAdmin: v })}
                />
              </label>
            </div>
          </div>
        </CardContent>
      </Card>
    {/each}
  </div>
{/if}

<Dialog
  bind:open={removeOpen}
  title="Remove this game profile?"
  description={pendingRemove
    ? `Removes the registry entries for ${pendingRemove.name} (GPU preference + AppCompat layers). The game itself stays installed.`
    : ""}
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (removeOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={doRemove}>
      <Trash2 />
      Remove
    </Button>
  {/snippet}
</Dialog>
