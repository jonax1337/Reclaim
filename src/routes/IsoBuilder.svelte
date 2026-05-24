<script lang="ts">
  import {
    Card,
    CardContent,
    Button,
    Badge,
    Checkbox,
    Switch,
    Select,
    Dialog,
    PageHeader,
    toast,
  } from "$lib/ui";
  import {
    Save,
    Loader2,
    Eye,
    AlertTriangle,
    UserCircle2,
    ShieldOff,
    FolderOpen,
    Play,
    CheckCircle2,
    XCircle,
    ExternalLink,
    Terminal as TerminalIcon,
    Wand2,
    Download,
    RefreshCw,
    Usb,
    Zap,
    HardDrive,
  } from "@lucide/svelte";
  import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { onDestroy } from "svelte";
  import {
    isTauri,
    generateAutounattendXml,
    saveAutounattendXml,
    listWin11Editions,
    isoCheckTools,
    downloadAdkSetup,
    launchAdkInstaller,
    listUsbDrives,
    type IsoTools,
    type UnattendConfig,
    type UsbDrive,
    type Win11Edition,
  } from "$lib/tweaks/bridge";
  import { PROFILES, type Profile } from "$lib/tweaks/profiles";
  import { customProfiles } from "$lib/tweaks/customProfiles.svelte";
  import { mapProfileToUnattend } from "$lib/unattend/profileMapping";
  import ProfileIcon from "$lib/components/ProfileIcon.svelte";
  import XmlPreviewDialog from "$lib/components/XmlPreviewDialog.svelte";
  import { tasks, runIsoBuildTask, runUsbFlashTask } from "$lib/tasks.svelte";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import { cn } from "$lib/utils";

  // ─── Locale presets ──────────────────────────────────────────────────────
  type LocalePreset = {
    id: string;
    label: string;
    language: string;
    keyboard: string;
    systemLocale: string;
    userLocale: string;
    timezone: string;
    geoId: string;
  };
  const LOCALE_PRESETS: LocalePreset[] = [
    { id: "de-de", label: "Deutsch (Deutschland)", language: "de-DE", keyboard: "0407:00000407", systemLocale: "de-DE", userLocale: "de-DE", timezone: "W. Europe Standard Time", geoId: "94" },
    { id: "en-us", label: "English (United States)", language: "en-US", keyboard: "0409:00000409", systemLocale: "en-US", userLocale: "en-US", timezone: "Pacific Standard Time", geoId: "244" },
    { id: "en-gb", label: "English (United Kingdom)", language: "en-GB", keyboard: "0809:00000809", systemLocale: "en-GB", userLocale: "en-GB", timezone: "GMT Standard Time", geoId: "242" },
    { id: "fr-fr", label: "Français (France)", language: "fr-FR", keyboard: "040C:0000040C", systemLocale: "fr-FR", userLocale: "fr-FR", timezone: "Romance Standard Time", geoId: "84" },
    { id: "es-es", label: "Español (España)", language: "es-ES", keyboard: "040A:0000040A", systemLocale: "es-ES", userLocale: "es-ES", timezone: "Romance Standard Time", geoId: "217" },
    { id: "it-it", label: "Italiano (Italia)", language: "it-IT", keyboard: "0410:00000410", systemLocale: "it-IT", userLocale: "it-IT", timezone: "W. Europe Standard Time", geoId: "118" },
  ];

  // ─── State ───────────────────────────────────────────────────────────────
  let selectedProfileId = $state<string>("privacy-max");
  let selectedLocaleId = $state<string>("de-de");

  let username = $state("User");
  let password = $state("");
  let autologon = $state(false);
  let computerName = $state("RECLAIM-PC");
  let organization = $state("Reclaim");

  let selectedEditionKey = $state<string>("VK7JG-NPHTM-C97JM-9MPGT-3V66T");
  let customProductKey = $state("");
  let useCustomKey = $state(false);

  let bypassTpm = $state(true);
  let bypassSecureBoot = $state(true);
  let bypassRam = $state(true);
  let bypassStorage = $state(true);
  let bypassCpu = $state(true);
  let bypassNro = $state(true);
  let skipMsAccount = $state(true);
  let skipEula = $state(true);
  let skipOobePrivacy = $state(true);

  let disableTelemetry = $state(true);
  let disableAdvertisingId = $state(true);
  let disableLocation = $state(true);
  let disableTailoredExperiences = $state(true);
  let disableFindMyDevice = $state(true);
  let disableInkingTyping = $state(true);
  let disableDiagnosticData = $state(true);
  let disableCortana = $state(true);

  let xmlPreview = $state("");
  let previewOpen = $state(false);
  let saving = $state(false);
  let generating = $state(false);

  let editions = $state<Win11Edition[]>([]);
  let isoTools = $state<IsoTools | null>(null);
  let inputIsoPath = $state("");
  let outputIsoPath = $state("");
  let buildBusy = $state(false);

  // ── USB flash state ───────────────────────────────────────────────────
  let usbDrives = $state<UsbDrive[]>([]);
  let usbDrivesLoading = $state(false);
  let usbDrivesError = $state<string | null>(null);
  let selectedDiskNumber = $state<number | null>(null);
  let flashIsoPath = $state("");
  let includeUnattendOnFlash = $state(true);
  let flashConfirmOpen = $state(false);
  let flashStarting = $state(false);
  let lastBuiltIso = $state(""); // remembered after a successful Build ISO

  // ADK installer state
  let adkDownloading = $state(false);
  let adkDownloadedBytes = $state(0);
  let adkTotalBytes = $state(0);
  let adkLaunched = $state(false);
  let adkRechecking = $state(false);

  let unlistenProgress: UnlistenFn | null = null;
  let unlistenDone: UnlistenFn | null = null;

  $effect(() => {
    if (!isTauri()) return;
    listWin11Editions().then((e) => (editions = e)).catch(() => {});
    isoCheckTools().then((t) => (isoTools = t)).catch(() => {});
    refreshUsbDrives();

    listen<{ downloaded: number; total: number }>("adk-download:progress", (e) => {
      adkDownloadedBytes = e.payload.downloaded;
      adkTotalBytes = e.payload.total;
    }).then((u) => (unlistenProgress = u));
    listen("adk-download:done", () => {
      adkDownloading = false;
    }).then((u) => (unlistenDone = u));
  });

  onDestroy(() => {
    unlistenProgress?.();
    unlistenDone?.();
  });

  const adkPercent = $derived(
    adkTotalBytes > 0 ? Math.min(100, Math.round((adkDownloadedBytes / adkTotalBytes) * 100)) : 0,
  );

  async function installAdkAuto() {
    if (!isTauri()) return;
    adkDownloading = true;
    adkLaunched = false;
    adkDownloadedBytes = 0;
    adkTotalBytes = 0;
    try {
      const setupPath = await downloadAdkSetup();
      await launchAdkInstaller(setupPath);
      adkLaunched = true;
      toast.success("ADK installer launched", "Complete the wizard, then click Re-check.");
    } catch (e) {
      toast.error("ADK setup failed", String(e));
    } finally {
      adkDownloading = false;
    }
  }

  async function recheckAdk() {
    if (!isTauri()) return;
    adkRechecking = true;
    try {
      isoTools = await isoCheckTools();
      if (isoTools.ready) {
        adkLaunched = false;
        toast.success("Deployment Tools detected", "Ready to build ISOs.");
      } else {
        toast.warning("Still not detected", "If the installer is still running, wait for it to finish.");
      }
    } catch (e) {
      toast.error("Re-check failed", String(e));
    } finally {
      adkRechecking = false;
    }
  }

  // ─── Derived ─────────────────────────────────────────────────────────────
  const allProfiles = $derived<Profile[]>([...PROFILES, ...customProfiles.items]);
  const selectedProfile = $derived<Profile | undefined>(
    allProfiles.find((p) => p.id === selectedProfileId),
  );
  const mapping = $derived(
    selectedProfile
      ? mapProfileToUnattend(selectedProfile)
      : { registryTweaks: [], appxPatterns: [], skippedShellTweaks: [] },
  );
  const selectedLocale = $derived<LocalePreset>(
    LOCALE_PRESETS.find((l) => l.id === selectedLocaleId) ?? LOCALE_PRESETS[0],
  );

  // Split built-in vs custom so the dropdown can render them under separate
  // <Select.Label> groups.
  const builtInProfiles = $derived(allProfiles.filter((p) => !p.custom));
  const customProfileList = $derived(allProfiles.filter((p) => !!p.custom));
  const selectedEdition = $derived(editions.find((e) => e.key === selectedEditionKey));

  const buildRunning = $derived(tasks.hasRunning("iso-build"));

  function buildConfig(): UnattendConfig {
    return {
      language: selectedLocale.language,
      keyboard: selectedLocale.keyboard,
      system_locale: selectedLocale.systemLocale,
      user_locale: selectedLocale.userLocale,
      timezone: selectedLocale.timezone,
      geo_id: selectedLocale.geoId,
      username,
      password: password === "" ? null : password,
      autologon,
      computer_name: computerName,
      organization,
      edition: editions.find((e) => e.key === selectedEditionKey)?.label ?? null,
      product_key: useCustomKey ? customProductKey || null : selectedEditionKey || null,
      bypass_tpm_check: bypassTpm,
      bypass_secure_boot_check: bypassSecureBoot,
      bypass_ram_check: bypassRam,
      bypass_storage_check: bypassStorage,
      bypass_cpu_check: bypassCpu,
      bypass_network_requirement: bypassNro,
      skip_ms_account: skipMsAccount,
      skip_eula: skipEula,
      skip_oobe_privacy: skipOobePrivacy,
      disable_telemetry: disableTelemetry,
      disable_advertising_id: disableAdvertisingId,
      disable_location: disableLocation,
      disable_tailored_experiences: disableTailoredExperiences,
      disable_find_my_device: disableFindMyDevice,
      disable_inking_typing: disableInkingTyping,
      disable_diagnostic_data: disableDiagnosticData,
      disable_cortana: disableCortana,
      debloat_appx_patterns: mapping.appxPatterns,
      registry_tweaks: mapping.registryTweaks,
    };
  }

  async function generatePreview() {
    if (!isTauri()) {
      toast.error("Browser preview", "XML generation needs the Tauri runtime.");
      return;
    }
    generating = true;
    try {
      xmlPreview = await generateAutounattendXml(buildConfig());
      previewOpen = true;
    } catch (e) {
      toast.error("Generation failed", String(e));
    } finally {
      generating = false;
    }
  }

  async function saveXml() {
    if (!isTauri()) {
      toast.error("Browser preview", "Saving needs the Tauri runtime.");
      return;
    }
    saving = true;
    try {
      const xml = await generateAutounattendXml(buildConfig());
      const dest = await saveDialog({
        defaultPath: "autounattend.xml",
        filters: [{ name: "Autounattend XML", extensions: ["xml"] }],
      });
      if (!dest) {
        saving = false;
        return;
      }
      await saveAutounattendXml(dest, xml);
      log.success("iso.unattend.save", "Autounattend", `Wrote autounattend.xml to ${dest}`);
      toast.success("Saved", `Wrote ${dest}`);
    } catch (e) {
      toast.error("Save failed", String(e));
    } finally {
      saving = false;
    }
  }

  async function pickInputIso() {
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Windows ISO", extensions: ["iso"] }],
      });
      if (typeof picked === "string") inputIsoPath = picked;
    } catch (e) {
      toast.error("Pick failed", String(e));
    }
  }

  async function pickOutputIso() {
    try {
      const picked = await saveDialog({
        defaultPath: "reclaim-win11.iso",
        filters: [{ name: "Windows ISO", extensions: ["iso"] }],
      });
      if (picked) outputIsoPath = picked;
    } catch (e) {
      toast.error("Pick failed", String(e));
    }
  }

  async function buildIso() {
    if (!isTauri()) { toast.error("Browser preview", "ISO build needs the Tauri runtime."); return; }
    if (!inputIsoPath || !outputIsoPath) { toast.error("Missing paths", "Pick both an input and an output ISO."); return; }
    if (!isoTools?.ready) { toast.error("oscdimg missing", "Install the Windows ADK Deployment Tools first."); return; }
    buildBusy = true;
    try {
      const xml = await generateAutounattendXml(buildConfig());
      tasks.panelOpen = true;
      await runIsoBuildTask(inputIsoPath, outputIsoPath, xml);
      log.success("iso.unattend.save", "Install media", `Built ${outputIsoPath} from ${inputIsoPath}`);
      lastBuiltIso = outputIsoPath;
      // Auto-fill the flasher's source so the natural next step is one click.
      if (!flashIsoPath) flashIsoPath = outputIsoPath;
    } catch (e) {
      toast.error("Build failed", String(e));
    } finally {
      buildBusy = false;
    }
  }

  // ── USB flash actions ───────────────────────────────────────────────────
  async function refreshUsbDrives() {
    if (!isTauri()) return;
    usbDrivesLoading = true;
    usbDrivesError = null;
    try {
      const drives = await listUsbDrives();
      usbDrives = drives;
      // Drop the selection if the disk vanished between refreshes.
      if (selectedDiskNumber !== null && !drives.some((d) => d.diskNumber === selectedDiskNumber)) {
        selectedDiskNumber = null;
      }
    } catch (e) {
      usbDrivesError = String(e);
      usbDrives = [];
    } finally {
      usbDrivesLoading = false;
    }
  }

  async function pickFlashIso() {
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Windows ISO", extensions: ["iso"] }],
      });
      if (typeof picked === "string") flashIsoPath = picked;
    } catch (e) {
      toast.error("Pick failed", String(e));
    }
  }

  const selectedDrive = $derived<UsbDrive | undefined>(
    selectedDiskNumber === null
      ? undefined
      : usbDrives.find((d) => d.diskNumber === selectedDiskNumber),
  );

  const flashRunning = $derived(tasks.hasRunning("usb-flash"));

  const canStartFlash = $derived(
    !!flashIsoPath &&
      selectedDiskNumber !== null &&
      !flashStarting &&
      !flashRunning &&
      isTauri(),
  );

  function openFlashConfirm() {
    if (!canStartFlash) return;
    flashConfirmOpen = true;
  }

  async function flashUsb() {
    if (!isTauri()) { toast.error("Browser preview", "Flashing needs the Tauri runtime."); return; }
    if (selectedDiskNumber === null || !flashIsoPath) return;
    const drive = selectedDrive;
    if (!drive) { toast.error("Drive missing", "Refresh and try again."); return; }
    flashConfirmOpen = false;
    flashStarting = true;
    try {
      const xml = includeUnattendOnFlash ? await generateAutounattendXml(buildConfig()) : null;
      tasks.panelOpen = true;
      const label = `${drive.friendlyName || drive.model || "USB"} · ${formatBytes(drive.sizeBytes)}`;
      await runUsbFlashTask(flashIsoPath, drive.diskNumber, label, xml);
      log.success(
        "iso.usb.flash",
        "Install media",
        `Flashed ${flashIsoPath} → disk ${drive.diskNumber} (${drive.friendlyName})`,
      );
    } catch (e) {
      toast.error("Flash failed", String(e));
    } finally {
      flashStarting = false;
    }
  }

  function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "—";
    const gb = n / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
    const mb = n / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  }

  async function openAdkPage() {
    try {
      await openUrl("https://learn.microsoft.com/en-us/windows-hardware/get-started/adk-install");
    } catch {}
  }

  // Shared field classes — match the existing project convention used in
  // ProfileBuilder / OneDrive / etc.
  const fieldClass =
    "h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring";
  const labelClass = "flex flex-col gap-1.5";
  const labelTextClass = "text-xs font-medium text-muted-foreground";

  // Helper for the bypass / privacy checkbox grids.
  type ToggleDef = { value: boolean; set: (v: boolean) => void; title: string; desc: string };
  const bypassDefs: ToggleDef[] = $derived([
    { value: bypassTpm, set: (v) => (bypassTpm = v), title: "Bypass TPM check", desc: "Install on machines without a TPM 2.0 module." },
    { value: bypassSecureBoot, set: (v) => (bypassSecureBoot = v), title: "Bypass Secure Boot check", desc: "Install on machines without Secure Boot enabled." },
    { value: bypassRam, set: (v) => (bypassRam = v), title: "Bypass RAM check", desc: "Install on machines with <4 GB RAM." },
    { value: bypassStorage, set: (v) => (bypassStorage = v), title: "Bypass storage check", desc: "Skip the 64 GB minimum-disk requirement." },
    { value: bypassCpu, set: (v) => (bypassCpu = v), title: "Bypass CPU check", desc: "Install on unsupported CPUs (e.g. older Intel/AMD)." },
    { value: bypassNro, set: (v) => (bypassNro = v), title: "BypassNRO (skip network)", desc: "Skip the 'must connect to internet' wall during OOBE." },
    { value: skipMsAccount, set: (v) => (skipMsAccount = v), title: "Force local account", desc: "Hides the online-account screens — only a local admin is created." },
    { value: skipEula, set: (v) => (skipEula = v), title: "Hide EULA page", desc: "Auto-accept the EULA." },
    { value: skipOobePrivacy, set: (v) => (skipOobePrivacy = v), title: "Pre-answer privacy prompts to OFF", desc: "Sends ProtectYourPC=3 so OOBE telemetry defaults are minimal." },
  ]);

  const privacyDefs: ToggleDef[] = $derived([
    { value: disableTelemetry, set: (v) => (disableTelemetry = v), title: "Disable telemetry", desc: "AllowTelemetry = 0 (Security only)." },
    { value: disableAdvertisingId, set: (v) => (disableAdvertisingId = v), title: "Disable advertising ID", desc: "Per-user privacy flag." },
    { value: disableLocation, set: (v) => (disableLocation = v), title: "Disable location tracking", desc: "Machine-wide location policy off." },
    { value: disableTailoredExperiences, set: (v) => (disableTailoredExperiences = v), title: "Disable tailored experiences", desc: "Personalized ads/tips based on diagnostic data." },
    { value: disableFindMyDevice, set: (v) => (disableFindMyDevice = v), title: "Disable Find My Device", desc: "Disables location reporting for device-find." },
    { value: disableInkingTyping, set: (v) => (disableInkingTyping = v), title: "Disable inking/typing personalization", desc: "Stops handwriting + typing data collection." },
    { value: disableDiagnosticData, set: (v) => (disableDiagnosticData = v), title: "Cap diagnostic data", desc: "MaxTelemetryAllowed = 1 (Basic)." },
    { value: disableCortana, set: (v) => (disableCortana = v), title: "Disable Cortana", desc: "AllowCortana = 0." },
  ]);
