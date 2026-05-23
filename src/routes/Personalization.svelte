<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Badge, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Image as ImageIcon,
    Monitor,
    Lock,
    FolderOpen,
    Trash2,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import {
    isTauri,
    personalizationStatus,
    setWallpaper,
    setLockscreen,
    clearLockscreen,
    type PersonalizationStatus,
    type WallpaperStyle,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { cn } from "$lib/utils";

  const STYLES: Array<{ value: WallpaperStyle; label: string; description: string }> = [
    { value: 10, label: "Fill", description: "Crop to fit, no stretching." },
    { value: 6, label: "Fit", description: "Show whole image with letterboxing." },
    { value: 2, label: "Stretch", description: "Stretch to exact screen size (may distort)." },
    { value: 1, label: "Tile", description: "Repeat across the screen." },
    { value: 0, label: "Center", description: "Show at original size, centered." },
    { value: 22, label: "Span", description: "Span across multiple monitors." },
  ];

  let status = $state<PersonalizationStatus | null>(null);
  let loading = $state(false);
  let wallpaperTarget = $state("");
  let wallpaperStyle = $state<WallpaperStyle>(10);
  let wallpaperBusy = $state(false);
  let lockscreenTarget = $state("");
  let lockscreenBusy = $state(false);

  async function load() {
    if (!isTauri()) return;
    loading = true;
    try {
      const s = await personalizationStatus();
      status = s;
      if (s.style && STYLES.some((x) => x.value === s.style)) {
        wallpaperStyle = s.style as WallpaperStyle;
      }
    } catch (e) {
      toast.error("Could not read personalization state", String(e));
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function pickWallpaper() {
    try {
      const picked = await openDialog({
        directory: false,
        multiple: false,
        title: "Choose desktop wallpaper",
        filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "bmp", "webp", "gif"] }],
      });
      if (picked && typeof picked === "string") wallpaperTarget = picked;
    } catch (e) {
      toast.error("Could not open picker", String(e));
    }
  }

  async function applyWallpaper() {
    if (!wallpaperTarget) {
      toast.error("Pick an image first");
      return;
    }
    wallpaperBusy = true;
    try {
      await setWallpaper(wallpaperTarget, wallpaperStyle);
      log.success("personalization.wallpaper", wallpaperTarget, `Style ${wallpaperStyle}`);
      toast.success("Wallpaper applied");
      await load();
    } catch (e) {
      toast.error("Wallpaper change failed", String(e));
      log.error("personalization.wallpaper", wallpaperTarget, "Failed", String(e));
    } finally {
      wallpaperBusy = false;
    }
  }

  async function pickLockscreen() {
    try {
      const picked = await openDialog({
        directory: false,
        multiple: false,
        title: "Choose lock screen image",
        filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "bmp"] }],
      });
      if (picked && typeof picked === "string") lockscreenTarget = picked;
    } catch (e) {
      toast.error("Could not open picker", String(e));
    }
  }

  async function applyLockscreen() {
    if (!lockscreenTarget) {
      toast.error("Pick an image first");
      return;
    }
    lockscreenBusy = true;
    try {
      await setLockscreen(lockscreenTarget);
      log.success("personalization.lockscreen", lockscreenTarget, "Lock screen set");
      toast.success("Lock screen applied", "Sign out + back in to see the change.");
      await load();
    } catch (e) {
      toast.error("Lock screen change failed", String(e));
      log.error("personalization.lockscreen", lockscreenTarget, "Failed", String(e));
    } finally {
      lockscreenBusy = false;
    }
  }

  async function doClearLockscreen() {
    lockscreenBusy = true;
    try {
      await clearLockscreen();
      log.success("personalization.lockscreen", "policy", "Lock screen policy cleared");
      toast.success("Lock screen policy cleared", "Windows resumes choosing the image.");
      await load();
    } catch (e) {
      toast.error("Clear failed", String(e));
      log.error("personalization.lockscreen", "policy", "Clear failed", String(e));
    } finally {
      lockscreenBusy = false;
    }
  }
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Personalization</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Desktop wallpaper and lock screen image. Lock screen changes need administrator rights and only show on the
      next sign-out.
    </p>
  </div>
  <Button variant="outline" onclick={load} disabled={loading}>
    <RefreshCw class={loading ? "animate-spin" : ""} />
    Refresh
  </Button>
</header>

