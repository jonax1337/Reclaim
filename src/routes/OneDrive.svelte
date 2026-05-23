<script lang="ts">
  import { Card, Button, Badge, Checkbox, Dialog, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Folder,
    FolderInput,
    Trash2,
    AlertTriangle,
    FileText,
    Image as ImageIcon,
    Monitor,
    Check,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import {
    isTauri,
    onedriveBackup,
    onedriveUninstall,
    type OneDriveStatus,
  } from "$lib/tweaks/bridge";
  import { log } from "$lib/log.svelte";
  import { iconUrl } from "$lib/apps/catalog";
  import { oneDriveResource } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  const ONEDRIVE_LOGO = iconUrl("microsoft-onedrive");

  let backupTarget = $state("");
  let backupDocs = $state(true);
  let backupDesktop = $state(true);
  let backupPics = $state(true);
  let backupSyncRoot = $state(false);
  let removeLeftovers = $state(true);
  let disablePolicy = $state(true);

  const statusRes = oneDriveResource();
  const status = $derived<OneDriveStatus | null>(statusRes.data ?? null);
  const loading = $derived(statusRes.loading);
  const refreshing = $derived(statusRes.revalidating);

  let backupBusy = $state(false);
  let uninstallBusy = $state(false);
  let confirmOpen = $state(false);

  async function reload() {
    invalidate("onedrive.status");
    await statusRes.refresh();
  }

  const anyRedirected = $derived(
    !!(status?.redirectedDocuments || status?.redirectedDesktop || status?.redirectedPictures),
  );

  async function pickTarget() {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose backup destination",
      });
      if (picked && typeof picked === "string") {
        backupTarget = picked;
      }
    } catch (e) {
      toast.error("Could not open folder picker", String(e));
    }
  }

  function collectBackupSources(): string[] {
    if (!status) return [];
    const out: string[] = [];
    if (backupDocs && status.redirectedDocuments) out.push(status.redirectedDocuments);
    if (backupDesktop && status.redirectedDesktop) out.push(status.redirectedDesktop);
    if (backupPics && status.redirectedPictures) out.push(status.redirectedPictures);
    if (backupSyncRoot && status.syncFolder) out.push(status.syncFolder);
    return out;
  }

  async function doBackup() {
    if (backupBusy) return;
    const sources = collectBackupSources();
    if (sources.length === 0) {
      toast.error("Nothing selected to back up");
      return;
    }
    if (!backupTarget) {
      toast.error("Pick a backup destination first");
      return;
    }
    backupBusy = true;
    try {
      const r = await onedriveBackup(backupTarget, sources);
      if (r.success) {
        log.success(
          "onedrive.backup",
          "User folders",
          `Copied ${sources.length} folder(s) to ${backupTarget}`,
        );
        toast.success("Backup complete", `${sources.length} folder(s) copied`);
      } else {
        log.error("onedrive.backup", "User folders", "Backup failed", r.stderr || r.stdout);
        toast.error("Backup failed", r.stderr || r.stdout || `exit ${r.code}`);
      }
    } catch (e) {
      toast.error("Backup error", String(e));
    } finally {
      backupBusy = false;
    }
  }

  function askUninstall() {
    confirmOpen = true;
  }

  async function doUninstall() {
    confirmOpen = false;
    if (uninstallBusy) return;
    uninstallBusy = true;
    try {
      const r = await onedriveUninstall({
        disablePolicy,
        removeLeftovers,
      });
      if (r.success) {
        log.success(
          "onedrive.uninstall",
          "OneDrive",
          `Removed${disablePolicy ? " + policy block" : ""}`,
          r.stdout,
        );
        toast.success("OneDrive removed", "Explorer restarted. Sign out / in to fully refresh.");
      } else {
        log.error("onedrive.uninstall", "OneDrive", "Removal failed", r.stderr || r.stdout);
        toast.error("Removal returned errors", r.stderr || `exit ${r.code}`);
      }
      await reload();
    } catch (e) {
      toast.error("Removal failed", String(e));
    } finally {
      uninstallBusy = false;
    }
  }
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">OneDrive removal</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Back up your personal folders first, then uninstall OneDrive cleanly — sidebar entry,
      leftover folders, optional policy block to prevent re-install.
    </p>
  </div>
  <Button variant="outline" onclick={reload} disabled={loading}>
    <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
    Refresh
  </Button>
</header>

<AdminBanner
  title="Admin needed for full removal"
  description="Detection and backup work without admin. To remove OneDrive system-wide and write the policy block, you need elevated rights."
  declinedToast="Removal requires admin."
/>

