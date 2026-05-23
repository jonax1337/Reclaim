<script lang="ts">
  import { Card, Button, Badge, Switch, Dialog, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    ShieldCheck,
    ShieldOff,
    Lock,
    Plus,
    X as XIcon,
    Folder,
    Cpu,
    FileType2,
    AlertTriangle,
    Info,
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
  import { cn } from "$lib/utils";
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

  // Per-tab add inputs.
  let pathInput = $state("");
  let processInput = $state("");
  let extensionInput = $state("");
  let addBusy = $state<DefenderExclusionKind | null>(null);

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
      if (picked && typeof picked === "string") pathInput = picked;
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
      if (picked && typeof picked === "string") pathInput = picked;
    } catch (e) {
      toast.error("Could not open file picker", String(e));
    }
  }

  async function addExclusion(kind: DefenderExclusionKind) {
    const value = (kind === "path" ? pathInput : kind === "process" ? processInput : extensionInput)
      .trim();
    if (!value) {
      toast.error("Enter a value first");
      return;
    }
    addBusy = kind;
    try {
      await defenderAddExclusion(kind, value);
      log.success("defender.exclusion.add", value, `Added ${kind} exclusion`);
      toast.success(`Added ${kind} exclusion`);
      if (kind === "path") pathInput = "";
      else if (kind === "process") processInput = "";
      else extensionInput = "";
      invalidate("defender.exclusions");
      await exRes?.refresh();
    } catch (e) {
      toast.error("Add exclusion failed", String(e));
      log.error("defender.exclusion.add", value, "Failed", String(e));
    } finally {
      addBusy = null;
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

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Defender</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Microsoft Defender protection settings, SmartScreen, and scan exclusions.
      {#if refreshing}
        · <span class="text-muted-foreground/70">refreshing…</span>
      {/if}
    </p>
  </div>
  <div class="flex items-center gap-2">
    <Button variant="outline" onclick={reload} disabled={loading || !canFetch}>
      <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  </div>
</header>

{#if isTauri() && admin.checked && !admin.elevated}
  <AdminBanner
    title="Defender configuration needs administrator"
    description="Reading and changing Defender settings requires elevated rights. Click here to relaunch with UAC."
    declinedToast="Defender management requires admin."
  />
{:else if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — Defender needs the built app.
    </div>
  </Card>
{:else if loading && !status}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Querying Defender…
  </div>
{:else if status}
  <!-- Status banner -->
  <div
    class={cn(
      "mb-6 rounded-xl border p-4 flex items-start gap-3",
      status.serviceRunning
        ? "border-success/30 bg-success/[0.06]"
        : "border-destructive/40 bg-destructive/[0.06]",
    )}
  >
    {#if status.serviceRunning}
      <ShieldCheck class="size-5 text-success shrink-0 mt-0.5" />
    {:else}
      <ShieldOff class="size-5 text-destructive shrink-0 mt-0.5" />
    {/if}
    <div class="flex-1">
      <div class="text-sm font-semibold">
        {status.serviceRunning ? "Defender service is running" : "Defender service is stopped"}
      </div>
      <div class="text-xs text-muted-foreground mt-1">
        {#if status.tamperProtection}
          <span class="inline-flex items-center gap-1 mr-3">
            <Lock class="size-3" />
            Tamper Protection on — some changes may be silently rejected
          </span>
        {/if}
        {#if status.managedByPolicy}
          <span class="inline-flex items-center gap-1">
            <AlertTriangle class="size-3 text-amber-500" />
            Managed by Group Policy
          </span>
        {/if}
        {#if !status.tamperProtection && !status.managedByPolicy}
          All toggles are user-controllable.
        {/if}
      </div>
    </div>
    <Badge variant={status.tamperProtection ? "success" : "outline"}>
      Tamper: {status.tamperProtection ? "On" : "Off"}
    </Badge>
  </div>

  <!-- Real-time & protection -->
  <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 mt-2">
    Real-time &amp; protection
  </h2>
  <Card class="overflow-hidden gap-0 py-0 card-inset mb-6">
    {#each REALTIME_TOGGLES as def (def.key)}
      {@const on = isOn(def.key)}
      {@const isBusy = busy.has(def.key)}
      <div
        class={cn(
          "flex items-start gap-3 py-3 px-5 border-b last:border-b-0 transition-colors",
          on ? "bg-primary/[0.04]" : "",
        )}
      >
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
      </div>
    {/each}
  </Card>

  <!-- SmartScreen -->
  <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
    SmartScreen
  </h2>
  <Card class="overflow-hidden gap-0 py-0 card-inset mb-6">
    {#each SMARTSCREEN_TOGGLES as def (def.key)}
      {@const on = isOn(def.key)}
      {@const isBusy = busy.has(def.key)}
      <div
        class={cn(
          "flex items-start gap-3 py-3 px-5 border-b last:border-b-0 transition-colors",
          on ? "bg-primary/[0.04]" : "",
        )}
      >
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
      </div>
    {/each}
  </Card>

  <!-- Exclusions -->
  <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
    Exclusions
  </h2>
  <div
    class="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/[0.06] p-3 flex items-start gap-2 text-xs"
  >
    <Info class="size-4 text-blue-500 shrink-0 mt-0.5" />
    <span class="text-foreground/80 leading-relaxed">
      Files, folders, processes, and extensions added here are skipped by Defender scans.
      Use sparingly — every exclusion is a potential blind spot.
    </span>
  </div>

  <!-- Paths (files + folders) -->
  <Card class="card-inset mb-4">
    <div class="px-5 py-4 flex items-center gap-2 border-b border-foreground/8">
      <Folder class="size-4 text-muted-foreground" />
      <span class="text-sm font-medium">Files &amp; folders</span>
      <Badge variant="outline" class="ml-auto">{exclusions.paths.length}</Badge>
    </div>
    <div class="px-5 py-3 flex flex-wrap gap-2 border-b border-foreground/8">
      <input
        type="text"
        bind:value={pathInput}
        placeholder="C:\path\to\file or folder"
        class="flex-1 min-w-0 h-9 px-3 rounded-md border border-input bg-card text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
        onkeydown={(e) => e.key === "Enter" && addExclusion("path")}
      />
      <Button variant="outline" size="sm" onclick={pickFolder}>Pick folder</Button>
      <Button variant="outline" size="sm" onclick={pickFile}>Pick file</Button>
      <Button size="sm" onclick={() => addExclusion("path")} disabled={addBusy === "path"}>
        {#if addBusy === "path"}
          <Loader2 class="animate-spin" />
        {:else}
          <Plus />
        {/if}
        Add
      </Button>
    </div>
    {#if exclusions.paths.length === 0}
      <div class="px-5 py-8 text-center text-sm text-muted-foreground">
        No path exclusions.
      </div>
    {:else}
      <div>
        {#each exclusions.paths as p (p)}
          {@const isBusy = busy.has(`rm:path:${p}`)}
          <div class="flex items-center gap-3 py-2 px-5 border-b border-foreground/8 last:border-b-0">
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
      </div>
    {/if}
  </Card>

  <!-- Processes -->
  <Card class="card-inset mb-4">
    <div class="px-5 py-4 flex items-center gap-2 border-b border-foreground/8">
      <Cpu class="size-4 text-muted-foreground" />
      <span class="text-sm font-medium">Processes</span>
      <Badge variant="outline" class="ml-auto">{exclusions.processes.length}</Badge>
    </div>
    <div class="px-5 py-3 flex flex-wrap gap-2 border-b border-foreground/8">
      <input
        type="text"
        bind:value={processInput}
        placeholder="myapp.exe"
        class="flex-1 min-w-0 h-9 px-3 rounded-md border border-input bg-card text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
        onkeydown={(e) => e.key === "Enter" && addExclusion("process")}
      />
      <Button
        size="sm"
        onclick={() => addExclusion("process")}
        disabled={addBusy === "process"}
      >
        {#if addBusy === "process"}
          <Loader2 class="animate-spin" />
        {:else}
          <Plus />
        {/if}
        Add
      </Button>
    </div>
    {#if exclusions.processes.length === 0}
      <div class="px-5 py-8 text-center text-sm text-muted-foreground">
        No process exclusions.
      </div>
    {:else}
      <div>
        {#each exclusions.processes as p (p)}
          {@const isBusy = busy.has(`rm:process:${p}`)}
          <div class="flex items-center gap-3 py-2 px-5 border-b border-foreground/8 last:border-b-0">
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
      </div>
    {/if}
  </Card>

  <!-- Extensions -->
  <Card class="card-inset mb-4">
    <div class="px-5 py-4 flex items-center gap-2 border-b border-foreground/8">
      <FileType2 class="size-4 text-muted-foreground" />
      <span class="text-sm font-medium">File extensions</span>
      <Badge variant="outline" class="ml-auto">{exclusions.extensions.length}</Badge>
    </div>
    <div class="px-5 py-3 flex flex-wrap gap-2 border-b border-foreground/8">
      <input
        type="text"
        bind:value={extensionInput}
        placeholder="log (with or without leading dot)"
        class="flex-1 min-w-0 h-9 px-3 rounded-md border border-input bg-card text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
        onkeydown={(e) => e.key === "Enter" && addExclusion("extension")}
      />
      <Button
        size="sm"
        onclick={() => addExclusion("extension")}
        disabled={addBusy === "extension"}
      >
        {#if addBusy === "extension"}
          <Loader2 class="animate-spin" />
        {:else}
          <Plus />
        {/if}
        Add
      </Button>
    </div>
    {#if exclusions.extensions.length === 0}
      <div class="px-5 py-8 text-center text-sm text-muted-foreground">
        No extension exclusions.
      </div>
    {:else}
      <div>
        {#each exclusions.extensions as p (p)}
          {@const isBusy = busy.has(`rm:extension:${p}`)}
          <div class="flex items-center gap-3 py-2 px-5 border-b border-foreground/8 last:border-b-0">
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
      </div>
    {/if}
  </Card>
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
