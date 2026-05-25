<script lang="ts">
  import { Card, Button, Badge, Dialog, PageHeader, SectionHeading, StatusHero, EmptyState, InfoBanner, ListCard, ListRow, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    KeyRound,
    ExternalLink,
    Terminal,
    Copy,
    Check,
    ShieldCheck,
    ShieldAlert,
  } from "@lucide/svelte";
  import {
    isTauri,
    launchActivationScript,
    type ActivationStatus,
  } from "$lib/tweaks/bridge";
  import { log } from "$lib/log.svelte";
  import { activationStatusResource } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";

  const PS_COMMAND = "irm https://get.activated.win | iex";
  const PROJECT_URL = "https://massgrave.dev/";

  const statusRes = activationStatusResource();
  const status = $derived<ActivationStatus | null>(statusRes.data ?? null);
  const loading = $derived(statusRes.loading);
  const refreshing = $derived(statusRes.revalidating);

  let confirmOpen = $state(false);
  let launching = $state(false);
  let copied = $state(false);

  async function reload() {
    invalidate("activation.status");
    await statusRes.refresh();
  }

  function askLaunch() {
    confirmOpen = true;
  }

  async function doLaunch() {
    confirmOpen = false;
    if (launching) return;
    launching = true;
    try {
      await launchActivationScript();
      log.info(
        "activation.launch",
        "MAS",
        "Launched external activation script in elevated PowerShell",
      );
      toast.success(
        "PowerShell opened",
        "Follow the menu in the new window — Reclaim does not control it.",
      );
    } catch (e) {
      const msg = String(e);
      if (msg.includes("UAC") || msg.includes("declined")) {
        toast.warning("UAC declined", "The activation script needs administrator rights.");
      } else {
        toast.error("Could not launch PowerShell", msg);
      }
      log.warn("activation.launch", "MAS", "Launch failed", msg);
    } finally {
      launching = false;
    }
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(PS_COMMAND);
      copied = true;
      toast.success("Copied", "PowerShell command copied to clipboard.");
      setTimeout(() => (copied = false), 2000);
    } catch (e) {
      toast.error("Copy failed", String(e));
    }
  }

  async function openExternal(url: string) {
    try {
      if (isTauri()) await openUrl(url);
      else window.open(url, "_blank");
    } catch (e) {
      toast.error("Could not open browser", String(e));
    }
  }

  const isLicensed = $derived(status?.licenseStatus === 1);
  const isUnlicensed = $derived(!!status && status.detected && status.licenseStatus !== 1);

  function shortenEdition(name: string): string {
    // The WMI Name field looks like "Windows(R) Operating System, RETAIL channel".
    // The Description is usually nicer ("Windows(R), Professional edition") — we
    // pick the shortest readable form for the headline.
    return name.replace(/\s+/g, " ").trim();
  }
</script>

<PageHeader
  title="Windows activation"
  description="Current license status, plus a one-click launcher for the open-source MAS activation script. Reclaim does not bundle the script — it runs directly from the upstream URL."