{#if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — OneDrive operations need the built app.
    </div>
  </Card>
{:else if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Detecting OneDrive…
  </div>
{:else if status && !status.installed}
  <section
    class="relative overflow-hidden rounded-2xl border border-foreground/10 bg-card/70 backdrop-blur-xl shadow-sm mb-6"
  >
    <div class="px-8 py-10 flex flex-col items-center text-center gap-3">
      <div class="grid place-items-center size-16 rounded-2xl bg-success/15 text-success">
        <Check class="size-8" />
      </div>
      <h2 class="text-xl font-semibold">OneDrive is not installed</h2>
      <p class="text-sm text-muted-foreground max-w-md leading-relaxed">
        No OneDrive executable detected. If something still references it, click Refresh to
        re-scan.
      </p>
    </div>
  </section>
{:else if status}
  <!-- Hero status card -->
  <section
    class="relative overflow-hidden rounded-2xl border border-foreground/10 bg-card/70 backdrop-blur-xl shadow-sm mb-6 hero-glow"
  >

    <div class="px-7 py-6 flex flex-wrap items-start gap-5">
      <div class="grid place-items-center size-16 rounded-2xl bg-white dark:bg-foreground/[0.06] shadow-sm shrink-0 ring-1 ring-foreground/5">
        <img src={ONEDRIVE_LOGO} alt="OneDrive" class="size-10 object-contain" />
      </div>
      <div class="flex-1 min-w-[16rem]">
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-xl font-semibold">Microsoft OneDrive</h2>
          {#if status.processRunning}
            <Badge variant="success">Running</Badge>
          {:else}
            <Badge variant="outline">Idle</Badge>
          {/if}
          <Badge variant="default">Installed</Badge>
        </div>
        <p class="text-xs text-muted-foreground mt-1">
          {#if anyRedirected}
            Some of your user folders are stored in OneDrive — back them up below before
            removing the app.
          {:else if status.syncFolder}
            OneDrive is installed but your user folders aren't redirected.
          {:else}
            OneDrive is installed and not actively syncing anything personal.
          {/if}
        </p>

        {#if anyRedirected || status.syncFolder}
          <dl class="mt-4 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
            {#if status.syncFolder}
              <dt class="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold sm:normal-case sm:tracking-normal sm:text-xs sm:font-normal">Sync folder</dt>
              <dd class="font-mono break-all">{status.syncFolder}</dd>
            {/if}
            {#if status.redirectedDocuments}
              <dt class="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold sm:normal-case sm:tracking-normal sm:text-xs sm:font-normal">Documents →</dt>
              <dd class="font-mono break-all">{status.redirectedDocuments}</dd>
            {/if}
            {#if status.redirectedDesktop}
              <dt class="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold sm:normal-case sm:tracking-normal sm:text-xs sm:font-normal">Desktop →</dt>
              <dd class="font-mono break-all">{status.redirectedDesktop}</dd>
            {/if}
            {#if status.redirectedPictures}
              <dt class="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold sm:normal-case sm:tracking-normal sm:text-xs sm:font-normal">Pictures →</dt>
              <dd class="font-mono break-all">{status.redirectedPictures}</dd>
            {/if}
          </dl>
        {/if}
      </div>
    </div>
  </section>

  <!-- Backup card -->
  <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
    Step 1 — Backup
  </h2>
  <Card class="card-inset mb-6">
    <div class="px-5 py-4 space-y-4">
      <p class="text-xs text-muted-foreground leading-relaxed">
        Copies the contents of your OneDrive-redirected folders to a local path you control
        (uses robocopy under the hood). Skip this if nothing is redirected or you already have
        a backup.
      </p>

      <div class="space-y-2">
        {#if status.redirectedDocuments}
          <label class="flex items-start gap-3 p-3 rounded-lg border border-foreground/10 hover:bg-accent/30 transition-colors cursor-pointer">
            <div class="pt-0.5">
              <Checkbox bind:checked={backupDocs} disabled={backupBusy} />
            </div>
            <FileText class="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium">Documents</span>
              <p class="text-[11px] text-muted-foreground font-mono mt-0.5 break-all">
                {status.redirectedDocuments}
              </p>
            </div>
          </label>
        {/if}
        {#if status.redirectedDesktop}
          <label class="flex items-start gap-3 p-3 rounded-lg border border-foreground/10 hover:bg-accent/30 transition-colors cursor-pointer">
            <div class="pt-0.5">
              <Checkbox bind:checked={backupDesktop} disabled={backupBusy} />
            </div>
            <Monitor class="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium">Desktop</span>
              <p class="text-[11px] text-muted-foreground font-mono mt-0.5 break-all">
                {status.redirectedDesktop}
              </p>
            </div>
          </label>
        {/if}
        {#if status.redirectedPictures}
          <label class="flex items-start gap-3 p-3 rounded-lg border border-foreground/10 hover:bg-accent/30 transition-colors cursor-pointer">
            <div class="pt-0.5">
              <Checkbox bind:checked={backupPics} disabled={backupBusy} />
            </div>
            <ImageIcon class="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium">Pictures</span>
              <p class="text-[11px] text-muted-foreground font-mono mt-0.5 break-all">
                {status.redirectedPictures}
              </p>
            </div>
          </label>
        {/if}
        {#if status.syncFolder}
          <label class="flex items-start gap-3 p-3 rounded-lg border border-foreground/10 hover:bg-accent/30 transition-colors cursor-pointer">
            <div class="pt-0.5">
              <Checkbox bind:checked={backupSyncRoot} disabled={backupBusy} />
            </div>
            <Folder class="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium">Entire OneDrive sync root</span>
              <p class="text-[11px] text-muted-foreground font-mono mt-0.5 break-all">
                {status.syncFolder}
              </p>
              <p class="text-[10px] text-muted-foreground/70 mt-0.5">
                Includes everything — slow, may be huge.
              </p>
            </div>
          </label>
        {/if}
        {#if !anyRedirected && !status.syncFolder}
          <p class="text-xs text-muted-foreground italic">
            Nothing to back up — your folders aren't redirected to OneDrive.
          </p>
        {/if}
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="flex-1 min-w-[16rem]">
          <input
            type="text"
            bind:value={backupTarget}
            placeholder="Backup destination folder…"
            class="w-full h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring font-mono"
            disabled={backupBusy}
          />
        </div>
        <Button variant="outline" onclick={pickTarget} disabled={backupBusy}>
          <FolderInput />
          Browse…
        </Button>
        <Button onclick={doBackup} disabled={backupBusy || collectBackupSources().length === 0}>
          {#if backupBusy}
            <Loader2 class="animate-spin" />
            Copying…
          {:else}
            <FolderInput />
            Back up now
          {/if}
        </Button>
      </div>
    </div>
  </Card>

  <!-- Uninstall card -->
  <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
    Step 2 — Uninstall
  </h2>
  <Card class="card-inset mb-6">
    <div class="px-5 py-4 space-y-3">
      <p class="text-xs text-muted-foreground leading-relaxed">
        Stops OneDrive, runs the official uninstaller, unpins the sidebar entry, and optionally
        cleans up leftovers and blocks future re-installs.
      </p>
      <label class="flex items-start gap-3 p-3 rounded-lg border border-foreground/10 hover:bg-accent/30 transition-colors cursor-pointer">
        <div class="pt-0.5">
          <Checkbox bind:checked={removeLeftovers} disabled={uninstallBusy} />
        </div>
        <div class="flex-1 min-w-0">
          <span class="text-sm font-medium">Remove leftover folders</span>
          <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
            Deletes <code class="font-mono">%LOCALAPPDATA%\Microsoft\OneDrive</code>,
            <code class="font-mono">%PROGRAMDATA%\Microsoft OneDrive</code> and
            <code class="font-mono">C:\OneDriveTemp</code>.
          </p>
        </div>
      </label>
      <label class="flex items-start gap-3 p-3 rounded-lg border border-foreground/10 hover:bg-accent/30 transition-colors cursor-pointer">
        <div class="pt-0.5">
          <Checkbox bind:checked={disablePolicy} disabled={uninstallBusy} />
        </div>
        <div class="flex-1 min-w-0">
          <span class="text-sm font-medium">Block re-install via Group Policy</span>
          <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
            Sets <code class="font-mono">HKLM\Policies\Microsoft\Windows\OneDrive\DisableFileSyncNGSC</code>
            so Windows can't silently re-install it. Reversible by unsetting the value.
          </p>
        </div>
      </label>

      <div class="flex justify-end">
        <Button variant="destructive" onclick={askUninstall} disabled={uninstallBusy}>
          {#if uninstallBusy}
            <Loader2 class="animate-spin" />
            Removing…
          {:else}
            <Trash2 />
            Remove OneDrive
          {/if}
        </Button>
      </div>
    </div>
  </Card>
{/if}

<Dialog
  bind:open={confirmOpen}
  title="Remove OneDrive?"
  description="OneDrive will be uninstalled. Make sure you've backed up anything you need from the OneDrive folder first — files stored only in the cloud may also disappear from your machine."
>
  <div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
    <AlertTriangle class="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
    <p class="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
      Explorer will be restarted at the end. Save unsaved work in other windows first.
    </p>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={doUninstall}>
      <Trash2 />
      Yes, remove OneDrive
    </Button>
  {/snippet}
</Dialog>
