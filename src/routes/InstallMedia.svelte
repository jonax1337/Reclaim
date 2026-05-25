<script lang="ts">
  import {
    Card, CardContent, Button, Badge, Switch, Checkbox, Dialog,
    Select, PageHeader, SectionHeading, InfoBanner, MetricBar, FormField, TextInput, TextLink, SelectableTile, toast,
  } from "$lib/ui";
  import {
    Save, Loader2, Eye, AlertTriangle, ShieldOff, FolderOpen,
    Play, CheckCircle2, XCircle, ExternalLink, Terminal as TerminalIcon,
    Download, RefreshCw, Usb, Zap, HardDrive, Plus, Sparkles, Wrench,
    UserCircle2,
  } from "@lucide/svelte";
  import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { onDestroy } from "svelte";

  import {
    isTauri, generateAutounattendXml, generateSetupCompleteCmd, saveAutounattendXml,
    isoCheckTools, downloadAdkSetup, launchAdkInstaller, listUsbDrives,
    type IsoTools, type UnattendConfig, type UsbDrive,
  } from "$lib/tweaks/bridge";
  import { tasks, runIsoBuildTask, runUsbFlashTask } from "$lib/tasks.svelte";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { cn } from "$lib/utils";

  import XmlPreviewDialog from "$lib/components/XmlPreviewDialog.svelte";
  import ProfileIcon from "$lib/components/ProfileIcon.svelte";
  import { PROFILES, type Profile } from "$lib/tweaks/profiles";
  import { customProfiles } from "$lib/tweaks/customProfiles.svelte";

  import { simple, buildSimpleConfig, SIMPLE_LOCALES } from "$lib/tasksequence/simpleStore.svelte";
  import { sequence } from "$lib/tasksequence/store.svelte";
  import { TEMPLATES } from "$lib/tasksequence/templates";
  import { STEP_LABELS, STEP_DESCRIPTIONS, type StepType } from "$lib/tasksequence/types";
  import { convertSequence } from "$lib/tasksequence/toUnattend";
  import StepCard from "$lib/tasksequence/StepCard.svelte";
  import MetaStep from "$lib/tasksequence/steps/MetaStep.svelte";
  import BypassStep from "$lib/tasksequence/steps/BypassStep.svelte";
  import EditionStep from "$lib/tasksequence/steps/EditionStep.svelte";
  import OobeSkipStep from "$lib/tasksequence/steps/OobeSkipStep.svelte";
  import PrivacyStep from "$lib/tasksequence/steps/PrivacyStep.svelte";
  import DiskSetupStep from "$lib/tasksequence/steps/DiskSetupStep.svelte";
  import DriverInjectStep from "$lib/tasksequence/steps/DriverInjectStep.svelte";
  import DebloatAppxStep from "$lib/tasksequence/steps/DebloatAppxStep.svelte";
  import RegTweaksStep from "$lib/tasksequence/steps/RegTweaksStep.svelte";
  import AppsInstallStep from "$lib/tasksequence/steps/AppsInstallStep.svelte";
  import CustomCmdStep from "$lib/tasksequence/steps/CustomCmdStep.svelte";

  // ─── Mode derived helpers ────────────────────────────────────────────────
  const isAdvanced = $derived(simple.state.mode === "advanced");

  // ─── Profiles list (built-in + custom) ──────────────────────────────────
  const allProfiles = $derived<Profile[]>([...PROFILES, ...customProfiles.items]);
  const builtIn = $derived(allProfiles.filter((p) => !p.custom));
  const customList = $derived(allProfiles.filter((p) => !!p.custom));
  const selectedProfile = $derived<Profile | undefined>(
    allProfiles.find((p) => p.id === simple.state.profileId),
  );
  const currentLocale = $derived(
    SIMPLE_LOCALES.find((l) => l.id === simple.state.localeId) ?? SIMPLE_LOCALES[0],
  );

  // Counts for display
  const profileSummary = $derived(() => {
    if (!selectedProfile) return { regTweaks: 0, appxPatterns: 0 };
    const cfg = buildSimpleConfig(simple.state, allProfiles);
    return { regTweaks: cfg.registry_tweaks.length, appxPatterns: cfg.debloat_appx_patterns.length };
  });

  const selectedTemplate = $derived(
    TEMPLATES.find((t) => t.id === (sequence.current.templateId ?? "blank")),
  );
  const advancedSummary = $derived(() => {
    const cfg = convertSequence(sequence.current).config;
    return { regTweaks: cfg.registry_tweaks.length, appxPatterns: cfg.debloat_appx_patterns.length };
  });
  const activeStepCount = $derived(sequence.current.steps.filter((s) => s.enabled).length);
  const totalStepCount = $derived(sequence.current.steps.length);

  // ─── Unattend config + setupcomplete (resolved from current mode) ────────
  function currentConfig(): UnattendConfig {
    if (isAdvanced) return convertSequence(sequence.current).config;
    return buildSimpleConfig(simple.state, allProfiles);
  }

  // ─── Local action state (shared) ────────────────────────────────────────
  let xmlPreview = $state("");
  let previewOpen = $state(false);
  let saving = $state(false);
  let generating = $state(false);

  let isoTools = $state<IsoTools | null>(null);
  let inputIsoPath = $state("");
  let outputIsoPath = $state("");
  let buildBusy = $state(false);
  let lastBuiltIso = $state("");

  let usbDrives = $state<UsbDrive[]>([]);
  let usbDrivesLoading = $state(false);
  let usbDrivesError = $state<string | null>(null);
  let selectedDiskNumber = $state<number | null>(null);
  let flashIsoPath = $state("");
  let includeUnattendOnFlash = $state(true);
  let flashConfirmOpen = $state(false);
  let flashStarting = $state(false);

  let adkDownloading = $state(false);
  let adkDownloadedBytes = $state(0);
  let adkTotalBytes = $state(0);
  let adkLaunched = $state(false);
  let adkRechecking = $state(false);

  let unlistenProgress: UnlistenFn | null = null;
  let unlistenDone: UnlistenFn | null = null;

  $effect(() => {
    if (!isTauri()) return;
    isoCheckTools().then((t) => (isoTools = t)).catch(() => {});
    refreshUsbDrives();
    listen<{ downloaded: number; total: number }>("adk-download:progress", (e) => {
      adkDownloadedBytes = e.payload.downloaded;
      adkTotalBytes = e.payload.total;
    }).then((u) => (unlistenProgress = u));
    listen("adk-download:done", () => { adkDownloading = false; }).then((u) => (unlistenDone = u));
  });
  onDestroy(() => { unlistenProgress?.(); unlistenDone?.(); });

  const adkPercent = $derived(
    adkTotalBytes > 0 ? Math.min(100, Math.round((adkDownloadedBytes / adkTotalBytes) * 100)) : 0,
  );

  // ─── XML / build / flash actions ─────────────────────────────────────────
  async function generatePreview() {
    if (!isTauri()) { toast.error("Browser preview", "XML generation needs the Tauri runtime."); return; }
    generating = true;
    try {
      xmlPreview = await generateAutounattendXml(currentConfig());
      previewOpen = true;
    } catch (e) { toast.error("Generation failed", String(e)); }
    finally { generating = false; }
  }
  async function saveXml() {
    if (!isTauri()) { toast.error("Browser preview", "Saving needs the Tauri runtime."); return; }
    saving = true;
    try {
      const xml = await generateAutounattendXml(currentConfig());
      const dest = await saveDialog({
        defaultPath: "autounattend.xml",
        filters: [{ name: "Autounattend XML", extensions: ["xml"] }],
      });
      if (!dest) { saving = false; return; }
      await saveAutounattendXml(dest, xml);
      log.success("iso.unattend.save", "Install media", `Wrote autounattend.xml to ${dest}`);
      toast.success("Saved", `Wrote ${dest}`);
    } catch (e) { toast.error("Save failed", String(e)); }
    finally { saving = false; }
  }

  async function installAdkAuto() {
    if (!isTauri()) return;
    adkDownloading = true; adkLaunched = false;
    adkDownloadedBytes = 0; adkTotalBytes = 0;
    try {
      const setupPath = await downloadAdkSetup();
      await launchAdkInstaller(setupPath);
      adkLaunched = true;
      toast.success("ADK installer launched", "Complete the wizard, then click Re-check.");
    } catch (e) { toast.error("ADK setup failed", String(e)); }
    finally { adkDownloading = false; }
  }
  async function recheckAdk() {
    if (!isTauri()) return;
    adkRechecking = true;
    try {
      isoTools = await isoCheckTools();
      if (isoTools.ready) { adkLaunched = false; toast.success("Deployment Tools detected", "Ready to build ISOs."); }
      else { toast.warning("Still not detected", "If the installer is still running, wait."); }
    } catch (e) { toast.error("Re-check failed", String(e)); }
    finally { adkRechecking = false; }
  }
  async function pickInputIso() {
    try {
      const picked = await openDialog({ multiple: false, directory: false, filters: [{ name: "Windows ISO", extensions: ["iso"] }] });
      if (typeof picked === "string") inputIsoPath = picked;
    } catch (e) { toast.error("Pick failed", String(e)); }
  }
  async function pickOutputIso() {
    try {
      const picked = await saveDialog({ defaultPath: "reclaim-win11.iso", filters: [{ name: "Windows ISO", extensions: ["iso"] }] });
      if (picked) outputIsoPath = picked;
    } catch (e) { toast.error("Pick failed", String(e)); }
  }
  async function buildIso() {
    if (!isTauri()) { toast.error("Browser preview", "ISO build needs the Tauri runtime."); return; }
    if (!inputIsoPath || !outputIsoPath) { toast.error("Missing paths", "Pick both an input and an output ISO."); return; }
    if (!isoTools?.ready) { toast.error("oscdimg missing", "Install the Windows ADK Deployment Tools first."); return; }
    buildBusy = true;
    try {
      const cfg = currentConfig();
      const xml = await generateAutounattendXml(cfg);
      const setupcomplete = await generateSetupCompleteCmd(cfg);
      tasks.panelOpen = true;
      await runIsoBuildTask(inputIsoPath, outputIsoPath, xml, setupcomplete || null);
      log.success("iso.unattend.save", "Install media", `Built ${outputIsoPath} from ${inputIsoPath}`);
      lastBuiltIso = outputIsoPath;
      if (!flashIsoPath) flashIsoPath = outputIsoPath;
    } catch (e) { toast.error("Build failed", String(e)); }
    finally { buildBusy = false; }
  }
  async function refreshUsbDrives() {
    if (!isTauri()) return;
    usbDrivesLoading = true; usbDrivesError = null;
    try {
      const drives = await listUsbDrives();
      usbDrives = drives;
      if (selectedDiskNumber !== null && !drives.some((d) => d.diskNumber === selectedDiskNumber)) {
        selectedDiskNumber = null;
      }
    } catch (e) { usbDrivesError = String(e); usbDrives = []; }
    finally { usbDrivesLoading = false; }
  }
  async function pickFlashIso() {
    try {
      const picked = await openDialog({ multiple: false, directory: false, filters: [{ name: "Windows ISO", extensions: ["iso"] }] });
      if (typeof picked === "string") flashIsoPath = picked;
    } catch (e) { toast.error("Pick failed", String(e)); }
  }
  const selectedDrive = $derived<UsbDrive | undefined>(
    selectedDiskNumber === null ? undefined : usbDrives.find((d) => d.diskNumber === selectedDiskNumber),
  );
  const flashRunning = $derived(tasks.hasRunning("usb-flash"));
  const buildRunning = $derived(tasks.hasRunning("iso-build"));
  const canStartFlash = $derived(
    !!flashIsoPath && selectedDiskNumber !== null && !flashStarting && !flashRunning && isTauri(),
  );
  function openFlashConfirm() { if (canStartFlash) flashConfirmOpen = true; }
  async function flashUsb() {
    if (!isTauri()) { toast.error("Browser preview", "Flashing needs the Tauri runtime."); return; }
    if (selectedDiskNumber === null || !flashIsoPath) return;
    const drive = selectedDrive;
    if (!drive) { toast.error("Drive missing", "Refresh and try again."); return; }
    flashConfirmOpen = false;
    flashStarting = true;
    try {
      const cfg = currentConfig();
      const xml = includeUnattendOnFlash ? await generateAutounattendXml(cfg) : null;
      const setupcomplete = includeUnattendOnFlash ? (await generateSetupCompleteCmd(cfg)) || null : null;
      tasks.panelOpen = true;
      const label = `${drive.friendlyName || drive.model || "USB"} · ${formatBytes(drive.sizeBytes)}`;
      await runUsbFlashTask(flashIsoPath, drive.diskNumber, label, xml, setupcomplete);
      log.success("iso.usb.flash", "Install media", `Flashed ${flashIsoPath} → disk ${drive.diskNumber}`);
    } catch (e) { toast.error("Flash failed", String(e)); }
    finally { flashStarting = false; }
  }
  function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "—";
    const gb = n / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
    return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  }

  // ─── Advanced mode helpers (only used when isAdvanced) ───────────────────
  const STEP_TYPES: StepType[] = [
    "meta", "bypass", "edition", "oobe-skip", "privacy",
    "disk-setup", "driver-inject", "debloat-appx", "reg-tweaks",
    "apps-install", "custom-cmd",
  ];
  let addOpen = $state(false);
  let dragIndex = $state<number | null>(null);
  function onDragStart(idx: number) { return (e: DragEvent) => { dragIndex = idx; if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }; }
  function onDragOver(_idx: number) { return (_: DragEvent) => {}; }
  function onDrop(idx: number) { return (_: DragEvent) => {
    if (dragIndex !== null && dragIndex !== idx) sequence.reorder(dragIndex, idx);
    dragIndex = null;
  }; }
  function onDragEnd() { dragIndex = null; }

  const fieldClass = "h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring";
