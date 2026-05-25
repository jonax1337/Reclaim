<script lang="ts">
  import { Card, Button, Badge, Checkbox, Dialog, PageHeader, SectionHeading, HeroBanner, StatusHero, EmptyState, StatusAvatar, InfoBanner, CheckboxLabel, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    Folder,
    FolderInput,
    Trash2,
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

<PageHeader
  title="OneDrive removal"
  description="Back up your personal folders first, then uninstall OneDrive cleanly — sidebar entry, leftover folders, optional policy block to prevent re-install."
>
  {#snippet actions()}
    <Button variant="outline" onclick={reload} disabled={loading}>
      <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  {/snippet}
</PageHeader>

<AdminBanner
  title="Admin needed for full removal"
  description="Detection and backup work without admin. To remove OneDrive system-wide and write the policy block, you need elevated rights."
  declinedToast="Removal requires admin."
/>

{#if !isTauri()}
  <EmptyState>Browser preview — OneDrive operations need the built app.</EmptyState>
{:else if loading}
  <EmptyState loading>Detecting OneDrive…</EmptyState>
{:else if status && !status.installed}
  <HeroBanner tone="none">
    <div class="px-8 py-10 flex flex-col items-center text-center gap-3">
      <StatusAvatar tone="success" icon={Check} />
      <h2 class="text-xl font-semibold">OneDrive is not installed</h2>
      <p class="text-sm text-muted-foreground max-w-md leading-relaxed">
        No OneDrive executable detected. If something still references it, click Refresh to
        re-scan.
      </p>
    </div>
  </HeroBanner>
{:else if status}
  <!-- Hero status card -->
  {@const dtClass = "text-muted-foreground uppercase tracking-wider text-[10px] font-semibold sm:normal-case sm:tracking-normal sm:text-xs sm:font-normal"}
  <StatusHero avatarTone="neutral" title="Microsoft OneDrive">
    {#snippet avatar()}
      <img src={ONEDRIVE_LOGO} alt="OneDrive" class="size-10 object-contain" />
    {/snippet}
    {#snippet badges()}
      {#if status.processRunning}
        <Badge variant="success">Running</Badge>
      {:else}
        <Badge variant="outline">Idle</Badge>
      {/if}
      <Badge variant="default">Installed</Badge>
    {/snippet}
    {#if anyRedirected}
      Some of your user folders are stored in OneDrive — back them up below before removing the app.
    {:else if status.syncFolder}
      OneDrive is installed but your user folders aren't redirected.
    {:else}
      OneDrive is installed and not actively syncing anything personal.
    {/if}
    {#snippet details()}
      {#if anyRedirected || status.syncFolder}
        {#if status.syncFolder}
          <dt class={dtClass}>Sync folder</dt>
          <dd class="font-mono break-all">{status.syncFolder}</dd>
        {/if}
        {#if status.redirectedDocuments}
          <dt class={dtClass}>Documents →</dt>
          <dd class="font-mono break-all">{status.redirectedDocuments}</dd>
        {/if}
        {#if status.redirectedDesktop}
          <dt class={dtClass}>Desktop →</dt>
          <dd class="font-mono break-all">{status.redirectedDesktop}</dd>
        {/if}
        {#if status.redirectedPictures}
          <dt class={dtClass}>Pictures →</dt>
          <dd class="font-mono break-all">{status.redirectedPictures}</dd>
        {/if}
      {/if}
    {/snippet}
  </StatusHero>

  <!-- Backup card -->
  <SectionHeading title="Step 1 — Backup" />
  <Card class="card-inset mb-6">
    <div class="px-5 py-4 space-y-4">
      <p class="text-xs text-muted-foreground leading-relaxed">
        Copies the contents of your OneDrive-redirected folders to a local path you control
        (uses robocopy under the hood). Skip this if nothing is redirected or you already have
        a backup.
      </p>

      <div class="space-y-2">
        {#if status.redirectedDocuments}
          <CheckboxLabel
            bind:checked={backupDocs}
            disabled={backupBusy}
            icon={FileText}
            label="Documents"
          >
            <p class="text-[11px] text-muted-foreground font-mono mt-0.5 break-all">
              {status.redirectedDocuments}
            </p>
          </CheckboxLabel>
        {/if}
        {#if status.redirectedDesktop}
          <CheckboxLabel
            bind:checked={backupDesktop}
            disabled={backupBusy}
            icon={Monitor}
            label="Desktop"
          >
            <p class="text-[11px] text-muted-foreground font-mono mt-0.5 break-all">
              {status.redirectedDesktop}
            </p>
          </CheckboxLabel>
        {/if}
        {#if status.redirectedPictures}
          <CheckboxLabel
            bind:checked={backupPics}
            disabled={backupBusy}
            icon={ImageIcon}
            label="Pictures"
          >
            <p class="text-[11px] text-muted-foreground font-mono mt-0.5 break-all">
              {status.redirectedPictures}
            </p>
          </CheckboxLabel>
        {/if}
        {#if status.syncFolder}
          <CheckboxLabel
            bind:checked={backupSyncRoot}
            disabled={backupBusy}
            icon={Folder}
            label="Entire OneDrive sync root"
          >
            <p class="text-[11px] text-muted-foreground font-mono mt-0.5 break-all">
              {status.syncFolder}
            </p>
            <p class="text-[10px] text-muted-foreground/70 mt-0.5">
              Includes everything — slow, may be huge.
            </p>
          </CheckboxLabel>
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
  <SectionHeading title="Step 2 — Uninstall" />
  <Card class="card-inset mb-6">
    <div class="px-5 py-4 space-y-3">
      <p class="text-xs text-muted-foreground leading-relaxed">
        Stops OneDrive, runs the official uninstaller, unpins the sidebar entry, and optionally
        cleans up leftovers and blocks future re-installs.
      </p>
      <CheckboxLabel
        bind:checked={removeLeftovers}
        disabled={uninstallBusy}
        label="Remove leftover folders"
      >
        <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
          Deletes <code class="font-mono">%LOCALAPPDATA%\Microsoft\OneDrive</code>,
          <code class="font-mono">%PROGRAMDATA%\Microsoft OneDrive</code> and
          <code class="font-mono">C:\OneDriveTemp</code>.
        </p>
      </CheckboxLabel>
      <CheckboxLabel
        bind:checked={disablePolicy}
        disabled={uninstallBusy}
        label="Block re-install via Group Policy"
      >
        <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
          Sets
          <code class="font-mono">HKLM\Policies\Microsoft\Windows\OneDrive\DisableFileSyncNGSC</code>
          so Windows can't silently re-install it. Reversible by unsetting the value.
        </p>
      </CheckboxLabel>

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
  <InfoBanner tone="warning">
    Explorer will be restarted at the end. Save unsaved work in other windows first.
  </InfoBanner>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={doUninstall}>
      <Trash2 />
      Yes, remove OneDrive
    </Button>
  {/snippet}
</Dialog>