>
  {#snippet actions()}
    <Button variant="outline" onclick={reload} disabled={loading}>
      <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  {/snippet}
</PageHeader>

<!-- Disclaimer banner -->
<InfoBanner tone="warning" size="lg">
  <p class="font-semibold">Reclaim does not ship, bundle, or modify any activation script.</p>
  <p class="text-amber-900/90 dark:text-amber-200/90">
    The button below opens a new elevated PowerShell window that runs
    <code class="font-mono text-[12px] px-1 py-0.5 rounded bg-amber-500/20">irm https://get.activated.win | iex</code>
    — an open-source project (MAS) maintained at
    <button
      type="button"
      onclick={() => openExternal(PROJECT_URL)}
      class="underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-100"
    >massgrave.dev</button>. You're responsible for using it only on systems you own
    a license for. Microsoft Defender may flag activation tools; that is expected.
  </p>
</InfoBanner>

{#if !isTauri()}
  <EmptyState>Browser preview — activation detection needs the built app.</EmptyState>
{:else if loading}
  <EmptyState loading>Reading license state…</EmptyState>
{:else}
  <!-- Status hero card -->
  <StatusHero
    tone={isLicensed ? "success" : isUnlicensed ? "warning" : "default"}
    title={status?.detected
      ? shortenEdition(status.description || status.name) || "License detected"
      : "No license detected"}
  >
    {#snippet avatar()}
      {#if isLicensed}
        <ShieldCheck class="size-8" />
      {:else if isUnlicensed}
        <ShieldAlert class="size-8" />
      {:else}
        <KeyRound class="size-8" />
      {/if}
    {/snippet}
    {#snippet badges()}
      {#if status?.detected}
        {#if isLicensed}
          <Badge variant="success">{status.licenseStatusText}</Badge>
        {:else}
          <Badge variant="warning">{status.licenseStatusText}</Badge>
        {/if}
        {#if status.channel}
          <Badge variant="outline">{status.channel}</Badge>
        {/if}
      {/if}
    {/snippet}
    {#if !status?.detected}
      Windows did not report a license product. This is unusual — try Refresh.
    {:else if isLicensed}
      Windows reports the install as fully licensed. No activation action needed.
    {:else}
      License is present but not in the Licensed state — Windows may show a watermark or limit
      personalization until activated.
    {/if}
    {#snippet details()}
      {#if status?.detected}
        {#if status.partialKey}
          <dt class="text-muted-foreground sm:text-xs">Partial key</dt>
          <dd class="font-mono">XXXXX-XXXXX-XXXXX-XXXXX-{status.partialKey}</dd>
        {/if}
        {#if status.gracePeriodMinutes > 0}
          <dt class="text-muted-foreground sm:text-xs">Grace remaining</dt>
          <dd class="font-mono">{Math.round(status.gracePeriodMinutes / 60 / 24)} days</dd>
        {/if}
        <dt class="text-muted-foreground sm:text-xs">Status code</dt>
        <dd class="font-mono">{status.licenseStatus}</dd>
      {/if}
    {/snippet}
  </StatusHero>

  <!-- Launch card -->
  <SectionHeading title="Activation script" />
  <Card class="card-inset mb-6 py-0">
    <div class="px-5 py-4 space-y-4">
      <p class="text-xs text-muted-foreground leading-relaxed">
        Microsoft Activation Scripts (MAS) is an open-source project that exposes the standard
        Windows licensing methods: HWID (permanent, Win 10/11), KMS38 (until 2038), Ohook for
        Office, and TSforge. After launch, follow the on-screen menu — Reclaim has no further
        involvement.
      </p>

      <!-- Command preview -->
      <div class="rounded-lg border border-hairline-strong bg-surface-2 overflow-hidden">
        <div class="px-3 py-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 border-b border-hairline">
          <span class="flex items-center gap-1.5">
            <Terminal class="size-3" />
            PowerShell command
          </span>
          <button
            type="button"
            onclick={copyCommand}
            class="inline-flex items-center gap-1 text-[10px] font-medium normal-case tracking-normal text-muted-foreground hover:text-foreground transition-colors"
          >
            {#if copied}
              <Check class="size-3 text-success" />
              Copied
            {:else}
              <Copy class="size-3" />
              Copy
            {/if}
          </button>
        </div>
        <pre class="px-3 py-2.5 font-mono text-[12px] text-foreground/90 overflow-x-auto">{PS_COMMAND}</pre>
      </div>

      <InfoBanner>
        The button below triggers UAC, then opens a new elevated PowerShell window that runs the
        command above. You'll see the MAS menu in that window — press a number to choose a method.
        Close the PowerShell window when you're done.
      </InfoBanner>

      <div class="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onclick={() => openExternal(PROJECT_URL)}>
          <ExternalLink />
          Documentation
        </Button>
        <Button onclick={askLaunch} disabled={launching}>
          {#if launching}
            <Loader2 class="animate-spin" />
            Launching…
          {:else}
            <Terminal />
            Launch in PowerShell
          {/if}
        </Button>
      </div>
    </div>
  </Card>

  <!-- Methods reference -->
  <SectionHeading title="Methods at a glance" />
  <ListCard>
    <ListRow>
      <Badge variant="default" class="shrink-0 mt-0.5">HWID</Badge>
      <div class="text-xs text-muted-foreground leading-relaxed flex-1">
        <span class="font-medium text-foreground">Windows 10 / 11 — permanent.</span>
        Ties activation to the machine's hardware ID via Microsoft's servers. Survives reinstalls
        on the same hardware. Needs internet.
      </div>
    </ListRow>
    <ListRow>
      <Badge variant="default" class="shrink-0 mt-0.5">KMS38</Badge>
      <div class="text-xs text-muted-foreground leading-relaxed flex-1">
        <span class="font-medium text-foreground">Windows / Server — until 2038.</span>
        Local KMS variant that grants a license valid through January 2038. No internet required
        after activation.
      </div>
    </ListRow>
    <ListRow>
      <Badge variant="default" class="shrink-0 mt-0.5">Ohook</Badge>
      <div class="text-xs text-muted-foreground leading-relaxed flex-1">
        <span class="font-medium text-foreground">Office — permanent.</span>
        Hooks a single Office DLL to skip the license check. Works offline.
      </div>
    </ListRow>
    <ListRow>
      <Badge variant="default" class="shrink-0 mt-0.5">TSforge</Badge>
      <div class="text-xs text-muted-foreground leading-relaxed flex-1">
        <span class="font-medium text-foreground">Windows / Office — permanent.</span>
        Newest method (build 19041+). Activates ESU, Server, and most Office SKUs.
      </div>
    </ListRow>
    <ListRow>
      <Badge variant="outline" class="shrink-0 mt-0.5">Online KMS</Badge>
      <div class="text-xs text-muted-foreground leading-relaxed flex-1">
        <span class="font-medium text-foreground">Windows / Office — 180 days, renewable.</span>
        Uses public KMS servers. Renews automatically while the network reaches them.
      </div>
    </ListRow>
  </ListCard>
{/if}

<Dialog
  bind:open={confirmOpen}
  title="Launch external activation script?"
  description="A new PowerShell window will open after the UAC prompt. It will download and run an external script from get.activated.win. Reclaim does not control what runs in that window."
>
  <InfoBanner tone="warning">
    Only proceed on systems you own a Windows / Office license for. Microsoft Defender may
    quarantine the script — that is expected behavior for activation tools.
  </InfoBanner>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
    <Button onclick={doLaunch}>
      <Terminal />
      Launch PowerShell
    </Button>
  {/snippet}
</Dialog>