</script>

<PageHeader title="Install media">
  {#snippet actions()}
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        onclick={() => simple.update({ mode: isAdvanced ? "simple" : "advanced" })}
      >
        <Wrench class="size-4" />
        {isAdvanced ? "Simple" : "Advanced"}
      </Button>
      <Button variant="outline" onclick={generatePreview} disabled={generating || !isTauri()}>
        {#if generating}<Loader2 class="size-4 animate-spin" />{:else}<Eye class="size-4" />{/if}
        Preview XML
      </Button>
      <Button onclick={saveXml} disabled={saving || !isTauri()}>
        {#if saving}<Loader2 class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if}
        Save XML
      </Button>
    </div>
  {/snippet}
  {#if !isAdvanced}
    Pick a profile, set a couple of options, click <strong>Build ISO</strong> or
    <strong>Flash USB</strong>. Everything else is sane defaults — switch to
    <strong>Advanced</strong> if you need full per-step control.
  {:else}
    Compose your Windows install pipeline as an ordered Task Sequence. Each enabled step
    is emitted into the autounattend.xml at the right Setup hook. Switch back to
    <strong>Simple</strong> for one-click profile-based builds.
  {/if}
</PageHeader>

{#if !isAdvanced}
  <!-- ═══════════════════════════════════════════════════════════════════════
       SIMPLE MODE
       ═══════════════════════════════════════════════════════════════════════ -->

  <!-- ─── Profile ──────────────────────────────────────────────────────────── -->
  <SectionHeading title="Profile" />
  <Card class="card-inset mb-6">
    <CardContent>
      <div class="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4 items-start">
        <FormField label="Profile (debloat + tweak source)">
          <Select.Root
            type="single"
            value={simple.state.profileId}
            onValueChange={(v) => simple.update({ profileId: v })}
          >
            <Select.Trigger>
              <span>{selectedProfile?.name ?? "Pick a profile"}</span>
            </Select.Trigger>
            <Select.Content>
              {#if builtIn.length > 0}
                <Select.Group>
                  <Select.Label>Built-in profiles</Select.Label>
                  {#each builtIn as p (p.id)}
                    <Select.Item value={p.id} label={p.name}>{p.name}</Select.Item>
                  {/each}
                </Select.Group>
              {/if}
              {#if customList.length > 0}
                <Select.Group>
                  <Select.Label>Custom profiles</Select.Label>
                  {#each customList as p (p.id)}
                    <Select.Item value={p.id} label={p.name}>{p.name}</Select.Item>
                  {/each}
                </Select.Group>
              {/if}
            </Select.Content>
          </Select.Root>
        </FormField>

        {#if selectedProfile}
          <div class="flex items-start gap-3 p-3 rounded-md bg-surface-2 border border-hairline">
            <ProfileIcon name={selectedProfile.gradient} class="size-10 shrink-0 text-primary" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{selectedProfile.name}</span>
                {#if selectedProfile.custom}
                  <Badge variant="outline" class="text-[10px] px-1.5 py-0">Custom</Badge>
                {/if}
              </div>
              <div class="text-xs text-muted-foreground">{selectedProfile.tagline}</div>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" class="text-[10px]">
                  {profileSummary().regTweaks} reg tweaks
                </Badge>
                <Badge variant="secondary" class="text-[10px]">
                  {profileSummary().appxPatterns} AppX removals
                </Badge>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </CardContent>
  </Card>

  <!-- ─── Quick options ───────────────────────────────────────────────────── -->
  <SectionHeading title="Quick options" />
  <Card class="card-inset mb-6">
    <CardContent>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Locale">
          <Select.Root
            type="single"
            value={simple.state.localeId}
            onValueChange={(v) => simple.update({ localeId: v })}
          >
            <Select.Trigger><span>{currentLocale.label}</span></Select.Trigger>
            <Select.Content>
              {#each SIMPLE_LOCALES as l (l.id)}
                <Select.Item value={l.id} label={l.label}>{l.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </FormField>
        <div></div>

        <FormField label="Local username">
          <TextInput
            value={simple.state.username}
            oninput={(e) => simple.update({ username: (e.currentTarget as HTMLInputElement).value })}
          />
        </FormField>
        <FormField label="Password (empty = Setup asks)">
          <TextInput
            value={simple.state.password}
            placeholder="Set one to skip the account screen"
            oninput={(e) => simple.update({ password: (e.currentTarget as HTMLInputElement).value })}
          />
        </FormField>

        <div class="md:col-span-2 flex items-center justify-between px-3 py-2.5 rounded-md bg-surface-2 border border-hairline">
          <div class="flex items-center gap-2 min-w-0">
            <UserCircle2 class="size-4 text-muted-foreground shrink-0" />
            <div class="min-w-0">
              <div class="text-sm font-medium">Fully automated install</div>
              <div class="text-xs text-muted-foreground">
                Wipes disk {simple.state.targetDiskNumber} during install (no confirmation), uses default password
                <code class="px-1 rounded bg-foreground/10 font-mono text-[11px]">Reclaim!</code>
                if empty, enables auto-logon. Walk-away install.
              </div>
            </div>
          </div>
          <Switch checked={simple.state.fullyAutomated}
            onCheckedChange={(v) => simple.update({ fullyAutomated: v })} />
        </div>

        {#if simple.state.fullyAutomated}
          <div class="md:col-span-2 flex items-start gap-3 px-3 py-2.5 rounded-md border bg-red-500/10 border-red-500/30">
            <AlertTriangle class="size-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
            <div class="text-xs text-foreground/90 flex-1">
              Setup will wipe <strong>Disk {simple.state.targetDiskNumber}</strong> without confirming. Make sure that's the disk you want — wrong number = data loss.
            </div>
            <label class="flex items-center gap-2 text-xs">
              Disk #
              <input type="number" min="0" max="32" class={cn(fieldClass, "w-16 font-mono h-7")}
                value={simple.state.targetDiskNumber}
                oninput={(e) => simple.update({ targetDiskNumber: parseInt((e.currentTarget as HTMLInputElement).value, 10) || 0 })} />
            </label>
          </div>
        {/if}
      </div>
    </CardContent>
  </Card>
{:else}
  <!-- ═══════════════════════════════════════════════════════════════════════
       ADVANCED MODE — Task Sequence editor
       ═══════════════════════════════════════════════════════════════════════ -->

  <SectionHeading title="Template" />
  <Card class="card-inset mb-6">
    <CardContent>
      <div class="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4 items-start">
        <FormField label="Template (preset task sequence)">
          <Select.Root
            type="single"
            value={sequence.current.templateId ?? "blank"}
            onValueChange={(v) => sequence.loadTemplate(v)}
          >
            <Select.Trigger>
              <span>{selectedTemplate?.name ?? "Pick a template"}</span>
            </Select.Trigger>
            <Select.Content>
              {#each TEMPLATES as t (t.id)}
                <Select.Item value={t.id} label={t.name}>{t.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </FormField>

        {#if selectedTemplate}
          <div class="flex items-start gap-3 p-3 rounded-md bg-surface-2 border border-hairline">
            <Sparkles class="size-10 shrink-0 text-primary" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{selectedTemplate.name}</span>
              </div>
              <div class="text-xs text-muted-foreground">{selectedTemplate.description}</div>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" class="text-[10px]">
                  {activeStepCount} / {totalStepCount} steps active
                </Badge>
                <Badge variant="secondary" class="text-[10px]">
                  {advancedSummary().regTweaks} reg tweaks
                </Badge>
                <Badge variant="secondary" class="text-[10px]">
                  {advancedSummary().appxPatterns} AppX removals
                </Badge>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </CardContent>
  </Card>

  <SectionHeading title="Task sequence" />
  <div role="list" class="space-y-2 mb-3">
    {#each sequence.current.steps as step, idx (step.id)}
      <StepCard
        title={step.title}
        description={STEP_DESCRIPTIONS[step.type]}
        enabled={step.enabled}
        dragging={dragIndex === idx}
        onEnabledChange={(v) => sequence.toggleStep(step.id, v)}
        onDelete={() => sequence.removeStep(step.id)}
        onDragStart={onDragStart(idx)}
        onDragOver={onDragOver(idx)}
        onDrop={onDrop(idx)}
        onDragEnd={onDragEnd}
      >
        {#if step.type === "meta"}<MetaStep id={step.id} config={step.config} />
        {:else if step.type === "bypass"}<BypassStep id={step.id} config={step.config} />
        {:else if step.type === "edition"}<EditionStep id={step.id} config={step.config} />
        {:else if step.type === "oobe-skip"}<OobeSkipStep id={step.id} config={step.config} />
        {:else if step.type === "privacy"}<PrivacyStep id={step.id} config={step.config} />
        {:else if step.type === "disk-setup"}<DiskSetupStep id={step.id} config={step.config} />
        {:else if step.type === "driver-inject"}<DriverInjectStep id={step.id} config={step.config} />
        {:else if step.type === "debloat-appx"}<DebloatAppxStep id={step.id} config={step.config} />
        {:else if step.type === "reg-tweaks"}<RegTweaksStep id={step.id} config={step.config} />
        {:else if step.type === "apps-install"}<AppsInstallStep id={step.id} config={step.config} />
        {:else if step.type === "custom-cmd"}<CustomCmdStep id={step.id} config={step.config} />
        {/if}
      </StepCard>
    {/each}
  </div>

  <div class="mb-6">
    <Button variant="outline" onclick={() => (addOpen = true)}>
      <Plus class="size-4" />
      Add step
    </Button>
  </div>

  <Dialog bind:open={addOpen} title="Add a step" description="Steps run in Windows-Setup phase order automatically — reordering only affects multiple custom commands at the same hook.">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
      {#each STEP_TYPES as t (t)}
        {@const disabled = !sequence.canAddType(t)}
        <button type="button"
          {disabled}
          onclick={() => { sequence.addStep(t); addOpen = false; }}
          class={cn(
            "flex flex-col items-start gap-1 px-3 py-2.5 rounded-md text-left border transition-colors",
            disabled
              ? "border-hairline bg-surface-1 opacity-50 cursor-not-allowed"
              : "border-hairline bg-surface-1 hover:bg-primary/[0.06] hover:border-primary/30",
          )}
        >
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium">{STEP_LABELS[t]}</span>
            {#if disabled}
              <Badge variant="outline" class="text-[9px] px-1.5 py-0">Already added</Badge>
            {/if}
          </div>
          <div class="text-[11px] text-muted-foreground">{STEP_DESCRIPTIONS[t]}</div>
        </button>
      {/each}
    </div>
  </Dialog>
{/if}

<!-- ─── Build full ISO ───────────────────────────────────────────────────── -->
<SectionHeading title="Build full ISO">
  {#snippet inline()}
    <span class="normal-case font-normal text-muted-foreground/60"> (optional)</span>
  {/snippet}
</SectionHeading>
<Card class="card-inset mb-6">
  <CardContent class="space-y-4">
    <p class="text-xs text-muted-foreground">
      Take an existing Windows 11 ISO, inject autounattend.xml + setupcomplete.cmd, repack as bootable hybrid ISO. Requires Windows ADK Deployment Tools.
    </p>
    <InfoBanner
      tone={isoTools === null ? "info" : isoTools.ready ? "success" : "warning"}
      size="xs"
      icon={isoTools === null ? Loader2 : isoTools.ready ? CheckCircle2 : XCircle}
      iconClass={isoTools === null ? "animate-spin" : ""}
    >
      {#if isoTools === null}
        <div class="text-sm">Checking ADK tools…</div>
      {:else if isoTools.ready}
        <div class="text-sm font-medium text-foreground">ADK Deployment Tools detected</div>
        <div class="text-[11px] text-muted-foreground truncate font-mono">{isoTools.oscdimgPath}</div>
      {:else}
        <div class="text-sm font-medium text-foreground">oscdimg.exe not found</div>
        {#if adkDownloading}
          <div class="mt-3 space-y-1.5">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-muted-foreground flex items-center gap-1.5"><Loader2 class="size-3 animate-spin" /> Downloading adksetup.exe…</span>
              <span class="font-mono text-foreground/80">{(adkDownloadedBytes / 1024).toFixed(0)} / {(adkTotalBytes / 1024).toFixed(0)} KB</span>
            </div>
            <MetricBar value={adkPercent} size="md" />
          </div>
        {/if}
        <div class="mt-3 flex flex-wrap items-center gap-2">
          {#if !adkLaunched}
            <Button size="sm" onclick={installAdkAuto} disabled={adkDownloading}>
              {#if adkDownloading}<Loader2 class="size-3.5 animate-spin" />Downloading…{:else}<Download class="size-3.5" />Install Deployment Tools{/if}
            </Button>
          {/if}
          <Button size="sm" variant="outline" onclick={recheckAdk} disabled={adkRechecking}>
            {#if adkRechecking}<Loader2 class="size-3.5 animate-spin" />{:else}<RefreshCw class="size-3.5" />{/if}
            Re-check
          </Button>
          <Button size="sm" variant="ghost" onclick={() => openUrl("https://learn.microsoft.com/en-us/windows-hardware/get-started/adk-install")}>
            <ExternalLink class="size-3.5" /> Manual download
          </Button>
        </div>
      {/if}
    </InfoBanner>

    <div class="grid grid-cols-1 gap-3">
      <div class="flex items-stretch gap-2">
        <FormField label="Input ISO (source)" class="flex-1 min-w-0">
          <TextInput bind:value={inputIsoPath} placeholder="Pick a Windows 11 ISO" readonly mono class="text-[12px]" />
        </FormField>
        <Button variant="outline" class="self-end" onclick={pickInputIso}><FolderOpen class="size-4" />Browse</Button>
      </div>
      <div class="flex items-stretch gap-2">
        <FormField label="Output ISO (destination)" class="flex-1 min-w-0">
          <TextInput bind:value={outputIsoPath} placeholder="reclaim-win11.iso" readonly mono class="text-[12px]" />
        </FormField>
        <Button variant="outline" class="self-end" onclick={pickOutputIso}><FolderOpen class="size-4" />Save as…</Button>
      </div>
    </div>

    <div class="flex items-center gap-3 flex-wrap pt-2">
      <Button onclick={buildIso} disabled={buildBusy || buildRunning || !isoTools?.ready || !inputIsoPath || !outputIsoPath}>
        {#if buildBusy || buildRunning}<Loader2 class="size-4 animate-spin" />{buildRunning ? "Building…" : "Starting…"}{:else}<Play class="size-4" />Build ISO{/if}
      </Button>
      {#if buildRunning}
        <Button size="sm" variant="outline" onclick={() => (tasks.panelOpen = true)}><TerminalIcon class="size-3.5" />Show terminal</Button>
      {/if}
      <div class="text-xs text-muted-foreground flex items-start gap-1.5 ml-auto">
        <AlertTriangle class="size-3.5 text-amber-500 shrink-0 mt-0.5" />
        <span>Needs ~12 GB temp space.</span>
      </div>
    </div>
  </CardContent>
</Card>

<!-- ─── Flash to USB stick ─────────────────────────────────────────────── -->
<SectionHeading title="Flash to USB stick">
  {#snippet inline()}
    <span class="normal-case font-normal text-muted-foreground/60"> (optional)</span>
  {/snippet}
</SectionHeading>
<Card class="card-inset mb-6">
  <CardContent class="space-y-4">
    <p class="text-xs text-muted-foreground">
      Write any Windows ISO directly to a USB stick — single FAT32 + DISM-split layout for install.wim &gt; 4 GB. UEFI-bootable. Needs admin.
    </p>
    {#if !admin.elevated}
      <InfoBanner tone="warning" size="xs" icon={ShieldOff}>
        Flashing needs administrator rights. Click <strong>Elevate</strong> in the titlebar, then
        come back.
      </InfoBanner>
    {/if}
    <div class="flex items-stretch gap-2">
      <FormField label="ISO to flash" class="flex-1 min-w-0">
        <TextInput bind:value={flashIsoPath} placeholder={lastBuiltIso || "Pick a Windows 11 ISO"} readonly mono class="text-[12px]" />
      </FormField>
      <Button variant="outline" class="self-end" onclick={pickFlashIso}><FolderOpen class="size-4" />Browse</Button>
    </div>
    {#if lastBuiltIso && flashIsoPath !== lastBuiltIso}
      <TextLink class="self-start" onclick={() => (flashIsoPath = lastBuiltIso)}>
        Use last built ISO ({lastBuiltIso.split(/[\\/]/).pop()})
      </TextLink>
    {/if}

    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-muted-foreground">Target USB drive</span>
        <Button size="sm" variant="ghost" onclick={refreshUsbDrives} disabled={usbDrivesLoading}>
          {#if usbDrivesLoading}<Loader2 class="size-3.5 animate-spin" />{:else}<RefreshCw class="size-3.5" />{/if}
          Refresh
        </Button>
      </div>
      {#if usbDrivesError}
        <InfoBanner tone="error" size="xs">
          {usbDrivesError}
        </InfoBanner>
      {:else if usbDrives.length === 0 && !usbDrivesLoading}
        <InfoBanner size="xs" icon={Usb}>
          No USB drives detected. Plug one in and Refresh.
        </InfoBanner>
      {:else}
        <div class="grid gap-2">
          {#each usbDrives as d (d.diskNumber)}
            <SelectableTile
              selected={selectedDiskNumber === d.diskNumber}
              onclick={() => (selectedDiskNumber = d.diskNumber)}
            >
              <div class="pt-0.5 pointer-events-none"><Checkbox checked={selectedDiskNumber === d.diskNumber} /></div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <HardDrive class="size-3.5 text-muted-foreground" />
                  <span class="text-sm font-medium truncate">{d.friendlyName || d.model || `Disk ${d.diskNumber}`}</span>
                  <Badge variant="secondary" class="text-[10px] px-1.5 py-0">Disk {d.diskNumber}</Badge>
                  <Badge variant="outline" class="text-[10px] px-1.5 py-0">{formatBytes(d.sizeBytes)}</Badge>
                </div>
                <div class="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">{d.serialNumber || "—"}</div>
              </div>
            </SelectableTile>
          {/each}
        </div>
      {/if}
    </div>

    <div class="flex items-center justify-between px-3 py-2.5 rounded-md bg-surface-2 border border-hairline">
      <div class="flex items-center gap-2 min-w-0">
        <div class="min-w-0">
          <div class="text-sm font-medium">Inject autounattend.xml + setupcomplete.cmd</div>
          <div class="text-xs text-muted-foreground">Drops the current config onto the stick so Setup auto-applies it.</div>
        </div>
      </div>
      <Switch bind:checked={includeUnattendOnFlash} />
    </div>

    <div class="flex items-center gap-3 flex-wrap pt-2">
      <Button onclick={openFlashConfirm} disabled={!canStartFlash}>
        {#if flashStarting || flashRunning}<Loader2 class="size-4 animate-spin" />{flashRunning ? "Flashing…" : "Starting…"}{:else}<Zap class="size-4" />Flash USB{/if}
      </Button>
      {#if flashRunning}
        <Button size="sm" variant="outline" onclick={() => (tasks.panelOpen = true)}><TerminalIcon class="size-3.5" />Show terminal</Button>
      {/if}
      <div class="text-xs text-muted-foreground flex items-start gap-1.5 ml-auto">
        <AlertTriangle class="size-3.5 text-amber-500 shrink-0 mt-0.5" />
        <span>All data on the selected drive is wiped.</span>
      </div>
    </div>
  </CardContent>
</Card>

<Dialog bind:open={flashConfirmOpen} title="Wipe and flash USB drive?"
  description={selectedDrive ? `Disk ${selectedDrive.diskNumber} — ${selectedDrive.friendlyName || selectedDrive.model || "USB"} (${formatBytes(selectedDrive.sizeBytes)})` : ""}>
  <div class="text-sm space-y-3">
    <InfoBanner tone="error" size="xs">
      Every partition and file on this disk will be deleted. Make sure the right drive is selected.
    </InfoBanner>
    <div class="text-xs text-muted-foreground">
      Source: <span class="font-mono text-foreground/80 break-all">{flashIsoPath}</span>
    </div>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (flashConfirmOpen = false)}>Cancel</Button>
    <Button onclick={flashUsb}><Zap class="size-4" />Wipe and flash</Button>
  {/snippet}
</Dialog>

<XmlPreviewDialog bind:open={previewOpen} title="autounattend.xml preview"
  subtitle="Generated from your current config. Close and click 'Save XML' to write to disk."
  filename="autounattend.xml" xml={xmlPreview} {saving}
  onSave={async () => { previewOpen = false; await saveXml(); }} />