{#if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — personalization needs the built app.
    </div>
  </Card>
{:else}
  <!-- Wallpaper -->
  <Card class="card-inset mb-6">
    <div class="px-5 py-4 flex items-center gap-3 border-b border-foreground/8">
      <div class="grid place-items-center size-9 rounded-md bg-primary/15 text-primary shrink-0">
        <Monitor class="size-4" />
      </div>
      <div class="flex-1 min-w-0">
        <h2 class="text-base font-semibold">Desktop wallpaper</h2>
        <p class="text-xs text-muted-foreground mt-0.5">
          Applies to the current user. Changes take effect immediately.
        </p>
      </div>
    </div>
    {#if status?.path}
      <div class="px-5 py-3 text-[11px] font-mono text-muted-foreground/80 border-b border-foreground/8 truncate">
        Current: {status.path}
      </div>
    {/if}
    <div class="px-5 py-4 flex flex-col gap-3">
      <div class="flex flex-wrap gap-2">
        <input
          type="text"
          bind:value={wallpaperTarget}
          placeholder="C:\path\to\image.jpg"
          class="flex-1 min-w-0 h-9 px-3 rounded-md border border-input bg-card text-sm font-mono outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
          disabled={wallpaperBusy}
        />
        <Button variant="outline" size="sm" onclick={pickWallpaper} disabled={wallpaperBusy}>
          <FolderOpen />
          Pick
        </Button>
      </div>
      <div>
        <div class="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">
          Fit
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
          {#each STYLES as s (s.value)}
            <button
              type="button"
              onclick={() => (wallpaperStyle = s.value)}
              disabled={wallpaperBusy}
              class={cn(
                "text-left px-3 py-2 rounded-md border text-sm transition-colors",
                wallpaperStyle === s.value
                  ? "border-primary bg-primary/10"
                  : "border-input hover:bg-accent/40",
              )}
            >
              <div class="flex items-center gap-2">
                <span class="font-medium">{s.label}</span>
                {#if wallpaperStyle === s.value}
                  <Badge variant="success">Selected</Badge>
                {/if}
              </div>
              <p class="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>
            </button>
          {/each}
        </div>
      </div>
      <div class="flex justify-end">
        <Button onclick={applyWallpaper} disabled={wallpaperBusy}>
          {#if wallpaperBusy}
            <Loader2 class="animate-spin" />
          {:else}
            <ImageIcon />
          {/if}
          Apply wallpaper
        </Button>
      </div>
    </div>
  </Card>

  <!-- Lock screen -->
  {#if isTauri() && admin.checked && !admin.elevated}
    <AdminBanner
      title="Setting the lock screen needs administrator"
      description="Lock screen images are written under HKLM via the Personalization CSP policy. Click here to relaunch with UAC."
      declinedToast="Lock screen setting requires admin."
    />
  {:else}
    <Card class="card-inset mb-6">
      <div class="px-5 py-4 flex items-center gap-3 border-b border-foreground/8">
        <div class="grid place-items-center size-9 rounded-md bg-primary/15 text-primary shrink-0">
          <Lock class="size-4" />
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="text-base font-semibold">Lock screen</h2>
          <p class="text-xs text-muted-foreground mt-0.5">
            Writes the <code class="font-mono text-[11px]">Personalization</code> CSP policy. Disables Windows
            Spotlight; clear the policy to let Windows choose again.
          </p>
        </div>
      </div>
      {#if status?.lockscreenPolicyPath}
        <div class="px-5 py-3 text-[11px] font-mono text-muted-foreground/80 border-b border-foreground/8 truncate">
          Policy: {status.lockscreenPolicyPath}
        </div>
      {/if}
      <div class="px-5 py-4 flex flex-col gap-3">
        <div class="flex flex-wrap gap-2">
          <input
            type="text"
            bind:value={lockscreenTarget}
            placeholder="C:\path\to\image.jpg"
            class="flex-1 min-w-0 h-9 px-3 rounded-md border border-input bg-card text-sm font-mono outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
            disabled={lockscreenBusy}
          />
          <Button variant="outline" size="sm" onclick={pickLockscreen} disabled={lockscreenBusy}>
            <FolderOpen />
            Pick
          </Button>
        </div>
        <div class="flex justify-end gap-2">
          {#if status?.lockscreenPolicyPath}
            <Button variant="outline" onclick={doClearLockscreen} disabled={lockscreenBusy}>
              {#if lockscreenBusy}
                <Loader2 class="animate-spin" />
              {:else}
                <Trash2 />
              {/if}
              Clear policy
            </Button>
          {/if}
          <Button onclick={applyLockscreen} disabled={lockscreenBusy}>
            {#if lockscreenBusy}
              <Loader2 class="animate-spin" />
            {:else}
              <Lock />
            {/if}
            Apply lock screen
          </Button>
        </div>
      </div>
    </Card>
  {/if}
{/if}
