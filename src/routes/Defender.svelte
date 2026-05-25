<script lang="ts">
  import { Button, Badge, Switch, Dialog, PageHeader, SectionHeading, EmptyState, ListCard, ListRow, FormField, TextInput, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    ShieldCheck,
    ShieldOff,
    Lock,
    Plus,
    X as XIcon,
    AlertTriangle,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import {
    isTauri,
    defenderSetSetting,
    defenderAddExclusion,
    defenderRemoveExclusion,
    type DefenderStatus,
    type DefenderSetting,
    type DefenderExclusionKind,
    type DefenderExclusions,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import {
    defenderStatusResource,
    defenderExclusionsResource,
  } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";

  const canFetch = $derived(isTauri() && admin.checked && admin.elevated);
  const statusRes = $derived(canFetch ? defenderStatusResource() : null);
  const exRes = $derived(canFetch ? defenderExclusionsResource() : null);

  const status = $derived<DefenderStatus | null>(statusRes?.data ?? null);
  const exclusions = $derived<DefenderExclusions>(
    exRes?.data ?? { paths: [], processes: [], extensions: [] },
  );
  const loading = $derived((statusRes?.loading ?? false) || (exRes?.loading ?? false));
  const refreshing = $derived(
    (statusRes?.revalidating ?? false) || (exRes?.revalidating ?? false),
  );

  let busy = $state<Set<string>>(new Set());

  let pendingDisable = $state<{
    setting: DefenderSetting;
    label: string;
    warning: string;
  } | null>(null);
  let confirmOpen = $state(false);

  // Add-exclusion dialog state.
  let addOpen = $state(false);
  let addKind = $state<DefenderExclusionKind>("path");
  let addValue = $state("");
  let addBusy = $state(false);

  function openAdd(kind: DefenderExclusionKind) {
    addKind = kind;
    addValue = "";
    addOpen = true;
  }

  const EXCLUSION_LABELS: Record<DefenderExclusionKind, string> = {
    path: "file or folder",
    process: "process",
    extension: "extension",
  };

  async function reload() {
    if (!canFetch) return;
    invalidate("defender.status");
    invalidate("defender.exclusions");
    await Promise.all([statusRes?.refresh(), exRes?.refresh()]);
  }

  type ToggleDef = {
    key: DefenderSetting;
    label: string;
    description: string;
    /** Shown in confirm dialog when toggling OFF. */
    disableWarning?: string;
    danger?: boolean;
  };

  const REALTIME_TOGGLES: ToggleDef[] = [
    {
      key: "realtime_protection",
      label: "Real-time protection",
      description:
        "Continuous on-access scanning. Defender's core defense — disabling leaves you unprotected against new threats.",
      disableWarning:
        "Real-time protection is your primary defense against malware. Disable only if a trusted security suite has taken over.",
      danger: true,
    },
    {
      key: "cloud_protection",
      label: "Cloud-delivered protection",
      description: "Sends file hashes to Microsoft for faster threat detection (MAPS).",
    },
    {
      key: "sample_submission",
      label: "Automatic sample submission",
      description:
        "Allows Defender to upload suspicious files for analysis. Requires cloud protection.",
    },
    {
      key: "pua_protection",
      label: "Potentially Unwanted App (PUA) blocking",
      description:
        "Flags adware, bundleware, and other low-reputation software during downloads and scans.",
    },
    {
      key: "network_protection",
      label: "Network protection",
      description:
        "Blocks outbound traffic to known malicious domains and IPs at the OS level.",
    },
    {
      key: "controlled_folder_access",
      label: "Controlled folder access",
      description:
        "Anti-ransomware: blocks untrusted apps from modifying protected folders. Can cause false positives.",
    },
  ];

  const SMARTSCREEN_TOGGLES: ToggleDef[] = [
    {
      key: "smartscreen_explorer",
      label: "SmartScreen for Explorer",
      description:
        "Warns before running unrecognized downloads from the web (Mark-of-the-Web).",
    },
    {
      key: "smartscreen_edge",
      label: "SmartScreen for Microsoft Edge",
      description: "Reputation-based URL and download filter inside Edge.",
    },
    {
      key: "smartscreen_store",
      label: "SmartScreen for Store apps",
      description: "Evaluates URLs and content opened by Microsoft Store apps.",
    },
  ];

  function isOn(key: DefenderSetting): boolean {
    if (!status) return false;
    switch (key) {
      case "realtime_protection":
        return status.realtimeProtection;
      case "cloud_protection":
        return status.cloudProtection;
      case "sample_submission":
        return status.sampleSubmission;
      case "pua_protection":
        return status.puaProtection;
      case "network_protection":
        return status.networkProtection;
      case "controlled_folder_access":
        return status.controlledFolderAccess;
      case "smartscreen_explorer":
        return status.smartscreenExplorer;
      case "smartscreen_edge":
        return status.smartscreenEdge;
      case "smartscreen_store":
        return status.smartscreenStore;
    }
  }

  function requestToggle(def: ToggleDef) {
    const current = isOn(def.key);
    const next = !current;
    if (!next && def.disableWarning) {
      pendingDisable = {
        setting: def.key,
        label: def.label,
        warning: def.disableWarning,
      };
      confirmOpen = true;
      return;
    }
    void applyToggle(def.key, next);
  }

  async function applyToggle(key: DefenderSetting, next: boolean) {
    if (busy.has(key)) return;
    const before = isOn(key);
    busy = new Set(busy).add(key);
    try {
      await defenderSetSetting(key, next);
      // Refresh status to confirm — some toggles silently revert if a policy
      // is in force, so we don't trust our optimistic value.
      invalidate("defender.status");
      await statusRes?.refresh();
      const after = isOn(key);
      if (after !== next) {
        toast.warning(
          "Setting did not change",
          status?.managedByPolicy
            ? "A Group Policy is enforcing this setting."
            : "Defender refused the change — Tamper Protection may be active.",
        );
        log.warn("defender.toggle", key, `Toggle to ${next ? "on" : "off"} ignored`);
      } else {
        log.success(
          "defender.toggle",
          key,
          `${before ? "on" : "off"} → ${next ? "on" : "off"}`,
        );
        toast.success(`${key.replace(/_/g, " ")}: ${next ? "on" : "off"}`);
      }
    } catch (e) {
      toast.error("Defender change failed", String(e));
      log.error("defender.toggle", key, "Toggle failed", String(e));
    } finally {
      const after = new Set(busy);
      after.delete(key);
      busy = after;
    }
  }

  async function confirmDisable() {
    if (!pendingDisable) return;
    const { setting } = pendingDisable;
    confirmOpen = false;
    pendingDisable = null;
    await applyToggle(setting, false);
  }

  async function pickFolder() {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose folder to exclude",
      });
      if (picked && typeof picked === "string") addValue = picked;
    } catch (e) {
      toast.error("Could not open folder picker", String(e));
    }
  }

  async function pickFile() {
    try {
      const picked = await openDialog({
        directory: false,
        multiple: false,
        title: "Choose file to exclude",
      });
      if (picked && typeof picked === "string") addValue = picked;
    } catch (e) {
      toast.error("Could not open file picker", String(e));
    }
  }

  async function submitAdd() {
    const value = addValue.trim();
    if (!value) {
      toast.error("Enter a value first");
      return;
    }
    addBusy = true;
    try {
      await defenderAddExclusion(addKind, value);
      log.success("defender.exclusion.add", value, `Added ${addKind} exclusion`);
      toast.success(`Added ${addKind} exclusion`);
      addOpen = false;
      addValue = "";
      invalidate("defender.exclusions");
      await exRes?.refresh();
    } catch (e) {
      toast.error("Add exclusion failed", String(e));
      log.error("defender.exclusion.add", value, "Failed", String(e));
    } finally {
      addBusy = false;
    }
  }

  async function removeExclusion(kind: DefenderExclusionKind, value: string) {
    const id = `rm:${kind}:${value}`;
    if (busy.has(id)) return;
    busy = new Set(busy).add(id);
    try {
      await defenderRemoveExclusion(kind, value);
      log.success("defender.exclusion.remove", value, `Removed ${kind} exclusion`);
      invalidate("defender.exclusions");
      await exRes?.refresh();
    } catch (e) {
      toast.error("Remove failed", String(e));
      log.error("defender.exclusion.remove", value, "Failed", String(e));
    } finally {
      const after = new Set(busy);
      after.delete(id);
      busy = after;
    }
  }