</script>

<PageHeader title="Install media">
  {#snippet actions()}
    <div class="flex items-center gap-2">
      <Button variant="outline" onclick={generatePreview} disabled={generating || !isTauri()}>
        {#if generating}<Loader2 class="size-4 animate-spin" />{:else}<Eye class="size-4" />{/if}
        Preview XML
      </Button>
      <Button onclick={saveXml} disabled={saving || !isTauri()}>
        {#if saving}<Loader2 class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if}
        Save autounattend.xml
      </Button>
    </div>
  {/snippet}
  Configure a Windows 11 unattended install. The generated
  <code class="px-1 rounded bg-foreground/10 font-mono text-[12px]">autounattend.xml</code>
  runs your selected Reclaim profile during first logon — debloat and registry tweaks become
  part of the install itself.
</PageHeader>

<!-- ─── Reclaim profile (debloat source) ─────────────────────────────────── -->
<h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
  Reclaim profile
</h2>
<Card class="card-inset mb-6">
  <CardContent>
    <div class="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4 items-start">
      <label class={labelClass}>
        <span class={labelTextClass}>Profile</span>
        <Select.Root type="single" bind:value={selectedProfileId}>
          <Select.Trigger>
            <span>{selectedProfile?.name ?? "Pick a profile"}</span>
          </Select.Trigger>
          <Select.Content>
            {#if builtInProfiles.length > 0}
              <Select.Group>
                <Select.Label>Built-in profiles</Select.Label>
                {#each builtInProfiles as p (p.id)}
                  <Select.Item value={p.id} label={p.name}>
                    <div class="flex flex-col">
                      <span>{p.name}</span>
                      <span class="text-[11px] text-muted-foreground">{p.tagline}</span>
                    </div>
                  </Select.Item>
                {/each}
              </Select.Group>
            {/if}
            {#if customProfileList.length > 0}
              <Select.Group>
                <Select.Label>Custom profiles</Select.Label>
                {#each customProfileList as p (p.id)}
                  <Select.Item value={p.id} label={p.name}>
                    <div class="flex flex-col">
                      <span>{p.name}</span>
                      <span class="text-[11px] text-muted-foreground">{p.tagline}</span>
                    </div>
                  </Select.Item>
                {/each}
              </Select.Group>
            {/if}
          </Select.Content>
        </Select.Root>
        <span class="text-[11px] text-muted-foreground">
          Built-in + custom profiles you've created in the Profiles page.
        </span>
      </label>

      {#if selectedProfile}
        <div class="flex items-start gap-3 p-3 rounded-md bg-foreground/[0.03] border border-foreground/8">
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
                {mapping.registryTweaks.length} reg tweaks
              </Badge>
              <Badge variant="secondary" class="text-[10px]">
                {mapping.appxPatterns.length} AppX removals
              </Badge>
              {#if mapping.skippedShellTweaks.length > 0}
                <Badge variant="outline" class="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-300">
                  {mapping.skippedShellTweaks.length} shell tweaks skipped
                </Badge>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
    {#if mapping.skippedShellTweaks.length > 0}
      <div class="mt-3 text-xs text-muted-foreground flex items-start gap-2">
        <AlertTriangle class="size-3.5 mt-0.5 text-amber-500 shrink-0" />
        <span>
          Shell-based tweaks can't be ported into autounattend.xml — only the
          registry ones make it. Apply those manually after first logon.
        </span>
      </div>
    {/if}
  </CardContent>
</Card>

<!-- ─── Locale & account ─────────────────────────────────────────────────── -->
<h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
  Locale &amp; account
</h2>
<Card class="card-inset mb-6">
  <CardContent>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <label class={labelClass}>
      <span class={labelTextClass}>Locale preset</span>
      <Select.Root type="single" bind:value={selectedLocaleId}>
        <Select.Trigger>
          <span>{selectedLocale.label}</span>
        </Select.Trigger>
        <Select.Content>
          {#each LOCALE_PRESETS as l (l.id)}
            <Select.Item value={l.id} label={l.label}>
              <div class="flex flex-col">
                <span>{l.label}</span>
                <span class="text-[11px] text-muted-foreground">{l.language} · {l.timezone}</span>
              </div>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      <span class="text-[11px] text-muted-foreground">
        → {selectedLocale.language} · {selectedLocale.timezone} · GeoID {selectedLocale.geoId}
      </span>
    </label>
    <div></div>

    <label class={labelClass}>
      <span class={labelTextClass}>Local username</span>
      <input type="text" bind:value={username} placeholder="User" class={fieldClass} />
    </label>
    <label class={labelClass}>
      <span class={labelTextClass}>Password (recommended)</span>
      <input type="text" bind:value={password} placeholder="Set a password" class={fieldClass} />
    </label>

    {#if password === ""}
      <div class="md:col-span-2 flex items-start gap-3 px-3 py-2.5 rounded-md border bg-amber-500/10 border-amber-500/30">
        <AlertTriangle class="size-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div class="text-xs text-foreground/90 leading-relaxed">
          <strong>No password set.</strong> Windows 11 24H2+ refuses to create local accounts with a
          blank password — Setup will skip the unattended account block and show its own account-creation
          screen instead. Set a password here to keep the flow fully unattended.
        </div>
      </div>
    {/if}

    <label class={labelClass}>
      <span class={labelTextClass}>Computer name</span>
      <input type="text" bind:value={computerName} placeholder="RECLAIM-PC" class={fieldClass} />
    </label>
    <label class={labelClass}>
      <span class={labelTextClass}>Organization</span>
      <input type="text" bind:value={organization} placeholder="Reclaim" class={fieldClass} />
    </label>

    <div class="md:col-span-2 flex items-center justify-between px-3 py-2.5 rounded-md bg-foreground/[0.03] border border-foreground/8">
      <div class="flex items-center gap-2">
        <UserCircle2 class="size-4 text-muted-foreground" />
        <div>
          <div class="text-sm font-medium">Auto-logon on first boot</div>
          <div class="text-xs text-muted-foreground">
            Logs the account in once so first-logon commands can run without prompting.
          </div>
        </div>
      </div>
      <Switch bind:checked={autologon} />
    </div>
    </div>
  </CardContent>
</Card>

<!-- ─── Windows edition ──────────────────────────────────────────────────── -->
<h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
  Windows edition
</h2>
<Card class="card-inset mb-6">
  <CardContent class="space-y-4">
    <p class="text-xs text-muted-foreground">
      Uses Microsoft-published KMS client setup keys to tell setup which SKU to
      install. These are <strong>edition-selection</strong> keys, not activation
      keys — activate separately after install.
    </p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
      <label class={labelClass}>
        <span class={labelTextClass}>Edition</span>
        <Select.Root type="single" bind:value={selectedEditionKey} disabled={useCustomKey}>
          <Select.Trigger>
            <span>{selectedEdition?.label ?? "Pick an edition"}</span>
          </Select.Trigger>
          <Select.Content>
            {#each editions as e (e.key)}
              <Select.Item value={e.key} label={e.label}>{e.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </label>
      <label class="flex items-center gap-2 cursor-pointer select-none h-9">
        <Checkbox bind:checked={useCustomKey} />
        <span class="text-sm">Use my own product key instead</span>
      </label>
    </div>
    {#if useCustomKey}
      <label class={labelClass}>
        <span class={labelTextClass}>Product key</span>
        <input
          type="text"
          bind:value={customProductKey}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
          class={cn(fieldClass, "font-mono uppercase tracking-wider")}
        />
      </label>
    {/if}
  </CardContent>
</Card>

<!-- ─── Bypasses & OOBE ──────────────────────────────────────────────────── -->
<h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
  Install bypasses &amp; OOBE skips
</h2>
<Card class="card-inset mb-6">
  <CardContent>
    <p class="text-xs text-muted-foreground mb-4">
      Skip Windows 11's hardware-requirement checks and the OOBE prompts that
      normally require a Microsoft account and a working internet connection.
    </p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
      {#each bypassDefs as def, i (i)}
        <button
          type="button"
          onclick={() => def.set(!def.value)}
          class={cn(
            "flex items-start gap-3 px-3 py-2.5 rounded-md text-left border transition-colors",
            def.value
              ? "border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.09]"
              : "border-foreground/8 bg-foreground/[0.02] hover:bg-foreground/[0.04]",
          )}
        >
          <div class="pt-0.5 pointer-events-none">
            <Checkbox checked={def.value} />
          </div>
          <div class="min-w-0">
            <div class="text-sm font-medium">{def.title}</div>
            <div class="text-xs text-muted-foreground">{def.desc}</div>
          </div>
        </button>
      {/each}
    </div>
  </CardContent>
</Card>

<!-- ─── OOBE privacy defaults ────────────────────────────────────────────── -->
<h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
  OOBE privacy defaults
</h2>
<Card class="card-inset mb-6">
  <CardContent>
    <p class="text-xs text-muted-foreground mb-4">
      Extra registry writes emitted during the <code class="px-1 rounded bg-foreground/10 font-mono text-[11px]">specialize</code>
      pass and first logon, on top of whatever the selected profile already turns off.
    </p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
      {#each privacyDefs as def, i (i)}
        <button
          type="button"
          onclick={() => def.set(!def.value)}
          class={cn(
            "flex items-start gap-3 px-3 py-2.5 rounded-md text-left border transition-colors",
            def.value
              ? "border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.09]"
              : "border-foreground/8 bg-foreground/[0.02] hover:bg-foreground/[0.04]",
          )}
        >
          <div class="pt-0.5 pointer-events-none">
            <Checkbox checked={def.value} />
          </div>
          <div class="min-w-0">
            <div class="text-sm font-medium">{def.title}</div>
            <div class="text-xs text-muted-foreground">{def.desc}</div>
          </div>
        </button>
      {/each}
    </div>
  </CardContent>
</Card>

<!-- ─── Build full ISO (optional) ────────────────────────────────────────── -->
<h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
  Build full ISO <span class="normal-case font-normal text-muted-foreground/60">(optional)</span>
</h2>
<Card class="card-inset mb-6">
  <CardContent class="space-y-4">
    <p class="text-xs text-muted-foreground">
      Take an existing Windows 11 ISO, inject the autounattend.xml, and repack
      as a bootable hybrid (BIOS + UEFI) ISO. Requires the Windows ADK Deployment
      Tools (for <code class="px-1 rounded bg-foreground/10 font-mono text-[11px]">oscdimg.exe</code>)
      — about 200 MB feature.
    </p>

    <div
      class={cn(
        "flex items-start gap-3 px-3 py-2.5 rounded-md border",
        isoTools?.ready
          ? "bg-success/10 border-success/30"
          : "bg-amber-500/10 border-amber-500/30",
      )}
    >
      {#if isoTools === null}
        <Loader2 class="size-4 mt-0.5 animate-spin text-muted-foreground shrink-0" />
        <div class="text-sm text-muted-foreground">Checking ADK tools…</div>
      {:else if isoTools.ready}
        <CheckCircle2 class="size-4 mt-0.5 text-success shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium">ADK Deployment Tools detected</div>
          <div class="text-[11px] text-muted-foreground truncate font-mono">{isoTools.oscdimgPath}</div>
        </div>
      {:else}
        <XCircle class="size-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium">oscdimg.exe not found</div>
          <div class="text-xs text-muted-foreground">
            Install the <strong>Deployment Tools</strong> feature from the Windows ADK
            (~200 MB, just that one feature — not the full 3 GB ADK).
          </div>

          {#if adkDownloading}
            <div class="mt-3 space-y-1.5">
              <div class="flex items-center justify-between text-[11px]">
                <span class="text-muted-foreground flex items-center gap-1.5">
                  <Loader2 class="size-3 animate-spin" />
                  Downloading adksetup.exe from Microsoft…
                </span>
                <span class="font-mono text-foreground/80">
                  {(adkDownloadedBytes / 1024).toFixed(0)} / {(adkTotalBytes / 1024).toFixed(0)} KB
                </span>
              </div>
              <div class="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                <div
                  class="h-full bg-primary transition-[width] duration-100"
                  style="width: {adkPercent}%"
                ></div>
              </div>
            </div>
          {:else if adkLaunched}
            <div class="mt-3 px-3 py-2 rounded-md border border-primary/30 bg-primary/[0.06] text-xs">
              <div class="font-medium text-foreground">ADK installer running</div>
              <div class="text-muted-foreground mt-0.5">
                Complete the wizard (Deployment Tools is pre-selected), then click
                <strong>Re-check</strong> below.
              </div>
            </div>
          {/if}

          <div class="mt-3 flex flex-wrap items-center gap-2">
            {#if !adkLaunched}
              <Button size="sm" onclick={installAdkAuto} disabled={adkDownloading}>
                {#if adkDownloading}
                  <Loader2 class="size-3.5 animate-spin" />
                  Downloading…
                {:else}
                  <Download class="size-3.5" />
                  Install Deployment Tools (auto)
                {/if}
              </Button>
            {/if}
            <Button size="sm" variant="outline" onclick={recheckAdk} disabled={adkRechecking}>
              {#if adkRechecking}
                <Loader2 class="size-3.5 animate-spin" />
              {:else}
                <RefreshCw class="size-3.5" />
              {/if}
              Re-check
            </Button>
            <Button size="sm" variant="ghost" onclick={openAdkPage}>
              <ExternalLink class="size-3.5" />
              Manual download
            </Button>
          </div>
        </div>
      {/if}
    </div>

    <div class="grid grid-cols-1 gap-3">
      <div class="flex items-stretch gap-2">
        <label class="flex-1 min-w-0 {labelClass}">
          <span class={labelTextClass}>Input ISO (source)</span>
          <input
            type="text"
            bind:value={inputIsoPath}
            placeholder="C:\Users\You\Downloads\Win11_24H2.iso"
            class={cn(fieldClass, "w-full font-mono text-[12px]")}
            readonly
          />
        </label>
        <Button variant="outline" class="self-end" onclick={pickInputIso}>
          <FolderOpen class="size-4" />
          Browse
        </Button>
      </div>

      <div class="flex items-stretch gap-2">
        <label class="flex-1 min-w-0 {labelClass}">
          <span class={labelTextClass}>Output ISO (destination)</span>
          <input
            type="text"
            bind:value={outputIsoPath}
            placeholder="C:\Users\You\Downloads\reclaim-win11.iso"
            class={cn(fieldClass, "w-full font-mono text-[12px]")}
            readonly
          />
        </label>
        <Button variant="outline" class="self-end" onclick={pickOutputIso}>
          <FolderOpen class="size-4" />
          Save as…
        </Button>
      </div>
    </div>

    <div class="flex items-center gap-3 flex-wrap pt-2">
      <Button
        onclick={buildIso}
        disabled={buildBusy || buildRunning || !isoTools?.ready || !inputIsoPath || !outputIsoPath}
      >
        {#if buildBusy || buildRunning}
          <Loader2 class="size-4 animate-spin" />
          {buildRunning ? "Building…" : "Starting…"}
        {:else}
          <Play class="size-4" />
          Build ISO
        {/if}
      </Button>
      {#if buildRunning}
        <Button size="sm" variant="outline" onclick={() => (tasks.panelOpen = true)}>
          <TerminalIcon class="size-3.5" />
          Show terminal
        </Button>
      {/if}
      <div class="text-xs text-muted-foreground flex items-start gap-1.5 ml-auto">
        <AlertTriangle class="size-3.5 text-amber-500 shrink-0 mt-0.5" />
        <span>Needs ~12 GB temp space.</span>
      </div>
    </div>
  </CardContent>
</Card>

<!-- ─── Flash to USB stick ───────────────────────────────────────────────── -->
<h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
  Flash to USB stick <span class="normal-case font-normal text-muted-foreground/60">(optional)</span>
</h2>
<Card class="card-inset mb-6">
  <CardContent class="space-y-4">
    <p class="text-xs text-muted-foreground">
      Write any Windows install ISO directly to a USB stick — Rufus-style dual
      partition (FAT32 boot + NTFS install) so install.wim images larger than
      4&nbsp;GB work out of the box. Boots UEFI on modern PCs. Needs admin
      rights to touch the disk.
    </p>

    {#if !admin.elevated}
      <div class="flex items-start gap-3 px-3 py-2.5 rounded-md border bg-amber-500/10 border-amber-500/30">
        <ShieldOff class="size-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div class="text-xs text-foreground/90">
          Flashing needs administrator rights. Click <strong>Elevate</strong>
          in the titlebar, then come back here.
        </div>
      </div>
    {/if}

    <!-- Source ISO -->
    <div class="flex items-stretch gap-2">
      <label class="flex-1 min-w-0 {labelClass}">
        <span class={labelTextClass}>ISO to flash</span>
        <input
          type="text"
          bind:value={flashIsoPath}
          placeholder={lastBuiltIso || "C:\\Users\\You\\Downloads\\Win11_24H2.iso"}
          class={cn(fieldClass, "w-full font-mono text-[12px]")}
          readonly
        />
      </label>
      <Button variant="outline" class="self-end" onclick={pickFlashIso}>
        <FolderOpen class="size-4" />
        Browse
      </Button>
    </div>
    {#if lastBuiltIso && flashIsoPath !== lastBuiltIso}
      <button
        type="button"
        class="text-[11px] text-primary hover:underline self-start"
        onclick={() => (flashIsoPath = lastBuiltIso)}
      >
        Use last built ISO ({lastBuiltIso.split(/[\\/]/).pop()})
      </button>
    {/if}

    <!-- Target drive picker -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class={labelTextClass}>Target USB drive</span>
        <Button size="sm" variant="ghost" onclick={refreshUsbDrives} disabled={usbDrivesLoading}>
          {#if usbDrivesLoading}
            <Loader2 class="size-3.5 animate-spin" />
          {:else}
            <RefreshCw class="size-3.5" />
          {/if}
          Refresh
        </Button>
      </div>

      {#if usbDrivesError}
        <div class="flex items-start gap-3 px-3 py-2.5 rounded-md border bg-red-500/10 border-red-500/30">
          <XCircle class="size-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
          <div class="text-xs text-foreground/90">{usbDrivesError}</div>
        </div>
      {:else if usbDrives.length === 0 && !usbDrivesLoading}
        <div class="flex items-start gap-3 px-3 py-3 rounded-md border border-foreground/8 bg-foreground/[0.02]">
          <Usb class="size-4 mt-0.5 text-muted-foreground shrink-0" />
          <div class="text-xs text-muted-foreground">
            No USB drives detected. Plug one in and click <strong>Refresh</strong>.
            Internal drives are never listed here.
          </div>
        </div>
      {:else}
        <div class="grid gap-2">
          {#each usbDrives as d (d.diskNumber)}
            <button
              type="button"
              onclick={() => (selectedDiskNumber = d.diskNumber)}
              class={cn(
                "flex items-start gap-3 px-3 py-2.5 rounded-md text-left border transition-colors",
                selectedDiskNumber === d.diskNumber
                  ? "border-primary/40 bg-primary/[0.08] hover:bg-primary/[0.11]"
                  : "border-foreground/8 bg-foreground/[0.02] hover:bg-foreground/[0.04]",
              )}
            >
              <div class="pt-0.5 pointer-events-none">
                <Checkbox checked={selectedDiskNumber === d.diskNumber} />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <HardDrive class="size-3.5 text-muted-foreground" />
                  <span class="text-sm font-medium truncate">
                    {d.friendlyName || d.model || `Disk ${d.diskNumber}`}
                  </span>
                  <Badge variant="secondary" class="text-[10px] px-1.5 py-0">
                    Disk {d.diskNumber}
                  </Badge>
                  <Badge variant="outline" class="text-[10px] px-1.5 py-0">
                    {formatBytes(d.sizeBytes)}
                  </Badge>
                  {#if d.partitionStyle && d.partitionStyle !== "RAW"}
                    <Badge variant="outline" class="text-[10px] px-1.5 py-0">{d.partitionStyle}</Badge>
                  {/if}
                </div>
                <div class="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
                  {d.serialNumber || "—"}
                </div>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Inject unattend toggle -->
    <div class="flex items-center justify-between px-3 py-2.5 rounded-md bg-foreground/[0.03] border border-foreground/8">
      <div class="flex items-center gap-2 min-w-0">
        <Wand2 class="size-4 text-muted-foreground shrink-0" />
        <div class="min-w-0">
          <div class="text-sm font-medium">Inject autounattend.xml on the stick</div>
          <div class="text-xs text-muted-foreground">
            Drops the generated autounattend.xml at the root of both partitions
            so Windows setup auto-applies the selected Reclaim profile during
            first logon.
          </div>
        </div>
      </div>
      <Switch bind:checked={includeUnattendOnFlash} />
    </div>

    <!-- Action row -->
    <div class="flex items-center gap-3 flex-wrap pt-2">
      <Button onclick={openFlashConfirm} disabled={!canStartFlash}>
        {#if flashStarting || flashRunning}
          <Loader2 class="size-4 animate-spin" />
          {flashRunning ? "Flashing…" : "Starting…"}
        {:else}
          <Zap class="size-4" />
          Flash USB
        {/if}
      </Button>
      {#if flashRunning}
        <Button size="sm" variant="outline" onclick={() => (tasks.panelOpen = true)}>
          <TerminalIcon class="size-3.5" />
          Show terminal
        </Button>
      {/if}
      <div class="text-xs text-muted-foreground flex items-start gap-1.5 ml-auto">
        <AlertTriangle class="size-3.5 text-amber-500 shrink-0 mt-0.5" />
        <span>All data on the selected drive is wiped.</span>
      </div>
    </div>
  </CardContent>
</Card>

<Dialog
  bind:open={flashConfirmOpen}
  title="Wipe and flash USB drive?"
  description={selectedDrive
    ? `Disk ${selectedDrive.diskNumber} — ${selectedDrive.friendlyName || selectedDrive.model || "USB"} (${formatBytes(selectedDrive.sizeBytes)})`
    : ""}
>
  <div class="text-sm space-y-3">
    <div class="flex items-start gap-3 px-3 py-2.5 rounded-md border bg-red-500/10 border-red-500/30">
      <AlertTriangle class="size-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
      <div class="text-xs text-foreground/90 leading-relaxed">
        Every partition and file on this disk will be deleted. This cannot be
        undone — make absolutely sure the right drive is selected before you
        continue.
      </div>
    </div>
    {#if selectedDrive}
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
        <span class="text-muted-foreground">Disk:</span>
        <span>{selectedDrive.diskNumber}</span>
        <span class="text-muted-foreground">Model:</span>
        <span>{selectedDrive.friendlyName || selectedDrive.model || "—"}</span>
        <span class="text-muted-foreground">Serial:</span>
        <span>{selectedDrive.serialNumber || "—"}</span>
        <span class="text-muted-foreground">Size:</span>
        <span>{formatBytes(selectedDrive.sizeBytes)}</span>
        <span class="text-muted-foreground">Bus:</span>
        <span>{selectedDrive.busType}</span>
      </div>
    {/if}
    <div class="text-xs text-muted-foreground">
      Source: <span class="font-mono text-foreground/80 break-all">{flashIsoPath}</span>
    </div>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (flashConfirmOpen = false)}>Cancel</Button>
    <Button onclick={flashUsb}>
      <Zap class="size-4" />
      Wipe and flash
    </Button>
  {/snippet}
</Dialog>

<XmlPreviewDialog
  bind:open={previewOpen}
  title="autounattend.xml preview"
  subtitle="Read-only preview of what will be written. Close and click 'Save' to write to disk."
  filename="autounattend.xml"
  xml={xmlPreview}
  {saving}
  onSave={async () => {
    previewOpen = false;
    await saveXml();
  }}
/>