</script>

<PageHeader title="Defender">
  {#snippet actions()}
    <Button variant="outline" onclick={reload} disabled={loading || !canFetch}>
      <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  {/snippet}
  Microsoft Defender protection settings, SmartScreen, and scan exclusions.
  {#if refreshing}
    · <span class="text-muted-foreground/70">refreshing…</span>
  {/if}
</PageHeader>

{#if isTauri() && admin.checked && !admin.elevated}
  <AdminBanner
    title="Defender configuration needs administrator"
    description="Reading and changing Defender settings requires elevated rights. Click here to relaunch with UAC."
    declinedToast="Defender management requires admin."
  />
{:else if !isTauri()}
  <EmptyState>Browser preview — Defender needs the built app.</EmptyState>
{:else if loading && !status}
  <EmptyState loading>Querying Defender…</EmptyState>
{:else if status}
  <!-- Service status line -->
  <div class="mb-6 flex flex-wrap items-center gap-2 text-xs">
    {#if status.serviceRunning}
      <Badge variant="success">
        <ShieldCheck class="size-2.5" />
        Service running
      </Badge>
    {:else}
      <Badge variant="destructive">
        <ShieldOff class="size-2.5" />
        Service stopped
      </Badge>
    {/if}
    {#if status.tamperProtection}
      <Badge variant="warning">
        <Lock class="size-2.5" />
        Tamper Protection on
      </Badge>
    {/if}
    {#if status.managedByPolicy}
      <Badge variant="warning">
        <AlertTriangle class="size-2.5" />
        Managed by Group Policy
      </Badge>
    {/if}
    {#if status.tamperProtection || status.managedByPolicy}
      <span class="text-muted-foreground">— some changes may be silently rejected.</span>
    {/if}
  </div>

  <!-- Real-time & protection -->
  <SectionHeading title="Real-time & protection" />
  <ListCard class="mb-6">
    {#each REALTIME_TOGGLES as def (def.key)}
      {@const on = isOn(def.key)}
      {@const isBusy = busy.has(def.key)}
      <ListRow density="md">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium">{def.label}</span>
            {#if def.danger}
              <Badge variant="warning">
                <AlertTriangle class="size-2.5" />
                Critical
              </Badge>
            {/if}
          </div>
          <p class="text-xs text-muted-foreground mt-1 leading-relaxed">{def.description}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0 pt-0.5">
          {#if isBusy}
            <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
          {/if}
          <Switch
            checked={on}
            disabled={isBusy}
            onCheckedChange={() => requestToggle(def)}
          />
        </div>
      </ListRow>
    {/each}
  </ListCard>

  <!-- SmartScreen -->
  <SectionHeading title="SmartScreen" />
  <ListCard class="mb-6">
    {#each SMARTSCREEN_TOGGLES as def (def.key)}
      {@const on = isOn(def.key)}
      {@const isBusy = busy.has(def.key)}
      <ListRow density="md">
        <div class="flex-1 min-w-0">
          <span class="text-sm font-medium">{def.label}</span>
          <p class="text-xs text-muted-foreground mt-1 leading-relaxed">{def.description}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0 pt-0.5">
          {#if isBusy}
            <Loader2 class="size-3.5 animate-spin text-muted-foreground" />
          {/if}
          <Switch
            checked={on}
            disabled={isBusy}
            onCheckedChange={() => requestToggle(def)}
          />
        </div>
      </ListRow>
    {/each}
  </ListCard>

  <!-- Exclusions -->
  <SectionHeading
    title="Scan exclusions"
    description="Files, folders, processes, and extensions added here are skipped by Defender scans. Use sparingly — every exclusion is a potential blind spot."
  />

  <!-- Files & folders -->
  <ListCard class="mb-4">
    <div class="flex items-center gap-2 px-5 py-3 border-b border-hairline">
      <span class="text-sm font-medium">Files &amp; folders</span>
      <Badge variant="outline">{exclusions.paths.length}</Badge>
      <Button size="sm" variant="outline" class="ml-auto" onclick={() => openAdd("path")}>
        <Plus />
        Add
      </Button>
    </div>
    {#if exclusions.paths.length === 0}
      <div class="px-5 py-6 text-center text-xs text-muted-foreground">
        No path exclusions.
      </div>
    {:else}
      {#each exclusions.paths as p (p)}
        {@const isBusy = busy.has(`rm:path:${p}`)}
        <div class="flex items-center gap-3 py-2.5 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors">
          <span class="text-sm font-mono truncate flex-1" title={p}>{p}</span>
          <Button
            size="sm"
            variant="outline"
            onclick={() => removeExclusion("path", p)}
            disabled={isBusy}
          >
            {#if isBusy}
              <Loader2 class="animate-spin" />
            {:else}
              <XIcon />
            {/if}
            Remove
          </Button>
        </div>
      {/each}
    {/if}
  </ListCard>

  <!-- Processes -->
  <ListCard class="mb-4">
    <div class="flex items-center gap-2 px-5 py-3 border-b border-hairline">
      <span class="text-sm font-medium">Processes</span>
      <Badge variant="outline">{exclusions.processes.length}</Badge>
      <Button size="sm" variant="outline" class="ml-auto" onclick={() => openAdd("process")}>
        <Plus />
        Add
      </Button>
    </div>
    {#if exclusions.processes.length === 0}
      <div class="px-5 py-6 text-center text-xs text-muted-foreground">
        No process exclusions.
      </div>
    {:else}
      {#each exclusions.processes as p (p)}
        {@const isBusy = busy.has(`rm:process:${p}`)}
        <div class="flex items-center gap-3 py-2.5 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors">
          <span class="text-sm font-mono truncate flex-1" title={p}>{p}</span>
          <Button
            size="sm"
            variant="outline"
            onclick={() => removeExclusion("process", p)}
            disabled={isBusy}
          >
            {#if isBusy}
              <Loader2 class="animate-spin" />
            {:else}
              <XIcon />
            {/if}
            Remove
          </Button>
        </div>
      {/each}
    {/if}
  </ListCard>

  <!-- Extensions -->
  <ListCard class="mb-4">
    <div class="flex items-center gap-2 px-5 py-3 border-b border-hairline">
      <span class="text-sm font-medium">File extensions</span>
      <Badge variant="outline">{exclusions.extensions.length}</Badge>
      <Button size="sm" variant="outline" class="ml-auto" onclick={() => openAdd("extension")}>
        <Plus />
        Add
      </Button>
    </div>
    {#if exclusions.extensions.length === 0}
      <div class="px-5 py-6 text-center text-xs text-muted-foreground">
        No extension exclusions.
      </div>
    {:else}
      {#each exclusions.extensions as p (p)}
        {@const isBusy = busy.has(`rm:extension:${p}`)}
        <div class="flex items-center gap-3 py-2.5 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors">
          <span class="text-sm font-mono truncate flex-1" title={p}>.{p}</span>
          <Button
            size="sm"
            variant="outline"
            onclick={() => removeExclusion("extension", p)}
            disabled={isBusy}
          >
            {#if isBusy}
              <Loader2 class="animate-spin" />
            {:else}
              <XIcon />
            {/if}
            Remove
          </Button>
        </div>
      {/each}
    {/if}
  </ListCard>
{/if}

<Dialog
  bind:open={confirmOpen}
  title={pendingDisable ? `Disable ${pendingDisable.label}?` : ""}
  description={pendingDisable?.warning ?? ""}
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
    <Button variant="destructive" onclick={confirmDisable}>
      <ShieldOff />
      Disable anyway
    </Button>
  {/snippet}
</Dialog>

<Dialog
  bind:open={addOpen}
  title="Add {EXCLUSION_LABELS[addKind]} exclusion"
  description={addKind === "path"
    ? "Defender will skip scanning this file or folder. Use sparingly — every exclusion is a potential blind spot."
    : addKind === "process"
      ? "Defender will skip files opened by this executable. Use sparingly."
      : "Defender will skip files with this extension across all drives. Use sparingly."}
>
  <div class="space-y-3">
    <FormField
      label={addKind === "path" ? "Path" : addKind === "process" ? "Executable name" : "Extension"}
    >
      <TextInput
        bind:value={addValue}
        mono
        placeholder={addKind === "path"
          ? "C:\\path\\to\\file or folder"
          : addKind === "process"
            ? "myapp.exe"
            : "log (with or without leading dot)"}
      />
    </FormField>
    {#if addKind === "path"}
      <div class="flex gap-2">
        <Button variant="outline" size="sm" onclick={pickFolder} disabled={addBusy}>
          Pick folder…
        </Button>
        <Button variant="outline" size="sm" onclick={pickFile} disabled={addBusy}>
          Pick file…
        </Button>
      </div>
    {/if}
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (addOpen = false)} disabled={addBusy}>Cancel</Button>
    <Button onclick={submitAdd} disabled={addBusy || !addValue.trim()}>
      {#if addBusy}
        <Loader2 class="animate-spin" />
      {:else}
        <Plus />
      {/if}
      Add exclusion
    </Button>
  {/snippet}
</Dialog>
